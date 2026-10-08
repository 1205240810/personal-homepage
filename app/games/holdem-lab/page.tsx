import { GamePageFrame } from '@/components/games/game-room';
import { HoldemLab } from '@/components/games/holdem-lab';
import { getGame } from '@/lib/games/catalog';

export const metadata = { title: '德州扑克练习桌 · 徒手拆机甲' };
export default async function HoldemPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  return (
    <GamePageFrame
      game={getGame('holdem-lab')}
      fromExplore={params.from === 'explore'}
    >
      <HoldemLab />
    </GamePageFrame>
  );
}
