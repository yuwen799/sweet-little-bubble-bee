import { CONFIG } from './config.js';
import { Pet } from './pet.js';
import { GestureDetector } from './gestures.js';
import { t, poseLabel, applyLanguage, switchLanguage } from './i18n.js';
import { play, setSfx, setMusic, soundState } from './sound.js';
import { setupDecor } from './decor.js';

applyLanguage(); // ?lang=en 时把界面换成英文
setupDecor(CONFIG.decor, play); // 页面上到处贴的狗狗贴纸

// MediaPipe 手势识别（从 CDN 加载，需要联网）
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const $ = (id) => document.getElementById(id);
const ACTIONS = ['spin', 'sit', 'leave', 'come', 'pet', 'shake', 'dead', 'fetch', 'praise', 'kiss'];
const KEYS = '1234567890'; // 和 ACTIONS 一一对应

const pet = new Pet(
  { stage: $('stage'), wrap: $('petWrap'), dog: $('dog'), video: $('petVideo'), img: $('petImg'), sprite: $('petSprite'), hearts: $('hearts'), ball: $('ball'), mouth: $('mouthBall'), sticker: $('petSticker') },
  CONFIG,
);
pet.sfx = play; // 动作和特效的音效

// ---------- 菜单栏的按钮：音乐 / 音效 / 中英文 ----------
function paintSoundButtons() {
  $('musicBtn').textContent = soundState.music ? '♪ ON' : '♪ OFF';
  $('musicBtn').setAttribute('aria-pressed', String(soundState.music));
  $('sfxBtn').textContent = soundState.sfx ? '🔊' : '🔇';
  $('sfxBtn').setAttribute('aria-pressed', String(soundState.sfx));
}
$('musicBtn').addEventListener('click', () => { setMusic(!soundState.music); play('click'); paintSoundButtons(); });
$('sfxBtn').addEventListener('click', () => { setSfx(!soundState.sfx); paintSoundButtons(); });
$('langBtn').addEventListener('click', () => { play('click'); setTimeout(switchLanguage, 80); });
$('homeLink').addEventListener('click', () => play('pop'));
paintSoundButtons();

const detector = new GestureDetector(CONFIG.gestures);

// ---------- 触发动作 ----------
function trigger(action, opts) {
  const r = pet.do(action, opts);
  flash(action, r.ok);
  if (r.ok) status(action);
  if (!r.ok && r.msg) toast(r.msg);
}

// 狗狗屏幕底下的状态栏：「▶ 竖大拇指停住 → 被夸」
function status(action) {
  const li = document.querySelector(`.guide li[data-action="${action}"]`);
  if (!li) return;
  const bar = $('statusBar');
  const text = `▶ ${li.querySelector('.how').textContent} → ${li.querySelector('.what').textContent}`;
  if (bar.textContent === text && action === 'pet') return; // 一直摸头时不要一直抖
  bar.textContent = text;
  bar.classList.remove('bump');
  void bar.offsetWidth;
  bar.classList.add('bump');
}

// 菜单栏右上角的时钟
function tick() {
  const d = new Date();
  $('clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
tick();
setInterval(tick, 10000);

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

// 键盘 1–9、0 / 点击说明条目（没有摄像头时测试用）
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
  setStatus(t('opening'));
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    cam.srcObject = stream;
    await cam.play();
  } catch (e) {
    const why = e && e.name === 'NotAllowedError' ? t('noPermission') : t('noCamera');
    setStatus(t('camFailed', { why }));
    btn.disabled = false;
    return;
  }
  $('camBox').classList.remove('off');
  overlay.width = cam.videoWidth || 640;
  overlay.height = cam.videoHeight || 480;

  setStatus(t('loadingModel'));
  try {
    landmarker = await createLandmarker();
  } catch (e) {
    console.error(e);
    setStatus(t('modelFailed'));
    return;
  }
  setStatus(t('tracking'));
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

  const out = detector.update(lm, now, other);
  drawHands(hands, main, out.pose);
  $('poseChip').textContent = t('poseChip', { pose: out.pose ? poseLabel(out.pose) : t('noHand'), two: other ? t('twoHands') : '' });
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
  ctx.lineWidth = 4;
  ctx.strokeStyle = isMain ? '#2261e9' : 'rgba(251, 251, 248, .5)';
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  // 关节点画成小方块，像素风
  ctx.fillStyle = pose === 'other' ? '#fbfbf8' : '#f2c94c';
  for (const p of lm) ctx.fillRect(p.x * w - 4, p.y * h - 4, 8, 8);
}

$('camBtn').addEventListener('click', startCamera);
startCamera();
