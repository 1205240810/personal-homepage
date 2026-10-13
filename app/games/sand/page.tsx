import { GamePageFrame } from '@/components/games/game-room';
import { FallingSand } from '@/components/games/sand';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '落沙模拟 · 游戏室 · 徒手拆机甲',
  description: '撒一把沙、倒一桶水、点一把火：沙会堆坡、水会摊平、油浮在水上、火烧光植物后化成烟。笔刷大小可调，场景能存到本机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('sand')} fromExplore={from === 'explore'}>
      <FallingSand />
    </GamePageFrame>
  );
}
