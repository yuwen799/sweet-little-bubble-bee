import { t } from './i18n.js';
// ============================================================
//  宠物：状态机 + 显示（内置卡通狗 或 你自己的视频/图片素材）
// ============================================================

// 显示用的动画名 → config.actions 里的素材名
const MEDIA_KEY = {
  idle: 'idle', spin: 'spin', sit: 'sit', lying: 'lying', walk: 'leave',
  away: 'away', run: 'come', happy: 'come', pet: 'pet',
  shake: 'shake', dead: 'playDead', praise: 'praise',
  fetch: 'fetch', kiss: 'kiss',
};

// 这些动作狗是站着/动着的，不保留坐、趴等姿势
const MOVING = ['spin', 'walk', 'run', 'happy', 'praise', 'kiss', 'fetch'];
// 会一直保持的姿势
const POSTURES = ['sit', 'dead']; // dead 只在装死那 2 秒里用

export class Pet {
  /**
   * @param el  { stage, wrap, dog, video, img, sprite, hearts, ball }
   * @param cfg CONFIG
   */
  constructor(el, cfg) {
    this.el = el;
    this.cfg = cfg;
    this.base = 'stand'; // 'stand' | 'sit'（趴着）| 'away'
    this.busy = false;   // 正在播放一次性的动作（转圈/走开/跑来）
    this.petting = false;
    this.broken = new Set(); // 加载失败的素材
    this.lastHeart = 0;

    el.stage.style.setProperty('--away-scale', cfg.away.scale);
    el.stage.style.setProperty('--away-y', cfg.away.offsetY);

    el.video.addEventListener('ended', () => this.onEnd && this.onEnd());
    const onErr = (media) => () => {
      if (!this.curKey || !media.getAttribute('src')) return;
      console.warn(`素材加载失败，改用卡通狗：${this.cfg.actions[this.curKey]?.src}`);
      this.broken.add(this.curKey);
      this.render(this.curAnim);
      if (this.onEnd && this.busy) this.armTimer(this.curDur);
    };
    el.video.addEventListener('error', onErr(el.video));
    el.img.addEventListener('error', onErr(el.img));

    this.render('idle');
  }

  get name() { return t('petName') || this.cfg.petName; }

  /** 执行动作。返回 { ok, msg } */
  do(action, opts = {}) {
    if (this.busy) return { ok: false };
    const far = this.base === 'away';
    const A = this.cfg.actions;

    if (action !== 'pet') this.stopPetting(false);

    switch (action) {
      case 'spin':
        if (far) return this.tooFar();
        this.play('spin', A.spin.duration || 1300, () => { this.base = 'stand'; this.render('idle'); });
        return { ok: true };

      case 'sit': // 趴下（内部名字还叫 sit）：播一遍趴下去，然后一直趴着摇尾巴
        if (far) return this.tooFar();
        if (this.base === 'sit') { this.render('lying'); return { ok: true }; }
        this.base = 'sit';
        this.play('sit', 1500, () => this.render('lying'));
        return { ok: true };

      case 'shake': // 握手：坐着抬爪子，握完继续坐着（待机就是坐着的）
        if (far) return this.tooFar();
        this.play('shake', A.shake?.duration || 1600, () => { this.base = 'stand'; this.render('idle'); });
        return { ok: true };

      case 'dead': // 装死：「砰」倒地，躺 2 秒后自己爬起来（用户要求不要一直躺着）
        if (far) return this.tooFar();
        this.play('dead', A.playDead?.duration || 2000, () => { this.base = 'stand'; this.render('idle'); });
        return { ok: true };

      case 'praise': // 被夸：开心扭一扭，再回到原来的姿势
        this.play('praise', A.praise?.duration || 1300, () => this.render(this.restingAnim()));
        for (let k = 0; k < 5; k++) setTimeout(() => this.spawnHeart(['✨', '⭐', '🌟'], true), k * 180);
        return { ok: true };

      case 'fetch': // 扔球：球飞出去 → 狗追过去 → 叼回来 → 放在你面前
        if (far) return this.tooFar();
        this.fetch();
        return { ok: true };

      case 'kiss': // 亲亲：凑到屏幕前舔一下，冒大爱心
        if (far) return this.tooFar();
        this.play('kiss', A.kiss?.duration || 1600, () => this.render(this.restingAnim()));
        this.bigHeart();
        for (let k = 0; k < 8; k++) setTimeout(() => this.spawnHeart(undefined, true), k * 120);
        return { ok: true };

      case 'leave': {
        if (far) return { ok: false, msg: t('alreadyAway', { name: this.name }) };
        const dur = A.leave.duration || 2200;
        this.el.stage.style.setProperty('--move-dur', `${dur}ms`);
        this.el.stage.classList.add('away');
        this.play('walk', dur, () => { this.base = 'away'; this.render('away'); });
        return { ok: true };
      }

      case 'come': {
        const dur = A.come.duration || 1100;
        if (far) {
          this.el.stage.style.setProperty('--move-dur', `${dur}ms`);
          this.el.stage.classList.remove('away');
          this.play('run', dur, () => { this.base = 'stand'; this.render('idle'); });
        } else {
          this.play('happy', 900, () => { this.base = 'stand'; this.render('idle'); });
        }
        return { ok: true };
      }

      case 'pet':
        if (far) return this.tooFar();
        if (!this.petting) { this.petting = true; this.render('pet'); }
        clearTimeout(this.petTimer);
        this.petTimer = setTimeout(() => this.stopPetting(true), opts.hold || 900);
        this.spawnHeart();
        return { ok: true };
    }
    return { ok: false };
  }

  /** 扔球的整套动作。有 fetch 素材就直接播素材；没有就用卡通狗演一遍 */
  fetch() {
    const A = this.cfg.actions;
    if (A.fetch?.src && !this.broken.has('fetch')) {
      this.play('fetch', A.fetch.duration || 4000, () => { this.base = 'stand'; this.render('idle'); });
      return;
    }
    // 走开、跑过来都有像素精灵图：用它们拼一整段捡球
    if (A.leave?.frames > 1 && A.come?.frames > 1 && this.srcFor('walk').src && this.srcFor('run').src) {
      this.fetchPixel();
      return;
    }
    const { stage, ball } = this.el;
    this.busy = true;
    const at = (ms, fn) => setTimeout(fn, ms);
    const throwBall = () => { ball.className = 'ball'; void ball.offsetWidth; ball.className = 'ball flying'; };
    throwBall();
    // 狗转身追过去
    at(250, () => {
      stage.style.setProperty('--move-dur', '850ms');
      stage.classList.add('away');
      this.render('walk');
    });
    // 追到了：球消失，叼在嘴里往回跑
    at(1150, () => {
      ball.className = 'ball';
      this.hasBall = true;
      stage.style.setProperty('--move-dur', '900ms');
      stage.classList.remove('away');
      this.render('run');
    });
    // 跑回来了：叼着球开心跳
    at(2100, () => this.render('happy'));
    // 把球放在你面前
    at(3000, () => {
      this.hasBall = false;
      ball.className = 'ball dropped';
      this.base = 'stand';
      this.busy = false;
      this.render('idle');
      for (let k = 0; k < 4; k++) setTimeout(() => this.spawnHeart(undefined, true), k * 150);
    });
    at(5000, () => { if (ball.className === 'ball dropped') ball.className = 'ball'; });
  }

  /**
   * 像素狗捡球：球扔到远处 → 狗走过去（走开动画完整播完）→ 叼起来
   * → 叼着球跑回来（跑过来动画，球跟着嘴）→ 坐好，把球放在你面前
   */
  fetchPixel() {
    const A = this.cfg.actions;
    const { stage, wrap, ball, mouth } = this.el;
    const goMs = A.leave.duration || 1500;
    const backMs = A.come.duration || 2100;
    this.busy = true;
    const id = (this.fetchId = (this.fetchId || 0) + 1); // 下一次扔球开始后，这次的收尾就不管了
    const at = (ms, fn) => setTimeout(() => { if (id === this.fetchId) fn(); }, ms);

    // 用狗现在的位置算球该落在哪（狗走到远处后脚边）
    const h = wrap.offsetHeight;
    const cx = wrap.offsetLeft; // .pet-wrap 用 left:50% + translateX(-50%)，所以这就是中心
    const bottom = wrap.offsetTop + h;
    const k = this.cfg.away.scale;
    const awayBottom = bottom + (parseFloat(this.cfg.away.offsetY) / 100) * h;
    const feet = 0.05; // 精灵图里脚底离画面底边的比例
    const size = 0.12 * h; // 近处的球有多大（和叼在嘴里一样大）
    // 球走狗的右边飞，落在狗走到的地方的右侧，不盖住狗
    const startX = cx + 0.42 * h, startY = bottom - 0.08 * h;
    const endX = cx + 0.5 * h * k, endY = awayBottom - feet * h * k - 0.06 * h * k;
    const pos = (x, y, s, r = 0) => `translate(${x - size / 2}px, ${y - size / 2}px) scale(${s}) rotate(${r}deg)`;

    ball.getAnimations().forEach((a) => a.cancel());
    ball.className = 'ball px far'; // far：球在远处，排在狗后面
    ball.style.width = `${size}px`;
    // 抛出去：往上飞、越飞越小，落地弹一下
    ball.animate([
      { transform: pos(startX, startY, 1.3, 0), offset: 0 },
      { transform: pos(cx + 0.36 * h, endY - 0.5 * h, 0.75, 300), offset: 0.5 },
      { transform: pos(endX, endY, k, 520), offset: 0.82 },
      { transform: pos(endX, endY - 0.06 * h * k, k, 560), offset: 0.91 },
      { transform: pos(endX, endY, k, 600), offset: 1 },
    ], { duration: 900, easing: 'ease-out', fill: 'forwards' });

    // 狗走过去（和球同时出发，走开动画完整播完）
    stage.style.setProperty('--move-dur', `${goMs}ms`);
    stage.classList.add('away');
    this.render('walk');

    // 走到了：地上的球没了，叼进嘴里，转身跑回来
    // 嘴的位置：跑过来精灵图每一帧舌头的位置（184×224 的帧里），球盖在嘴上
    // come.png 是原 GIF 第 5,4 帧 + 第 3,2,1 帧跑步循环 ×4 + 第 0 帧坐好 ×2
    const MOUTH = [[115, 110], [115, 106], [116, 104], [112, 115], [102, 110], [116, 104], [112, 115], [102, 110], [116, 104], [112, 115], [102, 110], [116, 104], [112, 115], [102, 110], [91, 94], [91, 94]];
    const place = (i) => {
      const [fx, fy] = MOUTH[Math.min(i, MOUTH.length - 1)];
      const fw = 184 / 224; // 帧的宽高比，精灵图在狗框里水平居中
      mouth.style.left = `${((1 - fw) / 2 + (fx / 184) * fw) * 100}%`;
      mouth.style.top = `${(fy / 224) * 100}%`;
    };
    at(goMs, () => {
      ball.getAnimations().forEach((a) => a.cancel());
      ball.className = 'ball';
      this.onFrame = (key, i) => { if (key === 'come') place(i); };
      place(0);
      mouth.hidden = false;
      stage.style.setProperty('--move-dur', `${backMs}ms`);
      stage.classList.remove('away');
      this.render('run');
    });

    // 跑回来坐好，停一下再把球放下
    at(goMs + backMs + 350, () => {
      this.onFrame = null;
      mouth.hidden = true;
      const fw = 184 / 224;
      const [fx, fy] = MOUTH[MOUTH.length - 1];
      const mx = cx - h / 2 + ((1 - fw) / 2 + (fx / 184) * fw) * h;
      const my = bottom - h + (fy / 224) * h;
      const floorY = bottom - 0.03 * h - size / 2;
      const dropX = mx + 0.2 * h;
      ball.className = 'ball px';
      ball.animate([
        { transform: pos(mx, my, 1, 0), offset: 0 },
        { transform: pos(dropX, floorY, 1, 90), offset: 0.55, easing: 'ease-out' },
        { transform: pos(dropX + 0.03 * h, floorY - 0.06 * h, 1, 130), offset: 0.75, easing: 'ease-in' },
        { transform: pos(dropX + 0.05 * h, floorY, 1, 160), offset: 1 },
      ], { duration: 600, easing: 'ease-in', fill: 'forwards' });
      this.base = 'stand';
      this.busy = false;
      this.render('idle');
      for (let n = 0; n < 4; n++) setTimeout(() => this.spawnHeart(undefined, true), n * 150);
    });
    // 球在你面前放一会儿再消失
    at(goMs + backMs + 3200, () => {
      if (!ball.classList.contains('px')) return;
      ball.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = () => {
        ball.getAnimations().forEach((a) => a.cancel());
        ball.className = 'ball';
      };
    });
  }

  /** 屏幕中间冒出一颗大爱心 */
  bigHeart() {
    const h = document.createElement('div');
    h.className = 'big-heart';
    h.textContent = '💗';
    this.el.stage.appendChild(h);
    setTimeout(() => h.remove(), 1500);
  }

  tooFar() {
    return { ok: false, msg: t('tooFar', { name: this.name }) };
  }

  stopPetting(rerender) {
    clearTimeout(this.petTimer);
    if (!this.petting) return;
    this.petting = false;
    if (rerender) this.render(this.restingAnim());
  }

  /** 不做动作时该显示的样子 */
  restingAnim() {
    return { sit: 'lying', away: 'away' }[this.base] || 'idle';
  }

  /** 播放一次性动作，结束后调用 done */
  play(anim, ms, done) {
    this.busy = true;
    this.curDur = ms;
    const finish = () => {
      if (!this.busy) return;
      this.busy = false;
      this.onEnd = null;
      clearTimeout(this.timer);
      done && done();
    };
    this.onEnd = finish;
    const mode = this.render(anim);
    // 视频：等播完（'ended'），最多等 15 秒；其他：按时长
    this.armTimer(mode === 'video' || mode === 'sprite' ? 15000 : ms);
  }

  armTimer(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onEnd && this.onEnd(), ms);
  }

  /** 找到某个动画要用的素材地址；没有就返回 '' */
  srcFor(anim) {
    const A = this.cfg.actions;
    let key = MEDIA_KEY[anim];
    if (key === 'away' && (!A.away?.src || this.broken.has('away'))) key = 'idle';
    const src = A[key]?.src || '';
    return { key, src: this.broken.has(key) ? '' : src };
  }

  /** 切换显示。返回 'svg' | 'video' | 'img' */
  render(anim) {
    const { dog, video, img } = this.el;
    let posture = 'stand';
    if (anim === 'sit' || anim === 'lying' || anim === 'away' || anim === 'shake') posture = 'sit';
    else if (POSTURES.includes(anim)) posture = anim;
    else if (!MOVING.includes(anim) && POSTURES.includes(this.base)) posture = this.base;
    dog.className = `dog posture-${posture} st-${anim}${this.hasBall ? ' has-ball' : ''}`;
    // 装死时狗是侧躺转过来的，影子改由外层画
    this.el.wrap.classList.toggle('lying', posture === 'dead');
    // 让 CSS 动画每次都从头播
    void dog.offsetWidth;

    let { key, src } = this.srcFor(anim);
    // 还没做素材的动作：先用自家狗的待机图 + 代码动效（转一圈、跳一跳、躺倒…），不再切回卡通柴犬
    let motion = '';
    if (!src && anim !== 'idle' && this.cfg.pixelFallback !== false) {
      const idle = this.srcFor('idle');
      if (idle.src) { key = idle.key; src = idle.src; motion = anim; }
    }
    const { wrap } = this.el;
    wrap.removeAttribute('data-motion');
    void wrap.offsetWidth; // 让动效每次都从头播
    if (motion) wrap.dataset.motion = motion;
    this.curAnim = anim;
    this.curKey = key;

    const { sprite } = this.el;
    clearInterval(this.spriteTimer);

    if (!src) {
      dog.hidden = false;
      video.hidden = true;
      img.hidden = true;
      sprite.hidden = true;
      video.pause();
      return 'svg';
    }

    const a = this.cfg.actions[key] || {};
    const isVideo = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(src);
    dog.hidden = true;
    // 素材自己会画倒地，不用卡通狗那个外层影子
    if (!motion) wrap.classList.remove('lying');
    if (a.frames > 1) { // 像素精灵图（PixelLab 导出或视频转出来的 spritesheet）
      video.hidden = true;
      video.pause();
      img.hidden = true;
      this.playSprite(key, src, a);
      return 'sprite';
    }
    sprite.hidden = true;
    if (isVideo) {
      img.hidden = true;
      if (video.getAttribute('src') !== src) video.setAttribute('src', src);
      video.loop = !!this.cfg.actions[key]?.loop;
      video.hidden = false;
      try { video.currentTime = 0; } catch (_) { /* 还没加载 */ }
      video.play().catch(() => {});
      return 'video';
    }
    video.hidden = true;
    video.pause();
    // GIF：每次都从第一帧开始播（同一个地址浏览器不会重播，所以加个尾巴）
    const fresh = /\.gif(\?.*)?$/i.test(src) && !a.loop;
    if (fresh || img.dataset.src !== src) {
      img.dataset.src = src;
      img.setAttribute('src', fresh ? `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}` : src);
    }
    img.hidden = false;
    return 'img';
  }

  /** 播放精灵图：一张大图里排着每一帧，从左到右、从上到下 */
  playSprite(key, src, a) {
    const el = this.el.sprite;
    const n = a.frames;
    const cols = a.cols || n;
    const rows = Math.ceil(n / cols);
    const fps = a.fps || 10;
    if (el.dataset.src !== src) {
      el.dataset.src = src;
      el.style.backgroundImage = `url("${src}")`;
      // 检查图片能不能加载，加载失败就退回卡通狗
      const probe = new Image();
      // 每一帧不一定是正方形：按帧的宽高比设宽度，不然会被拉扁
      el.style.width = '';
      probe.onload = () => {
        if (el.dataset.src !== src) return;
        el.style.width = `${((probe.naturalWidth / cols) / (probe.naturalHeight / rows)) * 100}%`;
      };
      probe.onerror = () => {
        if (el.dataset.src !== src) return;
        console.warn(`素材加载失败，改用卡通狗：${src}`);
        el.dataset.src = '';
        this.broken.add(key);
        this.render(this.curAnim);
        if (this.onEnd && this.busy) this.armTimer(this.curDur);
      };
      probe.src = src;
    }
    el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    el.hidden = false;
    let i = 0;
    const show = () => {
      if (this.onFrame) this.onFrame(key, i);
      const c = i % cols;
      const r = Math.floor(i / cols);
      el.style.backgroundPosition = `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%`;
    };
    show();
    // 按真实经过的时间算第几帧：电脑卡一下或计时器变慢，动画也不会被拖长
    const t0 = performance.now();
    this.spriteTimer = setInterval(() => {
      i = Math.floor(((performance.now() - t0) / 1000) * fps);
      if (i >= n) {
        if (a.loop) i %= n;
        else { // 播完停在最后一帧，和视频一样
          i = n - 1;
          show();
          clearInterval(this.spriteTimer);
          this.onEnd && this.onEnd();
          return;
        }
      }
      show();
    }, 1000 / fps / 2);
  }

  spawnHeart(chars = ['❤', '💕', '💗'], force = false) {
    const now = performance.now();
    if (!force && now - this.lastHeart < 220) return;
    this.lastHeart = now;
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = chars[Math.floor(Math.random() * chars.length)];
    h.style.left = `${30 + Math.random() * 40}%`;
    h.style.top = '12%';
    h.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    this.el.hearts.appendChild(h);
    setTimeout(() => h.remove(), 1400);
  }
}
