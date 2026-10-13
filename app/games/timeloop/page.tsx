import { GamePageFrame } from '@/components/games/game-room';
import { TimeLoop } from '@/components/games/timeloop';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '时间回溯 · 游戏室 · 徒手拆机甲',
  description: '每一轮的操作都会被录下来。回溯之后，过去的你们按录像重演：一个踩住压力板，一个去开下一扇门，现在的你从中间穿过去。10 个手工关卡，支持撤销与重来。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('timeloop')} fromExplore={from === 'explore'}>
      <TimeLoop />
    </GamePageFrame>
  );
}
