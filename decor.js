// ============================================================
//  页面上到处贴的狗狗小贴纸（装饰用）
//  每张贴在某个窗口的一个角上，一半露在外面，像贴在电脑上的贴纸。
//  平时轻轻晃；每隔几秒随机一张蹦一下；鼠标放上去会「翘起来」；点一下弹一弹、冒爱心星星。
//  贴纸列表在 config.js 的 decor 里改。
// ============================================================

export function setupDecor(list = []) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const placed = [];
  list.forEach((d, i) => {
    const win = document.querySelector(d.win);
    if (!win) return;
    const img = document.createElement('img');
    img.className = `deco deco-${d.corner}`;
    img.src = d.src;
    img.alt = '';
    img.draggable = false;
    img.style.setProperty('--h', `${d.size || 120}px`);
    img.style.setProperty('--rot', `${d.rot || 0}deg`);
    img.style.setProperty('--dx', `${d.dx || 0}px`);
    img.style.setProperty('--dy', `${d.dy || 0}px`);
    img.style.setProperty('--float', `${3.2 + (i % 3) * 0.7}s`);
    img.style.animationDelay = `${-i * 0.9}s`;
    img.addEventListener('error', () => img.remove()); // 图还没放进来就先不显示
    img.addEventListener('click', () => boing(img, true));
    win.appendChild(img);
    placed.push(img);
  });
  if (reduce || !placed.length) return;
  // 每隔几秒随机一张蹦一下
  setInterval(() => {
    const alive = placed.filter((p) => p.isConnected);
    if (alive.length) boing(alive[Math.floor(Math.random() * alive.length)], false);
  }, 5200);
}

function boing(img, big) {
  img.classList.remove('boing', 'boing-big');
  void img.offsetWidth;
  img.classList.add(big ? 'boing-big' : 'boing');
  setTimeout(() => img.classList.remove('boing', 'boing-big'), 900);
  if (!big) return;
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
