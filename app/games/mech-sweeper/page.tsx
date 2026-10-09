import { GamePageFrame } from '@/components/games/game-room';
import { MechSweeper } from '@/components/games/mech-sweeper';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '机甲扫雷 · 游戏室 · 徒手拆机甲',
  description:
    '扫描机甲检修舱，标出全部故障模块，误触就会短路。三档难度，每天一张今日检修。',
};

export default async function MechSweeperPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame
      game={getGame('mech-sweeper')}
      fromExplore={from === 'explore'}
    >
      <div className="sweeper-stage">
        <MechSweeper />
      </div>
    </GamePageFrame>
  );
}
