export type GameId =
  | 'holdem-lab'
  | 'blackjack'
  | 'signal-pulse'
  | 'sudoku'
  | 'yahtzee'
  | 'stud'
  | 'circuit-repair';

export type GameDefinition = {
  id: GameId;
  title: string;
  description: string;
  href: string;
  category: string;
  controls: string;
  estimatedDuration: string;
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
      '一张暗牌，四张明牌。随着牌面展开选择下注，与夜莺 AI 完成十手练习。',
    href: '/games/stud',
    category: '牌桌推演',
    controls: '鼠标或触控选择下注；C 过牌或跟注，F 弃牌',
    estimatedDuration: '每手约 1–2 分钟',
  },
  {
    id: 'signal-pulse',
    title: '信号接力',
    description: '点亮会传递，熄灭也会。利用相邻灯的连锁变化，让整个灯阵归零。',
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
  },
] as const;

export function getGame(id: GameId): GameDefinition {
  return GAMES.find((game) => game.id === id)!;
}
