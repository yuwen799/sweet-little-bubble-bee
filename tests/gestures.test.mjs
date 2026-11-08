// 手势识别测试：用模拟的手部关键点检查每个手势能不能认对、会不会误触发。
// 运行：node tests/gestures.test.mjs （在项目根目录下）

import { GestureDetector, classifyPose } from '../gestures.js';
import { CONFIG } from '../config.js';

// 手型 → [食指, 中指, 无名指, 小指] 是否伸直，以及大拇指位置
const SHAPES = {
  open:  { ext: [1, 1, 1, 1], thumb: 'out' },
  two:   { ext: [1, 1, 0, 0], thumb: 'in' },
  point: { ext: [1, 0, 0, 0], thumb: 'in' },
  gun:   { ext: [1, 0, 0, 0], thumb: 'out' },
  fist:  { ext: [0, 0, 0, 0], thumb: 'in' },
  thumb: { ext: [0, 0, 0, 0], thumb: 'up' },
};
const THUMB = { // [第一关节 lm3, 指尖 lm4]
  in:  [[-0.03, 0.05], [0.0, 0.04]],
  out: [[-0.08, 0.01], [-0.10, -0.02]],
  up:  [[-0.05, -0.03], [-0.05, -0.07]],
};

/** 合成 21 个关键点。(cx,cy)=手的位置，s=大小，c=手心朝向（1 手心，-1 手背，中间=翻到一半） */
function hand(pose, cx, cy, s = 1, c = 1) {
  const { ext, thumb } = SHAPES[pose];
  const P = (x, y) => ({ x: cx + x * c * s, y: cy + y * s, z: 0 });
  const lm = new Array(21);
  lm[0] = P(0, 0.12); lm[1] = P(-0.04, 0.09); lm[2] = P(-0.06, 0.06);
  lm[3] = P(...THUMB[thumb][0]); lm[4] = P(...THUMB[thumb][1]);
  const xs = [-0.03, -0.01, 0.01, 0.03];
  for (let f = 0; f < 4; f++) {
    const b = 5 + f * 4, x = xs[f];
    lm[b] = P(x, 0.03);
    if (ext[f]) { lm[b+1] = P(x, -0.01); lm[b+2] = P(x, -0.04); lm[b+3] = P(x, -0.07); }
    else { lm[b+1] = P(x, 0.0); lm[b+2] = P(x, 0.03); lm[b+3] = P(x, 0.05); }
  }
  return lm;
}
// 让食指尖（而不是手腕）落在 (tx,ty)
const at = (pose, tx, ty, s = 1, c = 1) => hand(pose, tx + 0.03 * s * c, ty + 0.07 * s, s, c);

/** 以 30fps 喂 ms 毫秒的帧，frames(u) 的 u 从 0 走到 1 */
function run(frames, ms) {
  const d = new GestureDetector(CONFIG.gestures);
  const got = [];
  const n = Math.round(ms / 33);
  for (let i = 0; i <= n; i++) {
    const t = 1000 + i * 33;
    const out = d.update(frames(i / n, t), t);
    if (out.gesture) got.push(out.gesture);
  }
  return got;
}

let fail = 0;
for (const p of Object.keys(SHAPES)) {
  const got = classifyPose(hand(p, 0.5, 0.5));
  if (got !== p) fail++;
  console.log(got === p ? 'PASS' : 'FAIL', `手型 ${p}`.padEnd(16), '->', got);
}

const wave = (u, n) => Math.sin(u * 2 * Math.PI * n);
const ease = (u, from, to) => (u < from ? 0 : u > to ? 1 : (u - from) / (to - from));

// [说明, 期望动作(null=不该触发), 生成函数, 期望触发次数(可选)]
const cases = [
  ['spin  食指画一圈', 'spin', () => run(u => at('point', .5 + .08*Math.cos(u*2*Math.PI), .5 + .08*Math.sin(u*2*Math.PI)), 1100)],
  ['spin  小圈画两圈', 'spin', () => run(u => at('point', .5 + .04*Math.cos(u*4*Math.PI), .5 + .04*Math.sin(u*4*Math.PI)), 1500)],
  ['spin  手枪画圈', 'spin', () => run(u => at('gun', .5 + .08*Math.cos(u*2*Math.PI), .5 + .08*Math.sin(u*2*Math.PI)), 1100)],
  ['sit   两指下滑', 'sit', () => run(u => at('two', .5, .35 + .2*u), 450)],
  ['leave 手掌推向屏幕', 'leave', () => run(u => at('open', .5, .5, 1 + .5*u), 500)],
  ['come  手掌往回收', 'come', () => run(u => at('open', .5, .5, 1.5 - .5*u), 500)],
  ['pet   手掌左右摆', 'pet', () => run(u => at('open', .5 + .07*wave(u, 2), .5), 1500)],
  ['roll  手心翻到手背', 'roll', () => run(u => at('open', .5, .5, 1, Math.cos(Math.min(1, u*1.4)*Math.PI)), 600)],
  ['roll  手背翻回手心', 'roll', () => run(u => at('open', .5, .5, 1, -Math.cos(Math.min(1, u*1.4)*Math.PI)), 600)],
  ['shake 手掌上下抖', 'shake', () => run(u => at('open', .5, .5 + .06*wave(u, 2)), 1400)],
  ['dead  手枪瞄准后上甩', 'dead', () => run(u => at('gun', .5, .55 - .12*ease(u, .7, .9)), 900)],
  ['lie   握拳停住', 'lie', () => run(() => at('fist', .5, .5), 1000)],
  ['lie   握拳停 3 秒只触发一次', 'lie', () => run(() => at('fist', .5, .5), 3000), 1],
  ['praise 竖拇指停住', 'praise', () => run(() => at('thumb', .5, .5), 800)],
  ['praise 停 3 秒只触发一次', 'praise', () => run(() => at('thumb', .5, .5), 3000), 1],

  ['--    手背朝屏幕不动', null, () => run(() => at('open', .5, .5, 1, -1), 2000)],
  ['--    手背左右摆→摸头', 'pet', () => run(u => at('open', .5 + .07*wave(u, 2), .5, 1, -1), 1500)],
  ['--    手掌不动', null, () => run(() => at('open', .5, .5), 2000)],
  ['--    食指直线划过', null, () => run(u => at('point', .3 + .4*u, .5), 800)],
  ['--    单指(拇指收着)上甩', null, () => run(u => at('point', .5, .55 - .12*ease(u, .7, .9)), 900)],
  ['--    手枪没瞄准直接上甩', null, () => run(u => at('gun', .5, .6 - .15*u), 500)],
  ['--    手枪不动', null, () => run(() => at('gun', .5, .5), 2000)],
  ['--    两指往上滑', null, () => run(u => at('two', .5, .6 - .2*u), 450)],
  ['--    两指横着滑', null, () => run(u => at('two', .35 + .25*u, .5), 450)],
  ['--    握拳移动', null, () => run(u => at('fist', .3 + .3*u, .5, 1 + .4*u), 800)],
  ['--    握拳停太短', null, () => run(() => at('fist', .5, .5), 500)],
];
for (const [label, want, fn, count] of cases) {
  const got = fn();
  let ok = want ? got[0] === want && got.every(g => g === want) : got.length === 0;
  if (ok && count) ok = got.length === count;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', label.padEnd(16), 'got:', JSON.stringify(got));
}
console.log(fail ? `${fail} failed` : 'all passed'); if (fail) process.exit(1);
