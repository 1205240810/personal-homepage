import { GamePageFrame } from '@/components/games/game-room';
import { MazeRace } from '@/components/games/maze';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '迷宫竞速 · 游戏室 · 徒手拆机甲',
  description: '四种算法现场生成迷宫（可以看着它一格格长出来），然后从左上角冲到右下角。Shift 一路跑到岔路口，手机上滑动即可；每天一张今日迷宫，记录最快用时。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('maze')} fromExplore={from === 'explore'}>
      <MazeRace />
    </GamePageFrame>
  );
}
