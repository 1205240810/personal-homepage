import { GameRoom } from '@/components/games/game-room';

export const metadata = {
  title: '游戏室 · 徒手拆机甲',
  description:
    '在游戏室练习德州扑克与标准二十一点，挑战数独、快艇骰子、五张梭哈、每日灯阵、线路解谜、机甲扫雷与故障排查。',
};

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <GameRoom fromExplore={from === 'explore'} />;
}
