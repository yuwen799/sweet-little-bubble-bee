// ============================================================
//  页面上到处贴的狗狗小贴纸（装饰用）
//  每次打开页面：贴纸随机分到 config.decor.slots 里的位置（窗口的某个角，一半露在外面），
//  大小、角度也随机，每张都不一样大。
//  平时轻轻晃；每隔几秒随机一张蹦一下；鼠标放上去会「翘起来」；点一下弹一弹、冒爱心星星。
// ============================================================

const shuffle = (a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export function setupDecor(cfg, play = () => {}) {
  if (!cfg?.stickers?.length || !cfg.slots?.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const n = Math.min(cfg.stickers.length, cfg.slots.length);
  const slots = shuffle(cfg.slots).slice(0, n);
  // 大小：每个角在自己的范围里随机；和已经挑过的差不到 14 像素就重挑，保证每张都不一样大
  const sizes = [];
  for (const s of slots) {
    const [lo, hi] = s.size || cfg.size || [90, 150];
    let v = rand(lo, hi);
    for (let k = 0; k < 12 && sizes.some((u) => Math.abs(u - v) < 14); k++) v = rand(lo, hi);
    sizes.push(v);
  }
  const placed = [];

  shuffle(cfg.stickers).slice(0, n).forEach((src, i) => {
    const slot = slots[i];
    const win = document.querySelector(slot.win);
    if (!win) return;
    const img = document.createElement('img');
    img.className = `deco deco-${slot.corner}`;
    img.alt = '';
    img.draggable = false;
    const long = sizes[i];
    const maxRot = cfg.rot ?? 14;
    // 左边的角往左歪、右边的角往右歪的多一点，看起来更像随手贴的
    const lean = slot.corner.endsWith('l') ? -1 : 1;
    const rot = lean * rand(maxRot * 0.25, maxRot) * (Math.random() < 0.25 ? -1 : 1);
    img.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
    img.style.setProperty('--dx', `${Math.round(rand(-8, 8))}px`);
    img.style.setProperty('--dy', `${Math.round((slot.dy || 0) + rand(-6, 6))}px`);
    img.style.setProperty('--float', `${rand(2.8, 4.6).toFixed(2)}s`);
    img.style.animationDelay = `${-rand(0, 4).toFixed(2)}s`;
    img.addEventListener('load', () => {
      // size 是长边：横着的贴纸按宽算，免得横的那张特别大
      const h = img.naturalWidth > img.naturalHeight ? (long * img.naturalHeight) / img.naturalWidth : long;
      img.style.setProperty('--h', `${Math.round(h)}px`);
    });
    img.style.setProperty('--h', `${Math.round(long)}px`);
    img.addEventListener('error', () => img.remove()); // 图还没放进来就先不显示
    img.addEventListener('click', () => boing(img, true, play));
    img.src = src;
    win.appendChild(img);
    placed.push(img);
  });
  if (reduce || !placed.length) return;
  // 每隔几秒随机一张蹦一下（不出声，免得吵）
  setInterval(() => {
    const alive = placed.filter((p) => p.isConnected);
    if (alive.length) boing(alive[Math.floor(Math.random() * alive.length)], false, play);
  }, 5200);
}

function boing(img, big, play) {
  img.classList.remove('boing', 'boing-big');
  void img.offsetWidth;
  img.classList.add(big ? 'boing-big' : 'boing');
  setTimeout(() => img.classList.remove('boing', 'boing-big'), 900);
  if (!big) return;
  play('spring');
  setTimeout(() => play('sparkle'), 120);
  // 点一下：从贴纸中间冒爱心星星
  const r = img.getBoundingClientRect();
  const chars = ['❤', '💕', '✨', '⭐', '💗', '✦'];
  for (let k = 0; k < 9; k++) {
    const s = document.createElement('span');
    s.className = 'deco-pop';
    s.textContent = chars[k % chars.length];
    const ang = (k / 9) * Math.PI * 2;
    s.style.left = `${r.left + r.width / 2}px`;
    s.style.top = `${r.top + r.height / 2}px`;
    s.style.setProperty('--x', `${Math.cos(ang) * (50 + Math.random() * 40)}px`);
    s.style.setProperty('--y', `${Math.sin(ang) * (50 + Math.random() * 40) - 20}px`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}
