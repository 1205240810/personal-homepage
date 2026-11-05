import { GamePageFrame } from '@/components/games/game-room';
import { BazaarOnline } from '@/components/play/online-bazaar';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '刺桐市集联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线对局刺桐市集：服务器发牌，对手的货与赏银面值看不到，断线自动重连。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame
      online
      game={{
        ...getGame('bazaar'),
        title: '刺桐市集联机',
        description: metadata.description,
        controls: '选货后点动作：拿、牵骆驼、换货、卖货；每局双方确认',
      }}
      fromExplore={from === 'explore'}
    >
      <BazaarOnline fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
