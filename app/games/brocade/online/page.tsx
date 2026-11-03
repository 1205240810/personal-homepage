import { GamePageFrame } from '@/components/games/game-room';
import { BrocadeOnline } from '@/components/play/online-brocade';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '锦绣织造联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线对局锦绣织造：服务器校验每一步、暗订保密，断线自动重连。',
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
        ...getGame('brocade'),
        title: '锦绣织造联机',
        description: metadata.description,
        controls: '点丝线拿取，点织品购入或预订',
      }}
      fromExplore={from === 'explore'}
    >
      <BrocadeOnline fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
