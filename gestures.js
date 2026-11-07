// ============================================================
//  手势识别：输入 MediaPipe 的 21 个手部关键点，输出动作名
//  动作名：'spin' | 'sit' | 'leave' | 'come' | 'pet' | 'roll'
//  关键点坐标需要已经左右镜像（x = 1 - x），和用户看到的方向一致。
// ============================================================

const TIP = [4, 8, 12, 16, 20];
const PIP = [3, 6, 10, 14, 18];

export const POSE_LABEL = {
  point: '☝️ 单指',
  two: '✌️ 两指',
  open: '🖐 张开手掌',
  fist: '✊ 握拳',
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
  petRepeat: 450, // 一直在摸时，多久再发一次 'pet'
  flipMs: 900,    // 多长时间内翻完手算数
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** 这段样本里手是不是翻过面（翻手时不判断推/收/摸） */
const flipped = (run) => run.some((s) => s.facing === 1) && run.some((s) => s.facing === -1);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 食指、中指、无名指、小指是否伸直 */
export function fingerStates(lm) {
  const w = lm[0];
  return [1, 2, 3, 4].map((f) => dist(lm[TIP[f]], w) > dist(lm[PIP[f]], w) * 1.15);
}

/** 判断手型 */
export function classifyPose(lm) {
  const [i, m, r, p] = fingerStates(lm);
  if (i && m && r && p) return 'open';
  if (i && m && !r && !p) return 'two';
  if (i && !m && !r && !p) return 'point';
  if (!i && !m && !r && !p) return 'fist';
  return 'other';
}

export class GestureDetector {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.hist = [];
    this.cooldownUntil = 0;
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
      return { pose: null, gesture: null };
    }
    const pose = classifyPose(lm);
    const palmPts = [0, 5, 9, 13, 17].map((k) => lm[k]);
    const palm = {
      x: palmPts.reduce((s, p) => s + p.x, 0) / 5,
      y: palmPts.reduce((s, p) => s + p.y, 0) / 5,
    };
    // 手的大小：手腕到中指根。翻手时这段长度基本不变，不会被误认成“推/收”
    const size = dist(lm[0], lm[9]);
    // 手心朝向：手腕→食指根 与 手腕→小指根 的叉积正负，翻手时会变号
    const v1 = { x: lm[5].x - lm[0].x, y: lm[5].y - lm[0].y };
    const v2 = { x: lm[17].x - lm[0].x, y: lm[17].y - lm[0].y };
    const sin = (v1.x * v2.y - v1.y * v2.x) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    const facing = sin > 0.3 ? 1 : sin < -0.3 ? -1 : 0;
    this.hist.push({ t, pose, tip: { x: lm[8].x, y: lm[8].y }, tip2: mid(lm[8], lm[12]), palm, size, facing });
    while (this.hist.length && this.hist[0].t < t - 2000) this.hist.shift();

    if (t < this.cooldownUntil) return { pose, gesture: null };

    const g = this.detectCircle(t) || this.detectSit(t) || this.detectFlip(t) ||
      this.detectPushPull(t) || this.detectPet(t);
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

  /** 从最新往回取一段同手型的连续样本（允许偶尔 2 帧识别抖动） */
  recentRun(pose, ms, t) {
    const out = [];
    let miss = 0;
    for (let k = this.hist.length - 1; k >= 0; k--) {
      const s = this.hist[k];
      if (s.t < t - ms) break;
      if (s.pose === pose) out.push(s);
      else if (++miss > 2) break;
    }
    return out.reverse();
  }

  // ① 食指画圈 → 转圈
  detectCircle(t) {
    const run = this.recentRun('point', 1600, t);
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

  // ⑤ 手掌左右平滑摆动 → 摸头
  detectPet(t) {
    const run = this.recentRun('open', 1400, t);
    if (run.length < 8 || flipped(run)) return null;
    const sizes = run.map((s) => s.size);
    if (Math.max(...sizes) / Math.min(...sizes) > 1.2) return null; // 手在前后移动，不算摸头
    const xs = run.map((s) => s.palm.x);
    const ys = run.map((s) => s.palm.y);
    const xRange = Math.max(...xs) - Math.min(...xs);
    const yRange = Math.max(...ys) - Math.min(...ys);
    if (yRange > xRange * 0.8) return null; // 上下动得比左右多，不算

    const amp = this.o.petMinAmplitude;
    // 数“掉头”次数：往右走够 amp 后又往左走够 amp，算一次
    let dir = 0;
    let lo = xs[0];
    let hi = xs[0];
    let extreme = xs[0];
    let swings = 0;
    for (const x of xs) {
      if (dir === 0) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
        if (x - lo > amp) { dir = 1; extreme = x; }
        else if (hi - x > amp) { dir = -1; extreme = x; }
      } else if (dir === 1) {
        if (x > extreme) extreme = x;
        else if (extreme - x > amp) { swings++; dir = -1; extreme = x; }
      } else {
        if (x < extreme) extreme = x;
        else if (x - extreme > amp) { swings++; dir = 1; extreme = x; }
      }
    }
    return swings >= this.o.petSwings ? 'pet' : null;
  }
}
