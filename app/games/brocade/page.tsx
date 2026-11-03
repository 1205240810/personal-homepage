import { GamePageFrame } from '@/components/games/game-room';
import { BrocadeGame } from '@/components/games/brocade/local';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '锦绣织造 · 游戏室 · 徒手拆机甲',
  description:
    '两人丝线织造：收丝线、购织品、迎贵客，先到 15 点声望。五档 AI，也能和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('brocade')} fromExplore={from === 'explore'}>
      <BrocadeGame fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
