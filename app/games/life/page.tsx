import { GamePageFrame } from '@/components/games/game-room';
import { LifeSandbox } from '@/components/games/life-sandbox';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '生命游戏沙盒 · 游戏室 · 徒手拆机甲',
  description:
    '康威生命游戏：画细胞、盖图案、看它们演化；还有五道构造挑战和每天一题的今日引线。',
};

export default async function LifePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('life')} fromExplore={from === 'explore'}>
      <div className="life-stage">
        <LifeSandbox />
      </div>
    </GamePageFrame>
  );
}
