import { GamePageFrame } from '@/components/games/game-room';
import { QuoridorOnline } from '@/components/play/online-quoridor';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '步步为营联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线下步步为营：房间码或邀请链接入座，服务器校验每一步，断线自动重连。',
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
        ...getGame('quoridor'),
        title: '步步为营联机',
        description: metadata.description,
        controls: '走棋或放墙；支持认输与再局交换先后手',
      }}
      fromExplore={from === 'explore'}
    >
      <QuoridorOnline fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
