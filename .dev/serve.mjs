// 预览用的小静态服务器（平时用 start.command 就行）
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
http.createServer(async (req, res) => {
  // 开发用：浏览器里处理好的素材（比如重新排帧的精灵图）存到 .dev/out/
  if (req.method === 'POST' && req.url.startsWith('/.dev/save/')) {
    const name = req.url.slice('/.dev/save/'.length).replace(/[^\w.-]/g, '');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    await mkdir(join(root, '.dev/out'), { recursive: true });
    await writeFile(join(root, '.dev/out', name), Buffer.concat(chunks));
    res.writeHead(200).end('saved');
    return;
  }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { const buf = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(buf); }
  catch { res.writeHead(404).end('not found'); }
}).listen(Number(process.env.PORT || process.argv[2] || 8765), '127.0.0.1', () => console.log('serving', root));
