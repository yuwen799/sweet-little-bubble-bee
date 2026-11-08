# 🐶 Sweet Little Bubble Bee

（仓库名 sweet-little-bubble-bee，原名「手势遛狗」）

对着摄像头比手势，屏幕里的狗狗就会做对应的动作。
用 MediaPipe 识别手上的 21 个关节点，纯网页实现，不用安装任何东西。

## 怎么打开

**双击 `start.command`**，浏览器会自动打开 `http://localhost:8765`，允许摄像头权限就能玩。

或者在终端里运行：

```bash
cd sweet-little-bubble-bee && python3 -m http.server 8765
```

然后用 Chrome / Safari 打开 http://localhost:8765。

> 不能直接双击 `index.html` 打开，因为浏览器只允许 `localhost` 或 https 的页面用摄像头。
> 第一次打开需要联网，用来下载手势识别模型（大约 8MB）。

## 手势

| 手势 | 狗狗 |
|---|---|
| ☝️ 伸出食指画一个圈 | 转圈 |
| ✌️ 伸出两根手指往下滑 | 坐下 |
| 👉 食指往旁边快速一划（「去那边」） | 走开、变小 |
| 🖐 张开手掌往自己方向收（狗走远时才有效） | 跑过来 |
| 🖐 张开手掌左右来回摆 | 摸头（一直摆就一直摸） |
| ✊ 握拳：停住不动，或者像握着狗爪那样上下晃 | 坐下伸爪子握手 |
| 👉👈 两只手都比手枪，先停住瞄准，再一起快速往上一甩 | 「砰」装死，躺 2 秒后自己爬起来 |
| 👍 竖大拇指停住 | 被夸，开心扭一扭、冒星星 |
| 🤏 拇指和食指捏住（像捏着球），松手的同时往外一甩 | 扔球：狗追过去，叼回来放在你面前 🎾 |
| 🫶 双手比心：两只食指尖碰在一起、两只拇指尖碰在一起，停一下 | 亲亲：凑到屏幕前舔你一下，冒大爱心 |

没有摄像头的时候，可以按键盘 **1–9、0**，或者点左下角的说明条目来试。

小提示：
- 手离摄像头大约一臂远，整只手都在画面里，识别最稳。
- 狗狗走开以后只听「跑过来」，要先把它叫回来，才能做别的动作。

## 换成自家狗狗

1. 把狗狗各个动作的短视频放进 `assets/dog/`，比如 `spin.mp4`、`sit.mp4`。
2. 打开 `config.js`，把路径填进对应的动作：

```js
actions: {
  idle:  { src: 'assets/dog/idle.mp4', loop: true },
  spin:  { src: 'assets/dog/spin.mp4' },
  sit:   { src: 'assets/dog/sit.mp4' },
  leave: { src: 'assets/dog/leave.mp4' },
  come:  { src: 'assets/dog/come.mp4' },
  pet:   { src: 'assets/dog/pet.mp4', loop: true },
  shake: { src: 'assets/dog/shake.mp4' },
  playDead: { src: 'assets/dog/dead.mp4' },
  praise: { src: 'assets/dog/praise.mp4' },
  fetch: { src: 'assets/dog/fetch.mp4' },  // 一整段：跑去追球、叼回来
  kiss:  { src: 'assets/dog/kiss.mp4' },
}
```

   **用 pixie.haus 生成的像素动画**：导出 GIF，或者导出精灵图（spritesheet）再写上一共几帧：

```js
spin: { src: 'assets/dog/spin.png', frames: 8, fps: 10 },
idle: { src: 'assets/dog/idle.gif', loop: true },
```

   每个动作的画布大小要一样，背景透明。

3. 刷新网页就行。没填的动作会继续用卡通狗，所以可以一个一个慢慢换。

素材建议：
- 每段 1–3 秒，狗狗在画面中间。
- 背景越干净越好。最好是抠掉背景、导出成透明背景的 `.webm`，这样狗狗会直接站在场景地板上。
- 「坐下」视频播完会停在最后一帧，所以最后一帧拍成坐好的样子。「装死」视频播完狗会回到站着的样子。
- 「走开」「跑过来」时，程序会自动把画面缩小和放大，视频里狗狗原地走或跑就行。

## 灵敏度

觉得手势太难触发或者太容易误触，调 `config.js` 里的 `gestures` 部分，每一项都有注释。

## 文件说明

| 文件 | 作用 |
|---|---|
| `config.js` | 素材路径、灵敏度（主要改这个） |
| `gestures.js` | 手势识别逻辑 |
| `pet.js` | 狗狗的状态和动画切换 |
| `main.js` | 摄像头、模型加载、界面 |
| `style.css` | Bubble OS 界面样式和卡通狗动画 |
| `tests/` | 手势识别测试：`node tests/gestures.test.mjs` |
| `AGENTS.md` | 给接手开发的 AI 看的交接文档（进度、设计决定、下一步） |
