import { GamePageFrame } from '@/components/games/game-room';
import { CircuitRepair } from '@/components/games/circuit-repair';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '线路检修 · 游戏室 · 徒手拆机甲',
  description:
    '旋转线路块，让机甲核心的电流接通每一盏端点灯。四种尺寸，每天一张共同的今日线路。',
};

export default async function CircuitRepairPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame
      game={getGame('circuit-repair')}
      fromExplore={from === 'explore'}
    >
      <div className="circuit-stage">
        <CircuitRepair />
      </div>
    </GamePageFrame>
  );
}
