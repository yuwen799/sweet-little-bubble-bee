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
| 🖐 张开手掌往屏幕方向推 | 走开、变小 |
| 🖐 张开手掌往自己方向收 | 跑过来 |
| 🖐 张开手掌左右来回摆 | 摸头（一直摆就一直摸） |
| 🫳 张开手掌翻个面（手心↔手背） | 翻肚皮，再左右摆手 = 揉肚皮 |
| 🤝 张开手掌上下抖两下（像握手） | 坐下伸爪子握手 |
| 👉 比手枪（食指伸出、拇指翘起），先瞄准停一下，再往上一甩 | 「砰」装死，倒地不动 |
| ✊ 握拳停住不动 | 趴下 |
| 👍 竖大拇指停住 | 被夸，开心扭一扭、冒星星 |

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
  roll:  { src: 'assets/dog/roll.mp4' },
  bellyRub: { src: 'assets/dog/belly.mp4', loop: true },
  shake: { src: 'assets/dog/shake.mp4' },
  playDead: { src: 'assets/dog/dead.mp4' },
  lie:   { src: 'assets/dog/lie.mp4' },
  praise: { src: 'assets/dog/praise.mp4' },
}
```

3. 刷新网页就行。没填的动作会继续用卡通狗，所以可以一个一个慢慢换。

素材建议：
- 每段 1–3 秒，狗狗在画面中间。
- 背景越干净越好。最好是抠掉背景、导出成透明背景的 `.webm`，这样狗狗会直接站在场景地板上。
- 「坐下」「翻肚皮」「装死」「趴下」视频播完会停在最后一帧，所以最后一帧拍成坐好 / 躺好 / 趴好的样子。
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
| `style.css` | 样式和卡通狗动画 |
| `tests/` | 手势识别测试：`node tests/gestures.test.mjs` |
| `AGENTS.md` | 给接手开发的 AI 看的交接文档（进度、设计决定、下一步） |
