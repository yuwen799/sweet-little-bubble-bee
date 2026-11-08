// ============================================================
//  声音：8-bit 小音效 + 背景小曲。全部用浏览器现场合成（Web Audio），不用音频文件。
//  音效默认开、音乐默认关（浏览器规定要先点一下页面才能出声）；开关会记在这台电脑上。
//  用法：play('pop')；setSfx(true/false)；setMusic(true/false)
// ============================================================

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* 无痕模式等存不了就算了 */ } },
};

export const soundState = {
  sfx: store.get('bubble-sfx', true),
  music: store.get('bubble-music', false),
};

let ctx = null;
let master, sfxBus, musicBus, noiseBuf;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.32;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 第一次点页面 / 按键之后才能出声
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, () => { if (ensure() && soundState.music) startMusic(); }, { passive: true });
}

// ---------- 小积木 ----------
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

function tone(freq, at, dur, { type = 'square', vol = 1, to = null, bus = sfxBus } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(at, dur, { vol = 0.6, freq = 1200, kind = 'bandpass', to = null } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.frequency.setValueAtTime(freq, at);
  if (to) f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(at, Math.random() * 0.5);
  s.stop(at + dur + 0.02);
}

const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- 每种声音 ----------
const SOUNDS = {
  click: (t) => tone(880, t, 0.04, { vol: 0.35 }),
  pop: (t) => tone(500, t, 0.08, { type: 'triangle', to: 1300, vol: 0.8 }),
  note: (t) => tone(midi(pick(PENTA)), t, 0.16, { type: 'triangle', vol: 0.55 }),
  heart: (t) => { tone(midi(84), t, 0.08, { type: 'sine', vol: 0.5 }); tone(midi(88), t + 0.07, 0.12, { type: 'sine', vol: 0.5 }); },
  twinkle: (t) => { tone(midi(91), t, 0.06, { type: 'sine', vol: 0.4 }); tone(midi(96), t + 0.05, 0.1, { type: 'sine', vol: 0.35 }); },
  alert: (t) => { tone(988, t, 0.05, { vol: 0.35 }); tone(1319, t + 0.06, 0.09, { vol: 0.35 }); },
  tag: (t) => { tone(660, t, 0.06, { vol: 0.35 }); tone(880, t + 0.07, 0.1, { vol: 0.35 }); },
  gunshot: (t) => { noise(t, 0.22, { vol: 1, freq: 1400 }); tone(160, t, 0.25, { type: 'triangle', to: 40, vol: 0.9 }); },
  puff: (t) => noise(t, 0.09, { vol: 0.22, freq: 700, kind: 'lowpass' }),
  step: (t) => noise(t, 0.035, { vol: 0.18, freq: 1600, kind: 'lowpass' }),
  dizzy: (t) => { for (let k = 0; k < 6; k++) tone(k % 2 ? 1046 : 1318, t + k * 0.08, 0.07, { type: 'sine', vol: 0.25 }); },
  whirl: (t) => { tone(300, t, 0.45, { to: 1100, vol: 0.25 }); tone(450, t + 0.45, 0.45, { to: 1500, vol: 0.22 }); },
  liedown: (t) => tone(620, t, 0.4, { type: 'triangle', to: 220, vol: 0.6 }),
  throw: (t) => { noise(t, 0.3, { vol: 0.5, freq: 600, kind: 'bandpass', to: 3000 }); tone(400, t, 0.25, { type: 'sine', to: 1000, vol: 0.3 }); },
  bounce: (t) => tone(340, t, 0.14, { type: 'sine', to: 140, vol: 0.7 }),
  biu: (t) => tone(1400, t, 0.18, { to: 180, vol: 0.4 }),
  biuBack: (t) => tone(200, t, 0.16, { to: 1400, vol: 0.35 }),
  spring: (t) => { tone(220, t, 0.12, { type: 'sine', to: 660, vol: 0.5 }); tone(660, t + 0.12, 0.18, { type: 'sine', to: 330, vol: 0.4 }); },
  slam: (t) => { noise(t, 0.14, { vol: 0.9, freq: 500, kind: 'lowpass' }); tone(110, t, 0.18, { type: 'triangle', to: 60, vol: 0.9 }); },
  thump: (t) => tone(90, t, 0.22, { type: 'sine', to: 40, vol: 1 }),
  sparkle: (t) => [88, 91, 93, 96].forEach((m, k) => tone(midi(m), t + k * 0.035, 0.07, { type: 'sine', vol: 0.3 })),
  confetti: (t) => { for (let k = 0; k < 9; k++) tone(midi(pick(PENTA) + 12), t + k * 0.025 + Math.random() * 0.02, 0.04, { type: 'square', vol: 0.12 }); },
  shatter: (t) => { for (let k = 0; k < 7; k++) noise(t + k * 0.03, 0.05, { vol: 0.35, freq: 3000 + k * 400, kind: 'highpass' }); tone(1500, t, 0.3, { type: 'sine', to: 300, vol: 0.3 }); },
  smooch: (t) => { tone(260, t, 0.1, { type: 'sine', to: 900, vol: 0.7 }); noise(t + 0.09, 0.05, { vol: 0.6, freq: 2500 }); },
  fanfare: (t) => { [72, 76, 79, 84].forEach((m, k) => tone(midi(m), t + k * 0.08, 0.1, { vol: 0.3 })); tone(midi(84), t + 0.32, 0.35, { vol: 0.3 }); tone(midi(88), t + 0.32, 0.35, { type: 'triangle', vol: 0.3 }); },
  rain: (t) => { for (let k = 0; k < 6; k++) tone(midi(pick(PENTA) + 12), t + k * 0.12, 0.08, { type: 'sine', vol: 0.18 }); },
};

const last = {};
export function play(name) {
  if (!soundState.sfx || !SOUNDS[name] || !ensure()) return;
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < 0.06) return; // 同一个声音太密就跳过，免得糊成一片
  last[name] = now;
  SOUNDS[name](now + 0.005);
}

export function setSfx(on) {
  soundState.sfx = on;
  store.set('bubble-sfx', on);
  if (on) play('pop');
}

// ---------- 背景小曲（C 大调、8-bit，循环） ----------
const BPM = 112;
const EIGHTH = 60 / BPM / 2;
// 每小节 8 个八分音符；0 = 休止
const LEAD = [
  76, 79, 81, 79, 76, 74, 72, 74,
  76, 76, 79, 76, 74, 72, 74, 0,
  72, 76, 79, 84, 81, 79, 76, 79,
  77, 76, 74, 76, 72, 0, 0, 0,
];
const BASS = [48, 55, 48, 55, 43, 50, 43, 50, 45, 52, 45, 52, 41, 48, 43, 47]; // 四分音符
let timer = null;
let step = 0;
let nextAt = 0;

function schedule() {
  while (nextAt < ctx.currentTime + 0.25) {
    const m = LEAD[step % LEAD.length];
    if (m) tone(midi(m), nextAt, EIGHTH * 0.9, { vol: 0.16, bus: musicBus });
    if (step % 2 === 0) tone(midi(BASS[(step / 2) % BASS.length]), nextAt, EIGHTH * 1.8, { type: 'triangle', vol: 0.32, bus: musicBus });
    if (step % 4 === 2) noise(nextAt, 0.03, { vol: 0.05, freq: 6000, kind: 'highpass' });
    nextAt += EIGHTH;
    step++;
  }
}

function startMusic() {
  if (!ctx) return;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0.25, ctx.currentTime, 0.2); // 背景音乐音量（用户要求比原来小一半）
  if (timer) return;
  nextAt = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 60);
}

function stopMusic() {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  setTimeout(() => { if (!soundState.music && timer) { clearInterval(timer); timer = null; } }, 600);
}

export function setMusic(on) {
  soundState.music = on;
  store.set('bubble-music', on);
  if (on && ensure()) startMusic();
  else stopMusic();
}
