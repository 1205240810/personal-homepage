import { GamePageFrame } from '@/components/games/game-room';
import { QuoridorGame } from '@/components/games/quoridor';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '步步为营 · 游戏室 · 徒手拆机甲',
  description:
    '9×9 棋盘、每人 10 块墙：走一步或放一块墙，先抵达对岸者胜。六档 AI、双人同屏，也能和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('quoridor')} fromExplore={from === 'explore'}>
      <QuoridorGame fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
