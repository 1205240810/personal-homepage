import { GamePageFrame } from '@/components/games/game-room';
import { ExpeditionGame } from '@/components/games/expedition/local';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '丝路远行 · 游戏室 · 徒手拆机甲',
  description:
    '两人卡牌对局：五条商路、越走越远，开路先付盘缠，投契让盈亏翻倍。五档 AI，也能和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame
      game={getGame('expedition')}
      fromExplore={from === 'explore'}
    >
      <ExpeditionGame fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
