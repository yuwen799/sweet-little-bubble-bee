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
  pinch: { ext: [0, 0, 0, 0], thumb: 'pinch' },
};
const THUMB = { // [第一关节 lm3, 指尖 lm4]
  in:  [[-0.03, 0.05], [0.0, 0.04]],
  out: [[-0.08, 0.01], [-0.10, -0.02]],
  up:  [[-0.05, -0.03], [-0.05, -0.07]],
  pinch: [[-0.08, 0.01], [-0.09, -0.02]],
  heart: [[-0.01, 0.05], [0.0, 0.04]],
};

/** 合成 21 个关键点。(cx,cy)=手的位置，s=大小，
 *  c=朝向：右手 1 = 手心朝屏幕、-1 = 手背；左手正好相反（左手手心 = -1）。中间值 = 翻到一半 */
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
  // 捏住：食指弯过去，指尖碰到拇指尖
  if (pose === 'pinch') { lm[6] = P(-0.05, -0.01); lm[7] = P(-0.07, -0.03); lm[8] = P(-0.085, -0.03); }
  return lm;
}

/** 双手比心：右手 + 镜像出来的左手，两只食指尖碰在 (cx, cy)，两只拇指尖碰在下面 */
function heartPair(cx, cy, gap = 0) {
  const right = hand('gun', cx + 0.03 + gap, cy + 0.07);
  right[3] = { x: cx + 0.02 + gap, y: cy + 0.10, z: 0 };
  right[4] = { x: cx + gap, y: cy + 0.11, z: 0 }; // 拇指尖在食指尖正下方
  const left = right.map((p) => ({ x: 2 * cx - p.x, y: p.y, z: 0 }));
  return [right, left];
}

/** 两只手的版本：frames(u) 返回 [主手, 另一只手] */
function run2(frames, ms) {
  const d = new GestureDetector(CONFIG.gestures);
  const got = [];
  const n = Math.round(ms / 33);
  for (let i = 0; i <= n; i++) {
    const t = 1000 + i * 33;
    const [a, b] = frames(i / n);
    const out = d.update(a, t, b);
    if (out.gesture) got.push(out.gesture);
  }
  return got;
}
// 让食指尖（而不是手腕）落在 (tx,ty)
const at = (pose, tx, ty, s = 1, c = 1) => hand(pose, tx + 0.03 * s * c, ty + 0.07 * s, s, c);

/** 双手手枪：右手食指尖在 (cx+spread, y)，左手是它的镜像 */
function gunPair(cx, y, spread = 0.15, pose = 'gun', yLeft = y) {
  const right = at(pose, cx + spread, y);
  const left = at(pose, cx + spread, yLeft).map((p) => ({ x: 2 * cx - p.x, y: p.y, z: 0 }));
  return [right, left];
}

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
  ['leave 食指往右一划', 'leave', () => run(u => at('point', .3 + .3*u, .5), 350)],
  ['leave 食指往左一划', 'leave', () => run(u => at('point', .7 - .3*u, .5), 350)],
  ['leave 手枪往旁边一划', 'leave', () => run(u => at('gun', .3 + .3*u, .5), 350)],
  ['come  手掌往回收', 'come', () => run(u => at('open', .5, .5, 1.5 - .5*u), 500)],
  ['pet   手掌左右摆', 'pet', () => run(u => at('open', .5 + .07*wave(u, 2), .5), 1500)],
  ['shake 握拳停住', 'shake', () => run(() => at('fist', .5, .5), 1000)],
  ['shake 握拳停 3 秒只触发一次', 'shake', () => run(() => at('fist', .5, .5), 3000), 1],
  ['shake 拳头上下晃', 'shake', () => run(u => at('fist', .5, .5 + .06*wave(u, 2)), 1400)],
  ['shake 竖拇指的拳头上下晃', 'shake', () => run(u => at('thumb', .5, .5 + .06*wave(u, 2)), 1400)],
  ['shake 晃完握着拳不动只算一次', 'shake', () => run(u => at('fist', .5, .5 + .06*wave(Math.min(u*2.8, 1), 2)), 2800), 1],
  ['dead  双手手枪往上甩', 'dead', () => run2(u => gunPair(.5, .6 - .12*ease(u, .5, .75)), 900)],
  ['dead  双手单指往上甩', 'dead', () => run2(u => gunPair(.5, .6 - .12*ease(u, .5, .75), .15, 'point'), 900)],
  ['praise 竖拇指停住', 'praise', () => run(() => at('thumb', .5, .5), 800)],
  ['praise 停 3 秒只触发一次', 'praise', () => run(() => at('thumb', .5, .5), 3000), 1],
  ['fetch 捏住→松手往上甩', 'fetch', () => run(u => u < .5 ? at('pinch', .5, .6) : at('open', .5, .6 - .2*ease(u, .5, .65)), 1000)],
  ['fetch 捏住→松手往旁边甩', 'fetch', () => run(u => u < .5 ? at('pinch', .4, .5) : at('open', .4 + .2*ease(u, .5, .65), .5), 1000)],
  ['kiss  双手比心', 'kiss', () => run2(() => heartPair(.5, .45), 1000)],
  ['kiss  比心 3 秒只触发一次', 'kiss', () => run2(() => heartPair(.5, .45), 3000), 1],

  ['--    单手手枪上甩不算装死', null, () => run(u => at('gun', .5, .55 - .12*ease(u, .5, .65)), 1000)],
  ['--    手枪停住后开始画圈', 'spin', () => run(u => { const k = ease(u, .3, 1); const a = Math.PI/2 - k*2*Math.PI; return at('gun', .5 + .08*Math.cos(a), .5 + .08*Math.sin(a)); }, 1500)],
  ['--    单指停住后开始画圈', 'spin', () => run(u => { const k = ease(u, .3, 1); const a = Math.PI/2 + k*2*Math.PI; return at('point', .5 + .08*Math.cos(a), .5 + .08*Math.sin(a)); }, 1500)],
  ['--    双手手枪不动', null, () => run2(() => gunPair(.5, .5), 1500)],
  ['--    双手手枪只有一只往上', null, () => run2(u => gunPair(.5, .6 - .12*ease(u, .5, .75), .15, 'gun', .6), 900)],
  ['--    双手刚举起来就停住（没甩）', null, () => run2(u => gunPair(.5, .75 - .2*ease(u, 0, .25)), 1500)],
  ['--    双手边比手枪边往上抬', null, () => run2(u => gunPair(.5, .75 - .25*u), 900)],
  ['--    停稳后慢慢往上抬', null, () => run2(u => gunPair(.5, .6 - .12*ease(u, .35, 1)), 1300)],
  ['dead  双手被看成竖拇指也能装死', 'dead', () => run2(u => gunPair(.5, .6 - .12*ease(u, .5, .75), .15, 'thumb'), 900)],
  ['dead  一只手枪一只竖拇指往上甩', 'dead', () => run2(u => { const y = .6 - .12*ease(u, .5, .75); return [gunPair(.5, y)[0], gunPair(.5, y, .15, 'thumb')[1]]; }, 900)],
  ['--    双手竖拇指停住不算被夸', null, () => run2(() => gunPair(.5, .5, .15, 'thumb'), 1500)],
  ['--    一只手枪一只竖拇指停住', null, () => run2(() => [gunPair(.5, .5)[0], gunPair(.5, .5, .15, 'thumb')[1]], 1500)],
  ['--    竖拇指 + 另一只手枪', null, () => run2(() => [gunPair(.5, .5, .15, 'thumb')[0], gunPair(.5, .5)[1]], 1500)],
  ['praise 竖拇指 + 另一只张开手', 'praise', () => run2(() => [at('thumb', .6, .5), at('open', .3, .5)], 1000)],
  ['--    双手手枪往下', null, () => run2(u => gunPair(.5, .45 + .12*ease(u, .5, .75)), 900)],
  ['--    一只手枪一只张开往上', null, () => run2(u => { const [r] = gunPair(.5, .6 - .12*ease(u, .5, .75)); return [r, at('open', .3, .6 - .12*ease(u, .5, .75))]; }, 900)],
  ['--    捏住不动', null, () => run(() => at('pinch', .5, .5), 1500)],
  ['--    捏住后原地松开', null, () => run(u => u < .5 ? at('pinch', .5, .5) : at('open', .5, .5), 1200)],
  ['--    捏着移动不松手', null, () => run(u => at('pinch', .4 + .2*u, .5), 800)],
  ['--    双手分开不算比心', null, () => run2(() => heartPair(.5, .45, .08), 1500)],
  ['--    只有一只手', null, () => run2(() => [heartPair(.5, .45)[0], null], 1500)],
  ['--    翻手不触发任何动作', null, () => run(u => at('open', .5, .5, 1, -Math.cos(ease(u, .3, .8)*Math.PI)), 900)],
  ['--    手掌上下抖(张开手)', null, () => run(u => at('open', .5, .5 + .06*wave(u, 2)), 1400)],
  ['--    手背朝屏幕不动', null, () => run(() => at('open', .5, .5, 1, -1), 2000)],
  ['--    手背左右摆→摸头', 'pet', () => run(u => at('open', .5 + .07*wave(u, 2), .5, 1, -1), 1500)],
  ['--    手掌不动', null, () => run(() => at('open', .5, .5), 2000)],
  ['--    食指慢慢移动', null, () => run(u => at('point', .4 + .15*u, .5), 1200)],
  ['--    食指斜着往下划', null, () => run(u => at('point', .3 + .25*u, .3 + .25*u), 350)],
  ['--    大圈不算走开', 'spin', () => run(u => at('point', .5 + .14*Math.cos(u*2*Math.PI), .5 + .14*Math.sin(u*2*Math.PI)), 1100)],
  ['--    手掌推向屏幕', null, () => run(u => at('open', .5, .5, 1 + .5*u), 500)],
  ['--    摆手时手变大', 'pet', () => run(u => at('open', .5 + .07*wave(u, 2), .5, 1 + .4*u), 1500)],
  ['--    手枪不动', null, () => run(() => at('gun', .5, .5), 2000)],
  ['--    两指往上滑', null, () => run(u => at('two', .5, .6 - .2*u), 450)],
  ['--    两指横着滑', null, () => run(u => at('two', .35 + .25*u, .5), 450)],
  ['--    握拳移动', null, () => run(u => at('fist', .3 + .3*u, .5, 1 + .4*u), 800)],
  ['--    握拳停太短', null, () => run(() => at('fist', .5, .5), 300)],
];
for (const [label, want, fn, count] of cases) {
  const got = fn();
  let ok = want ? got[0] === want && got.every(g => g === want) : got.length === 0;
  if (ok && count) ok = got.length === count;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', label.padEnd(16), 'got:', JSON.stringify(got));
}
console.log(fail ? `${fail} failed` : 'all passed'); if (fail) process.exit(1);
