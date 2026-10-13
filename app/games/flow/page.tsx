import { GamePageFrame } from '@/components/games/game-room';
import { FlowConnect } from '@/components/games/flow';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '连线解谜 · 游戏室 · 徒手拆机甲',
  description: '把同色圆点两两连起来，而且要把整张棋盘铺满。5×5 到 9×9 随机出题，保证有铺满的解；每天一道今日连线，记录各尺寸最快用时。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('flow')} fromExplore={from === 'explore'}>
      <FlowConnect />
    </GamePageFrame>
  );
}
