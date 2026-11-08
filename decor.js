// ============================================================
//  页面上的狗狗小贴纸（装饰用）
//  位置、大小、角度都在 config.js 的 decor 里固定写好（用户圈定的位置）。
//  平时轻轻晃；每隔几秒随机一张蹦一下；鼠标放上去会「翘起来」；点一下弹一弹、冒爱心星星。
// ============================================================

export function setupDecor(list = [], play = () => {}) {
  if (!Array.isArray(list) || !list.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const placed = [];

  list.forEach((d, i) => {
    const win = document.querySelector(d.win);
    if (!win) return;
    const img = document.createElement('img');
    // 有 left/top：贴在窗口里面；否则贴在某个角上，一半露在外面
    img.className = d.corner ? `deco deco-${d.corner}` : 'deco deco-in';
    if (!d.corner) {
      img.style.left = d.left || '0';
      img.style.top = d.top || '0';
    }
    img.alt = '';
    img.draggable = false;
    const long = d.size || 120;
    img.style.setProperty('--h', `${long}px`);
    img.style.setProperty('--rot', `${d.rot || 0}deg`);
    img.style.setProperty('--dx', `${d.dx || 0}px`);
    img.style.setProperty('--dy', `${d.dy || 0}px`);
    img.style.setProperty('--float', `${3.1 + (i % 3) * 0.6}s`);
    img.style.animationDelay = `${-i * 0.9}s`;
    img.addEventListener('load', () => {
      // size 是长边：横着的贴纸按宽算，免得横的那张特别大
      if (img.naturalWidth > img.naturalHeight) img.style.setProperty('--h', `${Math.round((long * img.naturalHeight) / img.naturalWidth)}px`);
    });
    img.addEventListener('error', () => img.remove()); // 图还没放进来就先不显示
    img.addEventListener('click', () => boing(img, true, play));
    img.src = d.src;
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
