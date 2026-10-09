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
  | 'fault-finder';

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
] as const;

export function getGame(id: GameId): GameDefinition {
  return GAMES.find((game) => game.id === id)!;
}
