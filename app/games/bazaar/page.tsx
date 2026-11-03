import { GamePageFrame } from '@/components/games/game-room';
import { BazaarGame } from '@/components/games/bazaar/local';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '刺桐市集 · 游戏室 · 徒手拆机甲',
  description:
    '两人交易卡牌：在泉州港的市集上进货、换货、出货，抢在对手之前卖出好价钱。五档 AI，也能和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('bazaar')} fromExplore={from === 'explore'}>
      <BazaarGame fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
