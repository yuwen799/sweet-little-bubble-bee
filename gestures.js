// ============================================================
//  手势识别：输入 MediaPipe 的 21 个手部关键点，输出动作名
//  动作名：'spin' | 'sit' | 'leave' | 'come' | 'pet' | 'roll'
//         | 'shake' | 'dead' | 'lie' | 'praise'
//  关键点坐标需要已经左右镜像（x = 1 - x），和用户看到的方向一致。
// ============================================================

const TIP = [4, 8, 12, 16, 20];
const PIP = [3, 6, 10, 14, 18];

export const POSE_LABEL = {
  point: '☝️ 单指',
  gun: '👉 手枪',
  two: '✌️ 两指',
  open: '🖐 张开手掌',
  fist: '✊ 握拳',
  thumb: '👍 大拇指',
  other: '🤚 其他',
};

const DEFAULTS = {
  cooldown: 1100,
  circleTurns: 0.8,
  circleMinRadius: 0.03,
  sitMinDrop: 0.11,
  pushRatio: 1.28,
  pullRatio: 0.78,
  petSwings: 2,
  petMinAmplitude: 0.035,
  petRepeat: 450,   // 一直在摸时，多久再发一次 'pet'
  flipMs: 900,      // 多长时间内翻完手算数
  shakeSwings: 2,   // 握手：上下抖几次
  shakeMinAmplitude: 0.03,
  bangMinRise: 0.06, // 装死：手枪往上甩多少
  lieHoldMs: 700,   // 趴下：握拳停多久
  praiseHoldMs: 450, // 被夸：大拇指停多久
};

// 距离带上 z（深度），手指对着摄像头时也不容易误判成弯曲
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** 这段样本里手是不是翻过面（翻手时不判断推/收/摸/握手） */
const flipped = (run) => run.some((s) => s.facing === 1) && run.some((s) => s.facing === -1);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const range = (arr) => Math.max(...arr) - Math.min(...arr);

/** 数来回摆动的“掉头”次数：往一个方向走够 amp 后又往回走够 amp，算一次 */
function countSwings(vals, amp) {
  let dir = 0;
  let lo = vals[0];
  let hi = vals[0];
  let extreme = vals[0];
  let swings = 0;
  for (const v of vals) {
    if (dir === 0) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      if (v - lo > amp) { dir = 1; extreme = v; }
      else if (hi - v > amp) { dir = -1; extreme = v; }
    } else if (dir === 1) {
      if (v > extreme) extreme = v;
      else if (extreme - v > amp) { swings++; dir = -1; extreme = v; }
    } else {
      if (v < extreme) extreme = v;
      else if (v - extreme > amp) { swings++; dir = 1; extreme = v; }
    }
  }
  return swings;
}

/** 食指、中指、无名指、小指是否伸直 */
export function fingerStates(lm) {
  const w = lm[0];
  return [1, 2, 3, 4].map((f) => dist(lm[TIP[f]], w) > dist(lm[PIP[f]], w) * 1.15);
}

/** 大拇指：{ out: 是否翘出来, up: 是否朝上 } */
export function thumbState(lm) {
  const size = dist(lm[0], lm[9]) || 1;
  const out = dist(lm[4], lm[9]) > size * 0.7;
  const up = lm[4].y < lm[5].y - size * 0.3;
  return { out, up };
}

/** 判断手型 */
export function classifyPose(lm) {
  const [i, m, r, p] = fingerStates(lm);
  if (i && m && r && p) return 'open';
  if (i && m && !r && !p) return 'two';
  if (i && !m && !r && !p) return thumbState(lm).out ? 'gun' : 'point';
  if (!i && !m && !r && !p) {
    const th = thumbState(lm);
    if (th.out && th.up) return 'thumb';
    return th.out ? 'other' : 'fist';
  }
  return 'other';
}

export class GestureDetector {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.hist = [];
    this.cooldownUntil = 0;
    this.holdLock = null; // “停住”类手势触发后，换手型之前不再触发
  }

  reset() {
    this.hist = [];
  }

  /**
   * @param lm  21 个关键点（已镜像），没看到手传 null
   * @param t   当前时间（毫秒）
   * @returns {{pose: string|null, gesture: string|null}}
   */
  update(lm, t) {
    if (!lm) {
      this.hist = [];
      this.holdLock = null;
      return { pose: null, gesture: null };
    }
    const pose = classifyPose(lm);
    if (this.holdLock && pose !== this.holdLock) this.holdLock = null;
    const palmPts = [0, 5, 9, 13, 17].map((k) => lm[k]);
    const palm = {
      x: palmPts.reduce((s, p) => s + p.x, 0) / 5,
      y: palmPts.reduce((s, p) => s + p.y, 0) / 5,
    };
    // 手的大小：手腕到中指根。翻手时这段长度基本不变，不会被误认成“推/收”
    const size = dist2d(lm[0], lm[9]);
    // 手心朝向：手腕→食指根 与 手腕→小指根 的叉积正负，翻手时会变号
    const v1 = { x: lm[5].x - lm[0].x, y: lm[5].y - lm[0].y };
    const v2 = { x: lm[17].x - lm[0].x, y: lm[17].y - lm[0].y };
    const sin = (v1.x * v2.y - v1.y * v2.x) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    const facing = sin > 0.3 ? 1 : sin < -0.3 ? -1 : 0;
    this.hist.push({ t, pose, tip: { x: lm[8].x, y: lm[8].y }, tip2: mid(lm[8], lm[12]), palm, size, facing });
    while (this.hist.length && this.hist[0].t < t - 2000) this.hist.shift();

    if (t < this.cooldownUntil) return { pose, gesture: null };

    const g = this.detectCircle(t) || this.detectBang(t) || this.detectSit(t) || this.detectFlip(t) ||
      this.detectPushPull(t) || this.detectShake(t) || this.detectPet(t) ||
      this.detectHold(t, 'fist', this.o.lieHoldMs, 'lie') ||
      this.detectHold(t, 'thumb', this.o.praiseHoldMs, 'praise');
    if (g) {
      if (g === 'pet') {
        this.cooldownUntil = t + this.o.petRepeat;
      } else {
        this.cooldownUntil = t + this.o.cooldown;
        this.hist = [];
      }
    }
    return { pose, gesture: g };
  }

  /** 从最新往回取一段同手型的连续样本（允许偶尔 2 帧识别抖动）。pose 可以是数组 */
  recentRun(pose, ms, t) {
    const ok = Array.isArray(pose) ? (p) => pose.includes(p) : (p) => p === pose;
    const out = [];
    let miss = 0;
    for (let k = this.hist.length - 1; k >= 0; k--) {
      const s = this.hist[k];
      if (s.t < t - ms) break;
      if (ok(s.pose)) out.push(s);
      else if (++miss > 2) break;
    }
    return out.reverse();
  }

  // ① 食指画圈 → 转圈（单指、手枪都行）
  detectCircle(t) {
    const run = this.recentRun(['point', 'gun'], 1600, t);
    if (run.length < 10 || run[run.length - 1].t - run[0].t < 350) return null;
    const cx = run.reduce((s, p) => s + p.tip.x, 0) / run.length;
    const cy = run.reduce((s, p) => s + p.tip.y, 0) / run.length;
    const r = run.reduce((s, p) => s + Math.hypot(p.tip.x - cx, p.tip.y - cy), 0) / run.length;
    if (r < this.o.circleMinRadius) return null;
    let total = 0;
    let prev = Math.atan2(run[0].tip.y - cy, run[0].tip.x - cx);
    for (let k = 1; k < run.length; k++) {
      const a = Math.atan2(run[k].tip.y - cy, run[k].tip.x - cx);
      let d = a - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      total += d;
      prev = a;
    }
    return Math.abs(total) >= this.o.circleTurns * 2 * Math.PI ? 'spin' : null;
  }

  // ⑧ 比手枪，先瞄准停一下，再往上一甩 → 装死
  detectBang(t) {
    const run = this.recentRun('gun', 1100, t);
    if (run.length < 6) return null;
    const seg = run.filter((s) => s.t >= t - 300);
    const pre = run.filter((s) => s.t < t - 300);
    if (pre.length < 4 || pre[pre.length - 1].t - pre[0].t < 200) return null;
    // 瞄准阶段要稳（画圈时手一直在动，不会误判）
    if (range(pre.map((s) => s.tip.x)) > 0.04 || range(pre.map((s) => s.tip.y)) > 0.04) return null;
    const aim = pre[pre.length - 1].tip;
    const top = seg.reduce((a, s) => (s.tip.y < a.y ? s.tip : a), aim);
    const rise = aim.y - top.y; // y 向下为正，往上甩 = y 变小
    return rise >= this.o.bangMinRise && Math.abs(top.x - aim.x) <= rise * 0.8 ? 'dead' : null;
  }

  // ② 两指往下滑 → 坐下
  detectSit(t) {
    const run = this.recentRun('two', 700, t);
    if (run.length < 4) return null;
    let top = run[0];
    for (const s of run) if (s.tip2.y < top.tip2.y) top = s;
    const last = run[run.length - 1];
    const dy = last.tip2.y - top.tip2.y; // 图像坐标 y 向下为正
    const dx = Math.abs(last.tip2.x - top.tip2.x);
    return dy >= this.o.sitMinDrop && dx <= dy * 0.7 ? 'sit' : null;
  }

  // ⑥ 手掌翻过来（手心↔手背）→ 翻肚皮
  detectFlip(t) {
    const last = this.hist[this.hist.length - 1];
    if (!last || last.pose !== 'open' || last.facing === 0) return null;
    for (let k = this.hist.length - 2; k >= 0; k--) {
      const s = this.hist[k];
      if (s.t < t - this.o.flipMs) break;
      if (s.pose === 'open' && s.facing === -last.facing) return 'roll';
    }
    return null;
  }

  // ③ 手掌推出去 → 走开；④ 手掌收回来 → 跑过来
  detectPushPull(t) {
    const run = this.recentRun('open', 700, t);
    if (run.length < 4 || flipped(run)) return null;
    const base = Math.min(...run.slice(0, 3).map((s) => s.size));
    const baseMax = Math.max(...run.slice(0, 3).map((s) => s.size));
    const now = run[run.length - 1].size;
    if (now / base >= this.o.pushRatio) return 'leave';
    if (now / baseMax <= this.o.pullRatio) return 'come';
    return null;
  }

  /** 张开手掌来回摆的公共判断：axis='x' 左右摆，'y' 上下抖 */
  swingRun(t, axis, amp, need) {
    const run = this.recentRun('open', 1400, t);
    if (run.length < 8 || flipped(run)) return false;
    const sizes = run.map((s) => s.size);
    if (Math.max(...sizes) / Math.min(...sizes) > 1.2) return false; // 手在前后移动，不算
    const xs = run.map((s) => s.palm.x);
    const ys = run.map((s) => s.palm.y);
    const [main, cross] = axis === 'x' ? [xs, ys] : [ys, xs];
    if (range(cross) > range(main) * 0.8) return false; // 另一个方向动得更多，不算
    return countSwings(main, amp) >= need;
  }

  // ⑦ 手掌上下抖 → 握手
  detectShake(t) {
    return this.swingRun(t, 'y', this.o.shakeMinAmplitude, this.o.shakeSwings) ? 'shake' : null;
  }

  // ⑤ 手掌左右摆 → 摸头
  detectPet(t) {
    return this.swingRun(t, 'x', this.o.petMinAmplitude, this.o.petSwings) ? 'pet' : null;
  }

  // ⑨ 握拳停住 → 趴下；⑩ 竖大拇指停住 → 被夸。一直停着只触发一次
  detectHold(t, pose, ms, gesture) {
    if (this.holdLock === pose) return null;
    const run = this.recentRun(pose, ms + 400, t);
    if (run.length < 4 || run[run.length - 1].t - run[0].t < ms) return null;
    const recent = run.filter((s) => s.t >= t - ms);
    if (range(recent.map((s) => s.palm.x)) > 0.05 || range(recent.map((s) => s.palm.y)) > 0.05) return null;
    this.holdLock = pose;
    return gesture;
  }
}
