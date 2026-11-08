// 界面文字的中英文。默认英文；菜单栏的「中文 / EN」按钮可以切换，选过的会记在这台电脑上。
// 网址后面加 ?lang=zh 或 ?lang=en 可以直接指定（优先级最高，个人主页嵌入时用 ?lang=en）。
// 加新文字时：ZH 和 EN 两边都要加同一个 key。
function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'zh') return q;
  try { const s = localStorage.getItem('bubble-lang'); if (s === 'en' || s === 'zh') return s; } catch { /* 存不了就用默认 */ }
  return 'en';
}
export const LANG = pickLang();

/** 切换语言：记下来，换掉网址里的 ?lang=，重新载入页面 */
export function switchLanguage() {
  const next = LANG === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('bubble-lang', next); } catch { /* 无痕模式就只改网址 */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.replace(url);
}

const ZH = {
  petName: null, // null = 用 config.js 里的 petName
  opening: '正在打开摄像头…',
  noPermission: '没有摄像头权限',
  noCamera: '摄像头打不开',
  camFailed: '⚠ {why}（可以先用键盘 1–9、0 试）',
  loadingModel: '正在加载手势模型…',
  modelFailed: '⚠️ 手势模型加载失败（需要联网）',
  tracking: '✅ 手势识别中',
  poseChip: '手势：{pose}{two}',
  noHand: '没看到手',
  twoHands: '（两只手）',
  alreadyAway: '{name}已经走开啦，手掌往回收叫它回来',
  tooFar: '{name}离得太远了，先把手掌往回收，叫它跑过来',
  pose: { point: '☝️ 单指', gun: '👉 手枪', two: '✌️ 两指', open: '🖐 张开手掌', fist: '✊ 握拳', thumb: '👍 大拇指', pinch: '🤏 捏住', other: '🤚 其他' },
  langBtn: 'EN',
  langTitle: 'Switch to English',
  musicTitle: '背景音乐 开 / 关',
  sfxTitle: '音效 开 / 关',
  copyright: '© {year} Yuwen Su · 狗狗 Bubble 的形象、画面与代码 · 保留所有权利',
};

const EN = {
  petName: 'Bubble',
  opening: 'Opening the camera…',
  noPermission: 'No camera permission',
  noCamera: 'Camera unavailable',
  camFailed: '⚠ {why} (try keys 1–9, 0 for now)',
  loadingModel: 'Loading the hand model…',
  modelFailed: '⚠️ Hand model failed to load (needs internet)',
  tracking: '✅ Watching your hand',
  poseChip: 'Hand: {pose}{two}',
  noHand: 'none yet',
  twoHands: ' (two hands)',
  alreadyAway: '{name} already wandered off. Pull your palm back to call {name} over.',
  tooFar: '{name} is too far away. Pull your palm back first so {name} runs over.',
  pose: { point: '☝️ One finger', gun: '👉 Finger gun', two: '✌️ Two fingers', open: '🖐 Open palm', fist: '✊ Fist', thumb: '👍 Thumbs-up', pinch: '🤏 Pinch', other: '🤚 Other' },
  langBtn: '中文',
  langTitle: '切换到中文',
  musicTitle: 'Music on / off',
  sfxTitle: 'Sound effects on / off',
  copyright: '© {year} Yuwen Su · Bubble, artwork & code · All rights reserved',
  // 页面上写死的文字（index.html），英文模式下替换
  static: {
    camStatus: 'Camera off',
    poseChip: 'Hand: —',
    statusBar: '▶ Show Bubble a hand gesture',
    camBtn: 'Turn on camera',
    hint: 'No camera? Click a trick or press 1–9, 0.',
    guide: 'Gesture guide',
    dog: 'Cartoon dog',
  },
  // 手势说明：data-action → [怎么比, 狗狗做什么]
  guide: {
    spin: ['Draw a circle with one finger', 'Spin'],
    sit: ['Two fingers, swipe down', 'Lie down'],
    leave: ['Flick a finger sideways', 'Walk off'],
    come: ['Pull your palm back (when far)', 'Come here'],
    pet: ['Wave your palm side to side', 'Head pat'],
    shake: ['Make a fist (hold or shake)', 'Paw shake'],
    dead: ['Two finger guns, flick up', 'Play dead'],
    praise: ['Hold a thumbs-up', 'Good dog'],
    fetch: ['Pinch, then fling', 'Fetch'],
    kiss: ['Heart with both hands', 'Kiss'],
  },
};

const TEXT = LANG === 'en' ? EN : ZH;

// t('tooFar', { name: 'Bubble' }) → 填好变量的一句话
export function t(key, vars = {}) {
  let text = key in TEXT ? TEXT[key] : (ZH[key] ?? key);
  if (text == null) return '';
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v);
  return text;
}

export const poseLabel = (pose) => (TEXT.pose[pose] || ZH.pose[pose] || pose);

// 英文模式：把 index.html 里写死的中文换成英文
export function applyLanguage() {
  const set0 = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set0('langBtn', t('langBtn'));
  document.getElementById('langBtn')?.setAttribute('title', t('langTitle'));
  document.getElementById('musicBtn')?.setAttribute('title', t('musicTitle'));
  document.getElementById('sfxBtn')?.setAttribute('title', t('sfxTitle'));
  set0('copyright', t('copyright', { year: new Date().getFullYear() }));
  if (LANG !== 'en') { document.documentElement.lang = 'zh-CN'; return; }
  const s = EN.static;
  document.documentElement.lang = 'en';
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('camStatus', s.camStatus);
  set('poseChip', s.poseChip);
  set('statusBar', s.statusBar);
  set('camBtn', s.camBtn);
  const hint = document.querySelector('.guide .hint');
  if (hint) hint.textContent = s.hint;
  document.querySelector('.guide')?.setAttribute('aria-label', s.guide);
  document.querySelector('.dog-svg')?.setAttribute('aria-label', s.dog);
  for (const [action, [how, what]] of Object.entries(EN.guide)) {
    const li = document.querySelector(`.guide li[data-action="${action}"]`);
    if (!li) continue;
    li.querySelector('.how').textContent = how;
    li.querySelector('.what').textContent = what;
  }
}
