// 把别的动画帧「统一成待机图的画风」。在浏览器里用（开发服务器 + 控制台/脚本）：
//   const { idlePalette, unifyFrames } = await import('/.dev/unify.js');
//   const ref = await idlePalette();                 // 读 assets/dog/idle.gif（半尺寸 184×224 = 一格像素一个点）
//   const out = unifyFrames(frames, ref);            // frames：已经去背景、对齐好的 184×224 ImageData 数组
// 做的事：① 亮度分布对齐待机图（直方图匹配，舌头的粉色不动）；② 每个颜色换成待机图调色板里最接近的；
//         ③ 透明度二值化；④ 贴着透明的一圈像素换成待机图的深藏青描边 #03091d。
export async function idlePalette(src = '/assets/dog/idle.gif') {
  const buf = await (await fetch(src)).arrayBuffer();
  const dec = new ImageDecoder({ data: buf, type: 'image/gif' });
  await dec.tracks.ready;
  const n = dec.tracks.selectedTrack.frameCount;
  const cv = new OffscreenCanvas(368, 448), cx = cv.getContext('2d');
  const half = [];
  for (let i = 0; i < n; i++) {
    const { image } = await dec.decode({ frameIndex: i });
    cx.clearRect(0, 0, 368, 448); cx.drawImage(image, 0, 0); image.close();
    const f = cx.getImageData(0, 0, 368, 448), o = new ImageData(184, 224);
    for (let y = 0; y < 224; y++) for (let x = 0; x < 184; x++) {
      const s = (y * 2 * 368 + x * 2) * 4, t = (y * 184 + x) * 4;
      for (let k = 0; k < 4; k++) o.data[t + k] = f.data[s + k];
    }
    half.push(o);
  }
  const cnt = new Map(), L = [];
  for (const f of half) for (let i = 0; i < f.data.length; i += 4) {
    const d = f.data; if (!d[i + 3]) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; cnt.set(k, (cnt.get(k) || 0) + 1);
    if (!pink(d[i], d[i + 1], d[i + 2])) L.push(lum(d[i], d[i + 1], d[i + 2]));
  }
  const pal = [...cnt].filter(([, c]) => c >= 6).map(([k]) => [k >> 16, (k >> 8) & 255, k & 255]);
  return { frames: half, pal, cdf: cdf(L) };
}

// keep(r,g,b,x,y)：返回 true 的像素原样保留（比如地上的影子、尘土），不调色也不描边
export function unifyFrames(frames, ref, { outline = [0x03, 0x09, 0x1d], keep = () => false } = {}) {
  const L = [];
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4) {
    const d = f.data, x = (i / 4) % f.width, y = Math.floor(i / 4 / f.width);
    if (d[i + 3] > 110 && !pink(d[i], d[i + 1], d[i + 2]) && !keep(d[i], d[i + 1], d[i + 2], x, y)) L.push(lum(d[i], d[i + 1], d[i + 2]));
  }
  const cS = cdf(L), map = new Float64Array(256);
  for (let v = 0; v < 256; v++) { let j = 0; while (j < 255 && ref.cdf[j] < cS[v]) j++; map[v] = j; }
  return frames.map((f) => {
    const W = f.width, H = f.height, d = f.data, o = new ImageData(W, H), e = o.data, kept = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 110) continue;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (keep(r, g, b, (i / 4) % W, Math.floor(i / 4 / W))) { e[i] = r; e[i + 1] = g; e[i + 2] = b; e[i + 3] = 255; kept.add(i); continue; }
      if (!pink(r, g, b)) { const l = lum(r, g, b) || 1, k = map[Math.min(255, Math.round(l))] / l; r *= k; g *= k; b *= k; }
      const [R, G, B] = nearest(ref.pal, r, g, b);
      e[i] = R; e[i + 1] = G; e[i + 2] = B; e[i + 3] = 255;
    }
    const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && e[(y * W + x) * 4 + 3] > 0 && !kept.has((y * W + x) * 4);
    const edge = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (op(x, y) && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1))) edge.push((y * W + x) * 4);
    for (const i of edge) if (!kept.has(i) && !pink(e[i], e[i + 1], e[i + 2])) { e[i] = outline[0]; e[i + 1] = outline[1]; e[i + 2] = outline[2]; }
    return o;
  });
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const pink = (r, g, b) => r - g > 45 && r > 110;
function cdf(a) { const h = new Float64Array(256); for (const v of a) h[Math.min(255, Math.round(v))]++; let s = 0; return h.map((v) => (s += v) / a.length); }
function nearest(pal, r, g, b) {
  let best = pal[0], bd = Infinity;
  for (const p of pal) { const dr = r - p[0], dg = g - p[1], db = b - p[2], d = 2 * dr * dr + 4 * dg * dg + 3 * db * db; if (d < bd) { bd = d; best = p; } }
  return best;
}
