import { GamePageFrame } from '@/components/games/game-room';
import { GoGame } from '@/components/games/go';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '围棋 · 游戏室 · 徒手拆机甲',
  description: '9 / 13 / 19 路，提子、打劫、禁着点，中国规则数子与贴目，可让子。AI 用蒙特卡洛树搜索在后台线程思考（9 路最强）。另有 7 道经典死活与吃子题，下错时对手会给出反击。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('go')} fromExplore={from === 'explore'}>
      <GoGame />
    </GamePageFrame>
  );
}
