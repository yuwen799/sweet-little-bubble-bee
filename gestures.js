// ============================================================
//  手势识别：输入 MediaPipe 的 21 个手部关键点，输出动作名
//  动作名：'spin' | 'sit' | 'leave' | 'come' | 'pet'
//         | 'shake' | 'dead' | 'praise' | 'fetch' | 'kiss'
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
  pinch: '🤏 捏住',
  other: '🤚 其他',
};

const DEFAULTS = {
  cooldown: 1100,
  circleTurns: 0.8,
  circleMinRadius: 0.03,
  sitMinDrop: 0.11,
  swipeMinDist: 0.18, // 走开：食指往旁边划多远
  pullRatio: 0.78,
  petSwings: 2,
  petMinAmplitude: 0.035,
  petRepeat: 450,     // 一直在摸时，多久再发一次 'pet'
  shakeSwings: 2,     // 握手：拳头上下晃几次
  shakeMinAmplitude: 0.03,
  shakeHoldMs: 500,   // 握手：握拳停住多久
  bangMinRise: 0.06,  // 装死：两只手枪往上甩多少
  bangAimMs: 250,     // 装死：甩之前两只手要停稳多久
  praiseHoldMs: 450,  // 被夸：大拇指停多久
  throwMinDist: 0.1,  // 扔球：松手时手要甩出去多远
  heartHoldMs: 300,   // 比心：停多久
};

// 距离带上 z（深度），手指对着摄像头时也不容易误判成弯曲
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** 这段样本里手是不是翻过面（翻手时不判断收手掌、摆手） */
const flipped = (run) => run.some((s) => s.facing === 1) && run.some((s) => s.facing === -1);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const range = (arr) => Math.max(...arr) - Math.min(...arr);
const GUNS = ['gun', 'point']; // 拇指不一定看得清，单指也算手枪
// 双手装死时允许的手型：食指对着摄像头时常被看成「竖拇指」（用户真机反馈），所以也算上
const BANG_POSES = ['gun', 'point', 'thumb'];

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

/** 是否捏住：拇指尖和食指尖碰在一起，而且食指尖没有缩进掌心（排除握拳） */
export function isPinch(lm) {
  const size = dist(lm[0], lm[9]) || 1;
  return dist(lm[4], lm[8]) < size * 0.3 && dist(lm[8], lm[0]) > dist(lm[5], lm[0]) * 1.1;
}

/** 判断手型 */
export function classifyPose(lm) {
  if (isPinch(lm)) return 'pinch';
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
    this.freshUntil = 0;  // 触发一个动作后，冷却期间的手部动作不算进下一个手势
    this.holdLock = null; // “停住”类手势触发后，换手型之前不再触发
  }

  reset() {
    this.hist = [];
  }

  /**
   * @param lm    主手的 21 个关键点（已镜像），没看到手传 null
   * @param t     当前时间（毫秒）
   * @param other 另一只手的 21 个关键点（已镜像），没有就传 null。双手比心、双手手枪用到
   * @returns {{pose: string|null, gesture: string|null}}
   */
  update(lm, t, other = null) {
    if (!lm) {
      this.hist = [];
      this.holdLock = null;
      this.heartStart = null;
      this.heartLock = false;
      return { pose: null, gesture: null };
    }
    const pose = classifyPose(lm);
    if (this.holdLock && pose !== this.holdLock) this.holdLock = null;
    const palmPts = [0, 5, 9, 13, 17].map((k) => lm[k]);
    const palm = {
      x: palmPts.reduce((s, p) => s + p.x, 0) / 5,
      y: palmPts.reduce((s, p) => s + p.y, 0) / 5,
    };
    // 手的大小：手腕到中指根。翻手时这段长度基本不变
    const size = dist2d(lm[0], lm[9]);
    // 手心朝向：手腕→食指根 与 手腕→小指根 的叉积正负，翻手时会变号（用来排除翻手动作）
    const v1 = { x: lm[5].x - lm[0].x, y: lm[5].y - lm[0].y };
    const v2 = { x: lm[17].x - lm[0].x, y: lm[17].y - lm[0].y };
    const sin = (v1.x * v2.y - v1.y * v2.x) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
    const facing = sin > 0.3 ? 1 : sin < -0.3 ? -1 : 0;
    // 另一只手：手型和食指尖（双手手枪用）
    const oPose = other ? classifyPose(other) : null;
    const oTip = other ? { x: other[8].x, y: other[8].y } : null;
    this.hist.push({
      t, pose, tip: { x: lm[8].x, y: lm[8].y }, tip2: mid(lm[8], lm[12]), palm, size, facing, oPose, oTip,
    });
    while (this.hist.length && this.hist[0].t < t - 2000) this.hist.shift();

    const heart = this.trackHeart(lm, other, t);

    if (t < this.freshUntil) this.hist = this.hist.slice(-1);
    if (t < this.cooldownUntil) return { pose, gesture: null };

    // 双手比枪模式：最近 0.8 秒里两只手都在比枪（含被看成单指/竖拇指），就只认装死和比心，
    // 单手手势全部暂停。摄像头偶尔会丢掉另一只手几帧，用 0.8 秒的窗口兜住（用户真机反馈：装死时误认成画圈、被夸）
    const twoGuns = this.hist.some((s) => s.t >= t - 800 && BANG_POSES.includes(s.pose) && BANG_POSES.includes(s.oPose));
    if (twoGuns) {
      const g2 = heart || this.detectBang(t);
      if (g2) this.fire(g2, t, pose);
      return { pose, gesture: g2 };
    }

    const g = heart || this.detectBang(t) || this.detectThrow(t) || this.detectCircle(t) ||
      this.detectSwipe(t) || this.detectSit(t) || this.detectPull(t) || this.detectShake(t) ||
      this.detectPet(t) ||
      this.detectHold(t, 'fist', this.o.shakeHoldMs, 'shake') ||
      this.detectHold(t, 'thumb', this.o.praiseHoldMs, 'praise', true);
    if (g) this.fire(g, t, pose);
    return { pose, gesture: g };
  }

  /** 触发动作后：进入冷却，清掉历史 */
  fire(g, t, pose) {
    if (g === 'pet') {
      this.cooldownUntil = t + this.o.petRepeat;
      return;
    }
    this.cooldownUntil = t + this.o.cooldown;
    this.freshUntil = this.cooldownUntil;
    this.hist = [];
    // 晃完拳头握手后还握着拳，不要接着再触发一次「握拳停住 = 握手」
    if (g === 'shake') this.holdLock = pose;
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

  // ⑩ 双手比心：两只食指尖碰在一起、两只拇指尖碰在一起，停一下 → 亲亲。一直比着只触发一次
  trackHeart(a, b, t) {
    const size = dist2d(a[0], a[9]) || 1;
    const ok = !!b &&
      dist2d(a[0], b[0]) > size * 0.5 &&      // 确实是两只不同的手（两个手腕分开）
      dist2d(a[8], b[8]) < size * 0.5 &&      // 食指尖碰在一起
      dist2d(a[4], b[4]) < size * 0.5;        // 拇指尖碰在一起
    if (!ok) {
      this.heartStart = null;
      this.heartLock = false;
      return null;
    }
    if (this.heartStart == null) this.heartStart = t;
    if (this.heartLock || t - this.heartStart < this.o.heartHoldMs || t < this.cooldownUntil) return null;
    this.heartLock = true;
    return 'kiss';
  }

  // ⑦ 两只手都比手枪：先瞄准停稳 → 再快速一起往上甩 → 装死
  //   以前是单手手枪，老和食指画圈互相误认，用户改成双手。
  //   用户真机反馈：双手刚举起来摆姿势还没甩就装死了 → 现在要求先停稳，再在 300ms 内快速上甩
  detectBang(t) {
    const both = (s) => BANG_POSES.includes(s.pose) && BANG_POSES.includes(s.oPose);
    const last = this.hist[this.hist.length - 1];
    if (!last || !both(last)) return null;
    // 瞄准阶段：300ms 之前的那一段，两只手都要停稳
    const pre = this.hist.filter((s) => s.t < t - 300 && s.t >= t - 300 - this.o.bangAimMs - 200 && both(s));
    if (pre.length < 5 || pre[pre.length - 1].t - pre[0].t < this.o.bangAimMs) return null;
    const steady = (pick) => range(pre.map((s) => pick(s).x)) <= 0.04 && range(pre.map((s) => pick(s).y)) <= 0.04;
    if (!steady((s) => s.tip) || !steady((s) => s.oTip)) return null;
    // 最近 300ms 内：两只手都从瞄准位置往上甩够距离（y 向下为正，往上 = y 变小）
    const aim = pre[pre.length - 1];
    const rose = (pick) => {
      const rise = pick(aim).y - pick(last).y;
      return rise >= this.o.bangMinRise && Math.abs(pick(last).x - pick(aim).x) <= rise * 0.8;
    };
    return rose((s) => s.tip) && rose((s) => s.oTip) ? 'dead' : null;
  }

  // ⑨ 捏住（像捏着球）→ 松手的同时往外甩 → 扔球
  detectThrow(t) {
    const h = this.hist;
    const last = h[h.length - 1];
    if (!last || last.pose === 'pinch') return null;
    // 找最近一次“捏住”的最后一帧，要在 300ms 内刚松开
    let k = h.length - 2;
    while (k >= 0 && h[k].pose !== 'pinch' && h[k].t >= t - 300) k--;
    if (k < 0 || h[k].pose !== 'pinch' || h[k].t < t - 300) return null;
    const release = h[k];
    // 之前要捏住一小会儿（≥150ms）
    let j = k;
    while (j > 0 && h[j - 1].pose === 'pinch') j--;
    if (release.t - h[j].t < 150) return null;
    // 松手前后这一小段，手要甩出去够远
    const from = h.filter((s) => s.t >= release.t - 150 && s.t <= release.t);
    const start = from[0].palm;
    const moved = Math.hypot(last.palm.x - start.x, last.palm.y - start.y);
    return moved >= this.o.throwMinDist ? 'fetch' : null;
  }

  // ① 食指画圈 → 转圈（单指、手枪都行）
  detectCircle(t) {
    const run = this.recentRun(GUNS, 1600, t);
    if (run.length < 10 || run[run.length - 1].t - run[0].t < 350) return null;
    const cx = run.reduce((s, p) => s + p.tip.x, 0) / run.length;
    const cy = run.reduce((s, p) => s + p.tip.y, 0) / run.length;
    const radii = run.map((p) => Math.hypot(p.tip.x - cx, p.tip.y - cy));
    const r = radii.reduce((s, v) => s + v, 0) / run.length;
    if (r < this.o.circleMinRadius) return null;
    // 真的在画圈：手指一直绕着中心走，很少经过中心附近。
    // 直上直下来回甩（比如装死的上甩再落下）会穿过中心，角度一下跳半圈，以前会被误算成转圈
    if (radii.filter((v) => v < r * 0.4).length > run.length * 0.15) return null;
    let total = 0;
    let jumps = 0;
    let prev = Math.atan2(run[0].tip.y - cy, run[0].tip.x - cx);
    for (let k = 1; k < run.length; k++) {
      const a = Math.atan2(run[k].tip.y - cy, run[k].tip.x - cx);
      let d = a - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) > Math.PI / 2) jumps++; // 一帧转了超过 1/4 圈 = 穿过中心，不是在画圈
      else total += d;
      prev = a;
    }
    if (jumps > 1) return null;
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

  // ③ 食指往旁边快速一划（「去那边」）→ 走开
  //   以前是「手掌往屏幕推」，但摆手、翻手时手会靠近摄像头变大，老被误认（用户真机反馈），所以换掉了
  detectSwipe(t) {
    const run = this.recentRun(GUNS, 450, t);
    if (run.length < 5) return null;
    const a = run[0].tip;
    const b = run[run.length - 1].tip;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let path = 0;
    for (let k = 1; k < run.length; k++) path += dist2d(run[k].tip, run[k - 1].tip);
    const straight = Math.abs(dx) / (path || 1); // 走直线 ≈ 1，画弧线明显小于 1
    return Math.abs(dx) >= this.o.swipeMinDist && Math.abs(dy) <= Math.abs(dx) * 0.4 && straight >= 0.8
      ? 'leave' : null;
  }

  // ④ 手掌往回收（手在画面里变小）→ 跑过来
  //   main.js 只在狗走远时才用这个手势，平时忽略，减少误触发
  detectPull(t) {
    const run = this.recentRun('open', 700, t);
    if (run.length < 4 || flipped(run)) return null;
    // 手掌位置基本不动（左右摆时手会大幅移动，不算）
    if (range(run.map((s) => s.palm.x)) > 0.12 || range(run.map((s) => s.palm.y)) > 0.12) return null;
    const baseMax = Math.max(...run.slice(0, 3).map((s) => s.size));
    const now = run[run.length - 1].size;
    return now / baseMax <= this.o.pullRatio ? 'come' : null;
  }

  /** 来回摆的公共判断：axis='x' 左右摆，'y' 上下晃 */
  swingRun(t, axis, amp, need, poses = 'open') {
    const run = this.recentRun(poses, 1400, t);
    if (run.length < 8 || flipped(run)) return false;
    const sizes = run.map((s) => s.size);
    if (Math.max(...sizes) / Math.min(...sizes) > 1.2) return false; // 手在前后移动，不算
    const xs = run.map((s) => s.palm.x);
    const ys = run.map((s) => s.palm.y);
    const [main, cross] = axis === 'x' ? [xs, ys] : [ys, xs];
    if (range(cross) > range(main) * 0.8) return false; // 另一个方向动得更多，不算
    return countSwings(main, amp) >= need;
  }

  // ⑥ 握拳上下晃（像握着狗爪晃）→ 握手。拇指翘在拳头上面也算。握拳停住也是握手（见 detectHold）
  detectShake(t) {
    return this.swingRun(t, 'y', this.o.shakeMinAmplitude, this.o.shakeSwings, ['fist', 'thumb'])
      ? 'shake' : null;
  }

  // ⑤ 手掌左右摆 → 摸头
  detectPet(t) {
    return this.swingRun(t, 'x', this.o.petMinAmplitude, this.o.petSwings) ? 'pet' : null;
  }

  // 停住类：握拳停住 → 握手；竖大拇指停住 → 被夸。一直停着只触发一次
  //   singleHand：另一只手在比手枪/竖拇指时不算（用户真机反馈：双手比枪时偶尔被认成竖拇指 → 误触发被夸）
  detectHold(t, pose, ms, gesture, singleHand = false) {
    if (this.holdLock === pose) return null;
    const run = this.recentRun(pose, ms + 400, t);
    if (run.length < 4 || run[run.length - 1].t - run[0].t < ms) return null;
    if (singleHand && run.some((s) => BANG_POSES.includes(s.oPose))) return null;
    const recent = run.filter((s) => s.t >= t - ms);
    if (range(recent.map((s) => s.palm.x)) > 0.05 || range(recent.map((s) => s.palm.y)) > 0.05) return null;
    this.holdLock = pose;
    return gesture;
  }
}
