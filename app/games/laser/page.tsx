import { GamePageFrame } from '@/components/games/game-room';
import { LaserMirrors } from '@/components/games/laser';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '光线反射 · 游戏室 · 徒手拆机甲',
  description: '摆镜子、放分光镜，让一束激光点亮所有目标。6 道手工关卡，加上保证有解的随机关卡和今日光路，按用块数评星。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('laser')} fromExplore={from === 'explore'}>
      <LaserMirrors />
    </GamePageFrame>
  );
}
