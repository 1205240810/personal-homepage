export type GameId = 'holdem-lab' | 'blackjack' | 'signal-pulse';

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
    id: 'signal-pulse',
    title: '信号接力',
    description: '点亮会传递，熄灭也会。利用相邻灯的连锁变化，让整个灯阵归零。',
    href: '/games/signal-pulse',
    category: '灯阵逻辑',
    controls: '点击或轻触灯格，翻转自己与相邻灯',
    estimatedDuration: '适合短暂休息',
  },
] as const;

export function getGame(id: GameId): GameDefinition {
  return GAMES.find((game) => game.id === id)!;
}
