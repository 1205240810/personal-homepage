export type GameId = 'holdem-lab' | 'signal-pulse';

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
    description: '与 AI 对手切磋，用虚拟筹码练习决策，逐手查看策略复盘。',
    href: '/games/holdem-lab',
    category: '策略练习',
    controls: '鼠标或触控选择行动',
    estimatedDuration: '每手约 1–3 分钟',
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
