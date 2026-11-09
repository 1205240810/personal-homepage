import { GamePageFrame } from '@/components/games/game-room';
import { JunqiOnline } from '@/components/play/online-junqi';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '军棋联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线下军棋：各自布阵，服务器保管真实阵型并当裁判，只公布交战胜负；断线自动重连。',
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
        ...getGame('junqi'),
        title: '军棋联机',
        description: metadata.description,
        controls: '布阵后点棋子再点目标格；支持认输与再局交换红蓝',
      }}
      fromExplore={from === 'explore'}
    >
      <JunqiOnline fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
