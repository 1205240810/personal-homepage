import { PULSE_LEVELS } from '../pulse-puzzle.ts';

export type GameId =
  | 'holdem-lab'
  | 'blackjack'
  | 'signal-pulse'
  | 'sudoku'
  | 'yahtzee'
  | 'stud'
  | 'circuit-repair'
  | 'mech-sweeper'
  | 'fault-finder'
  | 'life'
  | 'langton'
  | 'sand'
  | 'laser'
  | 'flow'
  | 'hashi'
  | 'maze'
  | 'rulewords'
  | 'timeloop'
  | 'chess'
  | 'go';

export type GameDefinition = {
  id: GameId;
  title: string;
  description: string;
  href: string;
  category: string;
  controls: string;
  estimatedDuration: string;
  /** Set for games with a date-seeded puzzle; shown in the game room's「今日挑战」. */
  daily?: string;
};

// Stable game IDs and routes keep homepage and world entrances independent
// from each game's implementation. Add a working route before listing a game.
export const GAMES: readonly GameDefinition[] = [
  {
    id: 'holdem-lab',
    title: '德州扑克练习桌',
    description:
      '坐进完整牌桌，自定 2–9 人、盲注与筹码；挑战不同 AI 性格，再拆开每个选择的思路。',
    href: '/games/holdem-lab',
    category: '策略练习',
    controls: '鼠标或触控选择行动',
    estimatedDuration: '每手约 1–3 分钟',
  },
  {
    id: 'blackjack',
    title: '暗牌 21',
    description:
      '自定虚拟筹码，练习要牌、加倍与分牌。跟着新手教程上桌，再让教练解释每次选择。',
    href: '/games/blackjack',
    category: '牌桌推演',
    controls: '鼠标或触控；支持要牌、停牌、加倍、分牌与投降',
    estimatedDuration: '每局约 1 分钟',
  },
  {
    id: 'sudoku',
    title: '九间数独',
    description:
      '120 道唯一解题目，逐格找回秩序。保留自己的笔记，或让教练解释下一步推理。',
    href: '/games/sudoku',
    category: '逻辑推理',
    controls: '点击格子与数字；方向键移动，1–9 填数，N 切换笔记',
    estimatedDuration: '每题约 5–20 分钟',
  },
  {
    id: 'yahtzee',
    title: '快艇骰子',
    description:
      '五颗骰子，十三个分栏。决定保留哪些点数，与蓝调 AI 比一场取舍。',
    href: '/games/yahtzee',
    category: '骰子策略',
    controls: '点击骰子保留，选择分栏后确认计分',
    estimatedDuration: '每场约 8–15 分钟',
  },
  {
    id: 'stud',
    title: '绯夜五张梭哈',
    description:
      '一暗四明，读牌也读下注。与夜莺 AI 练习十手，再从赛后建议里拆解自己的选择。',
    href: '/games/stud',
    category: '牌桌推演',
    controls: '鼠标或触控选择下注；C 过牌或跟注，F 弃牌',
    estimatedDuration: '每手约 1–2 分钟',
  },
  {
    id: 'signal-pulse',
    daily: '今日灯阵：4×4 至 6×6，按最短步数挑战三星',
    title: '信号接力',
    description: `${PULSE_LEVELS.length} 道渐进灯阵与每日 4×4 至 6×6 挑战。利用相邻灯的连锁变化，让整个灯阵归零，随时保存继续。`,
    href: '/games/signal-pulse',
    category: '灯阵逻辑',
    controls: '点击或轻触灯格，翻转自己与相邻灯',
    estimatedDuration: '适合短暂休息',
  },
  {
    id: 'circuit-repair',
    title: '线路检修',
    description:
      '机甲核心断了电。旋转每一块线路，让电流接通所有端点灯，且不留一个断头。每天一张今日线路。',
    href: '/games/circuit-repair',
    category: '旋转解谜',
    controls:
      '点击顺时针旋转，右键或 Shift + 点击逆时针；方向键移动，L 锁定线路块',
    estimatedDuration: '每张约 1–6 分钟',
    daily: '今日线路：同一天、同尺寸，所有人拿到同一张',
  },
  {
    id: 'mech-sweeper',
    title: '机甲扫雷',
    description:
      '检修舱里藏着故障模块。读懂信号数字，插旗标出每一处故障；误触一下，就是短路。第一次扫描一定安全。',
    href: '/games/mech-sweeper',
    category: '推理排查',
    controls:
      '点击扫描，右键、长按或标记模式插旗，点满旗的数字一次扫开周围；方向键移动，F 插旗',
    estimatedDuration: '每张约 1–8 分钟',
    daily: '今日故障舱：每天一张，第一次扫描一定安全',
  },
  {
    id: 'fault-finder',
    title: '故障排查',
    description:
      '传感器只告诉你每条线路上有几个故障。交叉比对读数，推断出到底是哪几个模块坏了——答案唯一，不用猜。',
    href: '/games/fault-finder',
    category: '逻辑推理',
    controls:
      '点击模块在故障、正常、未判断之间切换；方向键移动，F 标故障，X 标正常',
    estimatedDuration: '每张约 1–6 分钟',
    daily: '今日排查：传感器读数推理，答案唯一',
  },
  {
    id: 'life',
    title: '生命游戏沙盒',
    description:
      '康威生命游戏：随手画细胞、盖上滑翔机枪，看它们自己繁衍。还有五道构造挑战：用最少的细胞撑过百代、造振荡器、放飞船。',
    href: '/games/life',
    category: '沙盒模拟',
    controls:
      '点击拖动画细胞，滚轮或双指缩放；空格播放，N 单步，方向键加回车逐格编辑',
    estimatedDuration: '随玩随停，每道挑战约 2–10 分钟',
    daily: '今日引线：限定格数，让图案撑过指定代数',
  },
  {
    id: 'langton',
    title: '朗顿蚂蚁',
    description:
      '一只只会左转右转的蚂蚁，一万步混沌之后突然修起高速路。可放多只蚂蚁、自定义 RLLR 之类的转向规则，最快每帧十万步。',
    href: '/games/langton',
    category: '沙盒模拟',
    controls: '点击放蚂蚁，滚轮缩放；空格运行，N 单步，[ ] 调速',
    estimatedDuration: '随看随停',
  },
  {
    id: 'sand',
    title: '落沙模拟',
    description:
      '撒一把沙、倒一桶水、点一把火：沙会堆坡、水会摊平、油浮在水上、火烧光植物后化成烟。笔刷大小可调，场景能存到本机。',
    href: '/games/sand',
    category: '沙盒模拟',
    controls: '按住拖动撒元素；1–7 选元素，[ ] 调笔刷，空格暂停',
    estimatedDuration: '随玩随停',
  },
  {
    id: 'laser',
    title: '光线反射',
    description:
      '摆镜子、放分光镜，让一束激光点亮所有目标。6 道手工关卡，加上保证有解的随机关卡和今日光路，按用块数评星。',
    href: '/games/laser',
    category: '逻辑解谜',
    controls: '点格子放镜子、再点旋转，右键移除；方向键移动，回车放置',
    estimatedDuration: '每关约 1–5 分钟',
    daily: '今日光路：8×8 随机关卡，保证有解',
  },
  {
    id: 'flow',
    title: '连线解谜',
    description:
      '把同色圆点两两连起来，而且要把整张棋盘铺满。5×5 到 9×9 随机出题，保证有铺满的解；每天一道今日连线，记录各尺寸最快用时。',
    href: '/games/flow',
    category: '逻辑解谜',
    controls: '从圆点按住拖到同色圆点；方向键移动，回车开始/结束画线',
    estimatedDuration: '每题约 1–5 分钟',
    daily: '今日连线：7×7，保证能铺满',
  },
  {
    id: 'hashi',
    title: '数桥',
    description:
      '在岛与岛之间架桥：岛上的数字就是它的桥数，桥只走横竖、不能交叉、两岛之间最多两座，最后所有岛连成一片。每题都由求解器确认唯一解。',
    href: '/games/hashi',
    category: '逻辑解谜',
    controls: '先后点两座岛架桥，或从岛上滑动；方向键在该方向加桥',
    estimatedDuration: '每题约 2–8 分钟',
    daily: '今日数桥：9×9，唯一解',
  },
  {
    id: 'maze',
    title: '迷宫竞速',
    description:
      '四种算法现场生成迷宫（可以看着它一格格长出来），然后从左上角冲到右下角。Shift 一路跑到岔路口，手机上滑动即可；每天一张今日迷宫，记录最快用时。',
    href: '/games/maze',
    category: '反应竞速',
    controls: '方向键或 WASD 移动，Shift 快跑到岔路；手机滑动',
    estimatedDuration: '每局约 20 秒–3 分钟',
    daily: '今日迷宫：16×16，算法每天轮换',
  },
  {
    id: 'rulewords',
    title: '改写规则',
    description:
      '规则就写在地上：推动字块拼出「机甲 是 你」「旗 是 赢」「水 是 沉」……拆掉一条规则，墙就不再挡路。12 个由浅入深的原创关卡，支持撤销与重来。',
    href: '/games/rulewords',
    category: '逻辑解谜',
    controls: '方向键/WASD 移动推字，Z 撤销，R 重来；手机滑动',
    estimatedDuration: '每关约 1–10 分钟',
  },
  {
    id: 'timeloop',
    title: '时间回溯',
    description:
      '每一轮的操作都会被录下来。回溯之后，过去的你们按录像重演：一个踩住压力板，一个去开下一扇门，现在的你从中间穿过去。10 个手工关卡，支持撤销与重来。',
    href: '/games/timeloop',
    category: '逻辑解谜',
    controls: '方向键/WASD 移动，空格等待，T 回溯，Z 撤销；手机滑动',
    estimatedDuration: '每关约 1–8 分钟',
  },
  {
    id: 'chess',
    title: '国际象棋',
    description:
      '完整规则：王车易位、吃过路兵、升变、三次重复与五十回合判和。十档 AI 在后台线程思考（置换表、静态搜索、空着裁剪、开局库）；28 道杀局与战术题附中文解析，走错会摆出对方的反击并说明原因；另有 2 个基本残局练习。',
    href: '/games/chess',
    category: '棋类对弈',
    controls: '点子再点目标格；键盘方向键移动焦点、回车落子',
    estimatedDuration: '一局约 10–40 分钟',
  },
  {
    id: 'go',
    title: '围棋',
    description:
      '9 / 13 / 19 路，提子、打劫、禁着点，中国规则数子与贴目，可让子。十档 AI 用蒙特卡洛树搜索（RAVE、3×3 棋形模拟、搜索树复用）在后台线程思考（9 路最强）。另有 22 道死活与吃子题（含打劫与双活），每题附中文解析，下错时摆出对手的反击并说明原因。',
    href: '/games/go',
    category: '棋类对弈',
    controls: '点交叉点落子；键盘方向键移动、回车落子',
    estimatedDuration: '9 路一局约 10–20 分钟',
  },
] as const;

export function getGame(id: GameId): GameDefinition {
  return GAMES.find((game) => game.id === id)!;
}
