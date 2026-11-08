import { CONFIG } from './config.js';
import { Pet } from './pet.js';
import { GestureDetector, POSE_LABEL } from './gestures.js';

// MediaPipe 手势识别（从 CDN 加载，需要联网）
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const $ = (id) => document.getElementById(id);
const ACTIONS = ['spin', 'sit', 'leave', 'come', 'pet', 'roll', 'shake', 'dead', 'lie', 'praise', 'fetch', 'kiss'];
const KEYS = '1234567890-='; // 和 ACTIONS 一一对应

const pet = new Pet(
  { stage: $('stage'), wrap: $('petWrap'), dog: $('dog'), video: $('petVideo'), img: $('petImg'), hearts: $('hearts'), ball: $('ball') },
  CONFIG,
);
const detector = new GestureDetector(CONFIG.gestures);

// ---------- 触发动作 ----------
function trigger(action, opts) {
  const r = pet.do(action, opts);
  flash(action, r.ok);
  if (!r.ok && r.msg) toast(r.msg);
}

function flash(action, ok) {
  const li = document.querySelector(`.guide li[data-action="${action}"]`);
  if (!li) return;
  const cls = ok ? 'hit' : 'miss';
  li.classList.remove('hit', 'miss');
  void li.offsetWidth;
  li.classList.add(cls);
  clearTimeout(li._t);
  li._t = setTimeout(() => li.classList.remove(cls), 650);
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// 键盘 1–9、0、-、= / 点击说明条目（没有摄像头时测试用）
document.addEventListener('keydown', (e) => {
  const i = KEYS.indexOf(e.key);
  if (i >= 0) trigger(ACTIONS[i], { hold: 1600 });
});
document.querySelectorAll('.guide li').forEach((li) => {
  li.addEventListener('click', () => trigger(li.dataset.action, { hold: 1600 }));
});

// ---------- 摄像头 + 手势识别 ----------
const cam = $('cam');
const overlay = $('overlay');
const ctx = overlay.getContext('2d');
let landmarker = null;

function setStatus(text) { $('camStatus').textContent = text; }

async function createLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  const make = (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2, // 双手比心要同时看两只手
    });
  try {
    return await make('GPU');
  } catch (e) {
    console.warn('GPU 不可用，改用 CPU', e);
    return make('CPU');
  }
}

async function startCamera() {
  const btn = $('camBtn');
  btn.disabled = true;
  setStatus('正在打开摄像头…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    cam.srcObject = stream;
    await cam.play();
  } catch (e) {
    const why = e && e.name === 'NotAllowedError' ? '没有摄像头权限' : '摄像头打不开';
    setStatus(`⚠️ ${why}（可以先用键盘 1–9、0、-、= 试）`);
    btn.disabled = false;
    return;
  }
  $('camBox').classList.remove('off');
  overlay.width = cam.videoWidth || 640;
  overlay.height = cam.videoHeight || 480;

  setStatus('正在加载手势模型…');
  try {
    landmarker = await createLandmarker();
  } catch (e) {
    console.error(e);
    setStatus('⚠️ 手势模型加载失败（需要联网）');
    return;
  }
  setStatus('✅ 手势识别中');
  requestAnimationFrame(loop);
}

let lastVideoTime = -1;
let lastWrist = null;
function loop() {
  requestAnimationFrame(loop);
  if (cam.readyState < 2 || cam.currentTime === lastVideoTime) return;
  lastVideoTime = cam.currentTime;

  const now = performance.now();
  const res = landmarker.detectForVideo(cam, now);
  // 镜像：让“往右”就是你看到的往右
  const hands = (res.landmarks || []).map((h) => h.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
  // 两只手都在画面里时，单手手势一直跟着同一只手（离上一帧主手最近的那只），不来回跳
  let main = 0;
  if (hands.length > 1 && lastWrist) {
    const d = (h) => Math.hypot(h[0].x - lastWrist.x, h[0].y - lastWrist.y);
    main = d(hands[1]) < d(hands[0]) ? 1 : 0;
  }
  const lm = hands[main] || null;
  const other = hands[1 - main] || null;
  lastWrist = lm ? lm[0] : null;

  // 左右手：MediaPipe 默认画面是镜像过的，我们给的是摄像头原始画面，所以它说的左右是反的
  const label = res.handedness?.[main]?.[0]?.categoryName || null;
  let hand = label;
  if (label && CONFIG.gestures.handednessSwap !== false) hand = label === 'Left' ? 'Right' : 'Left';

  const out = detector.update(lm, now, hand, other);
  drawHands(hands, main, out.pose);
  let poseText = out.pose ? POSE_LABEL[out.pose] : '没看到手';
  if (out.pose === 'open' && out.palmSide) poseText += out.palmSide === 1 ? '（手心）' : '（手背）';
  $('poseChip').textContent = `手势：${poseText}`;
  // 「手掌往回收」只用来把走远的狗叫回来；狗在面前时忽略，免得误触发
  if (out.gesture === 'come' && pet.base !== 'away') return;
  if (out.gesture) trigger(out.gesture);
}

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function drawHands(hands, main, pose) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  hands.forEach((lm, k) => drawHand(lm, k === main ? pose : 'other', k === main));
}

function drawHand(lm, pose, isMain) {
  const w = overlay.width;
  const h = overlay.height;
  ctx.lineWidth = 3;
  ctx.strokeStyle = isMain ? 'rgba(255, 220, 170, .9)' : 'rgba(255, 255, 255, .6)';
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  ctx.fillStyle = pose === 'other' ? '#ffffff' : '#e8843c';
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

$('camBtn').addEventListener('click', startCamera);
startCamera();
