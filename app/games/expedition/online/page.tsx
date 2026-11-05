import { GamePageFrame } from '@/components/games/game-room';
import { ExpeditionOnline } from '@/components/play/online-expedition';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '丝路远行联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线对局丝路远行：服务器发牌，对手手牌永远看不到，断线自动重连。',
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
        ...getGame('expedition'),
        title: '丝路远行联机',
        description: metadata.description,
        controls: '选牌出到商路或弃到驿站，再摸一张；轮末双方确认',
      }}
      fromExplore={from === 'explore'}
    >
      <ExpeditionOnline fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
