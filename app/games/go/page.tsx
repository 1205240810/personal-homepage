import { GamePageFrame } from '@/components/games/game-room';
import { GoGame } from '@/components/games/go';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '围棋 · 游戏室 · 徒手拆机甲',
  description:
    '9 / 13 / 19 路，提子、打劫、禁着点，中国规则数子与贴目，可让子。十档 AI 用蒙特卡洛树搜索（RAVE、3×3 棋形模拟、搜索树复用）在后台线程思考（9 路最强）。另有 22 道死活与吃子题（含打劫与双活），每题附中文解析，下错时摆出对手的反击并说明原因。',
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
