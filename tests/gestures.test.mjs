// 手势识别测试：用模拟的手部关键点检查每个手势能不能认对、会不会误触发。
// 运行：node tests/gestures.test.mjs （在 pet-gesture 目录下）

import { GestureDetector, classifyPose } from '../gestures.js';
import { CONFIG } from '../config.js';

function hand(pose, cx, cy, s = 1, c = 1) {
  const ext = { open: [1,1,1,1], two: [1,1,0,0], point: [1,0,0,0], fist: [0,0,0,0] }[pose];
  const P = (x, y) => ({ x: cx + x * c * s, y: cy + y * s, z: 0 });
  const lm = new Array(21);
  lm[0] = P(0, 0.12); lm[1] = P(-0.04, 0.09); lm[2] = P(-0.06, 0.06); lm[3] = P(-0.07, 0.03); lm[4] = P(-0.08, 0.01);
  const xs = [-0.03, -0.01, 0.01, 0.03];
  for (let f = 0; f < 4; f++) {
    const b = 5 + f * 4, x = xs[f];
    lm[b] = P(x, 0.03);
    if (ext[f]) { lm[b+1] = P(x, -0.01); lm[b+2] = P(x, -0.04); lm[b+3] = P(x, -0.07); }
    else { lm[b+1] = P(x, 0.0); lm[b+2] = P(x, 0.03); lm[b+3] = P(x, 0.05); }
  }
  return lm;
}
// offset so the index tip (not wrist) is at (tx,ty)
const at = (pose, tx, ty, s=1, c=1) => hand(pose, tx + 0.03*s*c, ty + 0.07*s, s, c);

function run(name, frames, ms) {
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

for (const p of ['open','two','point','fist']) console.log('pose', p, '->', classifyPose(hand(p, .5, .5)));

const cases = [
  ['spin  食指画一圈', 'spin', () => run('', u => at('point', .5 + .08*Math.cos(u*2*Math.PI), .5 + .08*Math.sin(u*2*Math.PI)), 1100)],
  ['spin  小圈画两圈', 'spin', () => run('', u => at('point', .5 + .04*Math.cos(u*4*Math.PI), .5 + .04*Math.sin(u*4*Math.PI)), 1500)],
  ['sit   两指下滑', 'sit', () => run('', u => at('two', .5, .35 + .2*u), 450)],
  ['leave 手掌推向屏幕', 'leave', () => run('', u => at('open', .5, .5, 1 + .5*u), 500)],
  ['come  手掌往回收', 'come', () => run('', u => at('open', .5, .5, 1.5 - .5*u), 500)],
  ['pet   手掌左右摆', 'pet', () => run('', u => at('open', .5 + .07*Math.sin(u*2*Math.PI*2), .5), 1500)],
  ['roll  手心翻到手背', 'roll', () => run('', u => at('open', .5, .5, 1, Math.cos(Math.min(1, u*1.4)*Math.PI)), 600)],
  ['roll  手背翻回手心', 'roll', () => run('', u => at('open', .5, .5, 1, -Math.cos(Math.min(1, u*1.4)*Math.PI)), 600)],
  ['--    手背朝屏幕不动', null, () => run('', () => at('open', .5, .5, 1, -1), 2000)],
  ['--    手背左右摆→摸头', 'pet', () => run('', u => at('open', .5 + .07*Math.sin(u*2*Math.PI*2), .5, 1, -1), 1500)],
  ['--    手掌不动', null, () => run('', () => at('open', .5, .5), 2000)],
  ['--    食指直线划过', null, () => run('', u => at('point', .3 + .4*u, .5), 800)],
  ['--    两指往上滑', null, () => run('', u => at('two', .5, .6 - .2*u), 450)],
  ['--    两指横着滑', null, () => run('', u => at('two', .35 + .25*u, .5), 450)],
  ['--    手掌上下摆', null, () => run('', u => at('open', .5, .5 + .07*Math.sin(u*2*Math.PI*2)), 1500)],
  ['--    握拳移动', null, () => run('', u => at('fist', .3 + .3*u, .5, 1 + .4*u), 800)],
];
let fail = 0;
for (const [label, want, fn] of cases) {
  const got = fn();
  const first = got[0] ?? null;
  const ok = want ? first === want && got.every(g => g === want) : got.length === 0;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', label.padEnd(16), 'got:', JSON.stringify(got));
}
console.log(fail ? `${fail} failed` : "all passed"); if (fail) process.exit(1);
