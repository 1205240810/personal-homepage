import { GameRoom } from '@/components/games/game-room';

export const metadata = {
  title: '游戏室 · 徒手拆机甲',
  description: '与 AI 对手练习德州扑克，也可以让灯阵信号归零。',
};

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <GameRoom fromExplore={from === 'explore'} />;
}
