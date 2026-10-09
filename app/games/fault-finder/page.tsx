import { GamePageFrame } from '@/components/games/game-room';
import { FaultFinder } from '@/components/games/fault-finder';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '故障排查 · 游戏室 · 徒手拆机甲',
  description:
    '根据传感器读数推断哪些机甲模块出了故障。答案唯一，不用猜；三档难度，每天一张今日排查。',
};

export default async function FaultFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame
      game={getGame('fault-finder')}
      fromExplore={from === 'explore'}
    >
      <div className="fault-stage">
        <FaultFinder />
      </div>
    </GamePageFrame>
  );
}
