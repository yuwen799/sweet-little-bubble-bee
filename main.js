import { CONFIG } from './config.js';
import { Pet } from './pet.js';
import { GestureDetector, POSE_LABEL } from './gestures.js';

// MediaPipe 手势识别（从 CDN 加载，需要联网）
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const $ = (id) => document.getElementById(id);
const ACTIONS = ['spin', 'sit', 'leave', 'come', 'pet', 'roll', 'shake', 'dead', 'lie', 'praise'];

const pet = new Pet(
  { stage: $('stage'), wrap: $('petWrap'), dog: $('dog'), video: $('petVideo'), img: $('petImg'), hearts: $('hearts') },
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

// 键盘 1–5 / 点击说明条目（没有摄像头时测试用）
document.addEventListener('keydown', (e) => {
  const i = '1234567890'.indexOf(e.key);
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
      numHands: 1,
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
    setStatus(`⚠️ ${why}（可以先用键盘 1–9、0 试）`);
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
function loop() {
  requestAnimationFrame(loop);
  if (cam.readyState < 2 || cam.currentTime === lastVideoTime) return;
  lastVideoTime = cam.currentTime;

  const now = performance.now();
  const res = landmarker.detectForVideo(cam, now);
  const raw = res.landmarks && res.landmarks[0];
  // 镜像：让“往右”就是你看到的往右
  const lm = raw ? raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) : null;

  const out = detector.update(lm, now);
  drawHand(lm, out.pose);
  $('poseChip').textContent = `手势：${out.pose ? POSE_LABEL[out.pose] : '没看到手'}`;
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

function drawHand(lm, pose) {
  const w = overlay.width;
  const h = overlay.height;
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 220, 170, .9)';
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
