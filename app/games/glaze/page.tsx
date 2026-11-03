import { GamePageFrame } from '@/components/games/game-room';
import { GlazeGame } from '@/components/games/glaze/local';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '琉璃坊 · 游戏室 · 徒手拆机甲',
  description:
    '两人釉砖拼贴：从窑口挑砖、摆上料架、贴上照壁，连成片越多得分越高。五档 AI，也能和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('glaze')} fromExplore={from === 'explore'}>
      <GlazeGame fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
