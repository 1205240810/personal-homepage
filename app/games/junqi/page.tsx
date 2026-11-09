import { GamePageFrame } from '@/components/games/game-room';
import { JunqiGame } from '@/components/games/junqi';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '军棋 · 游戏室 · 徒手拆机甲',
  description:
    '两人陆战棋：铁路、公路、行营与大本营，暗棋由裁判判子。先布阵再开战，五档不偷看的 AI，也能和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('junqi')} fromExplore={from === 'explore'}>
      <JunqiGame fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
