// ============================================================
//  Sweet Little Bubble Bee · 配置文件
//  换成自家狗狗的素材，基本只需要改这个文件。
// ============================================================

export const CONFIG = {
  // 宠物名字（提示文字里会用到）
  petName: '狗狗',

  // ---------- 每个动作用的素材 ----------
  // src 留空 = 用内置的卡通狗占位。
  // 把素材放进 assets/dog/ 文件夹，然后把路径填进来，例如：
  //   spin: { src: 'assets/dog/spin.mp4' }
  // 支持 mp4 / webm / mov(Safari) / gif / png / webp。
  // 建议：视频用纯色背景，或导出成透明背景的 webm，效果最好。
  //
  // loop:     是否循环播放（待机、摸头这种持续的动作要 true）
  // duration: 动作时长（毫秒）。视频会自动播到结尾，gif/图片和内置卡通狗按这个时长。
  //
  // ★ pixie.haus 导出的像素动画，两种都行：
  //   GIF：     spin: { src: 'assets/dog/spin.gif', duration: 1200 }
  //   精灵图：  spin: { src: 'assets/dog/spin.png', frames: 8, fps: 10 }
  //             frames = 一共几帧；fps = 每秒播几帧；
  //             帧排成好几行的话，再加 cols: 每行几帧（只有一行就不用写）
  //             精灵图会自动播到最后一帧，不用写 duration。
  //             想连着播几遍就加 repeat: 2（比如转两圈）。
  //   每个动作的画布大小要一样（比如都是 64×64），背景透明。
  actions: {
    idle:  { src: 'assets/dog/idle.gif', loop: true }, // 待机：坐着吐舌头（6 帧像素 GIF）
    spin:  { src: 'assets/dog/spin.png', frames: 22, cols: 11, fps: 14 }, // ① 转圈：原地连续转两圈（约 1.6 秒；两圈中间不停顿）（精灵图，播一遍）
    sit:   { src: 'assets/dog/liedown.png', frames: 5, fps: 6.67 }, // ② 趴下：从坐着趴下去（精灵图，播一遍，约 0.75 秒）
    lying: { src: 'assets/dog/lying.png', frames: 6, fps: 6.67, loop: true }, //    趴着不动、尾巴来回摇（趴下后一直是这个样子）
    leave: { src: 'assets/dog/leave.png', frames: 12, cols: 6, fps: 8, duration: 1500 }, // ③ 走开：一下转身，背对你跑远（精灵图；缩小和往远处移由代码做，duration 和精灵图一样长）
    away:  { src: '' },                             //    走远后待着的样子（留空就用 idle）
    come:  { src: 'assets/dog/come.png', frames: 16, cols: 8, fps: 8, duration: 2000 }, // ④ 跑过来：从远处一路跑回来（正面跑步循环）再坐好（精灵图；放大回到面前由代码做）
    pet:   { src: 'assets/dog/pet.png', frames: 43, cols: 8, fps: 12, loop: true }, // ⑤ 被摸头：吐舌头、甩耳朵、摇尾巴（精灵图，手一直摆就一直播）
    shake: { src: 'assets/dog/shake.png', frames: 41, cols: 8, fps: 12 }, // ⑥ 握手：坐着抬爪子再放下（精灵图，播一遍）
    playDead: { src: 'assets/dog/dead.png', frames: 76, cols: 10, fps: 24 }, // ⑦ 装死：吓一跳→倒地→躺一会儿→爬起来坐好（精灵图，播一遍，约 3.2 秒）
    praise: { src: '', duration: 1300 },            // ⑧ 被夸（开心扭一扭）
    fetch: { src: '', duration: 4000 },             // ⑨ 扔球叼回来（一整段：追球→叼回来；留空就用卡通狗演）
    kiss:  { src: '', duration: 1600 },             // ⑩ 亲亲（凑到镜头前舔一下）
  },

  // 还没放素材的动作（src 留空），用待机图加代码动效来演（转圈、跳、躺倒…）。
  // 改成 false 就用回内置卡通狗。
  pixelFallback: true,

  // ---------- 走开后的位置 ----------
  away: {
    scale: 0.38,     // 缩到原来的多少
    offsetY: '-58%', // 往上（远处）移多少
  },

  // ---------- 手势灵敏度（觉得太难/太容易触发再调） ----------
  gestures: {
    cooldown: 1100,        // 触发一个动作后，多久内不再识别新动作（毫秒）

    // ① 食指画圈
    circleTurns: 0.8,      // 至少画多少圈（0.8 = 大约画一整圈就算）
    circleMinRadius: 0.03, // 圈至少多大（相对画面宽度）

    // ② 两指下滑
    sitMinDrop: 0.11,      // 往下滑至少多少（相对画面高度）

    // ③ 食指往旁边快速一划 → 走开
    swipeMinDist: 0.18,    // 至少划多远（相对画面宽度）

    // ④ 手掌往回收（靠手在画面里变小判断，只在狗走远时有效）
    pullRatio: 0.78,       // 手变小到 0.78 倍 → 跑过来

    // ⑤ 手掌左右摆
    petSwings: 2,          // 至少来回摆几次
    petMinAmplitude: 0.035,// 每次摆动幅度

    // ⑥ 握拳 = 握手：握拳停住，或者拳头上下晃，都算
    shakeHoldMs: 500,      // 握拳停住多久算数（毫秒）。一直握着只触发一次
    shakeSwings: 2,        // 拳头至少上下晃几次
    shakeMinAmplitude: 0.03,

    // ⑦ 两只手都比手枪：先停稳瞄准，再一起快速往上甩（装死）
    bangAimMs: 250,        // 甩之前两只手要停稳多久（毫秒）
    bangMinRise: 0.06,     // 往上甩多少（相对画面高度）

    // ⑧ 竖大拇指停住（被夸）
    praiseHoldMs: 450,     // 停多久算数（毫秒）。一直停着只触发一次

    // ⑨ 捏住（拇指碰食指）→ 松手往外甩 → 扔球
    throwMinDist: 0.1,     // 松手时手要甩出去多远（相对画面大小）

    // ⑩ 双手比心（两只食指尖碰一起、两只拇指尖碰一起）
    heartHoldMs: 300,      // 比着停多久算数（毫秒）
  },
};
