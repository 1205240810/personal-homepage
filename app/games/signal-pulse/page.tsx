import { GamePageFrame } from '@/components/games/game-room';
import { PulseGame } from '@/components/home/pulse-game';
import { getGame } from '@/lib/games/catalog';
import { PULSE_LEVELS } from '@/lib/pulse-puzzle';
import '@/components/games/signal-pulse.css';

export const metadata = {
  title: '信号接力 · 游戏室 · 徒手拆机甲',
  description: `${PULSE_LEVELS.length} 道灯阵关卡，从相邻翻转到五阶方阵，让所有信号归零。支持本机存档与刷新续玩。`,
};

export default async function SignalPulsePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame
      game={getGame('signal-pulse')}
      fromExplore={from === 'explore'}
    >
      <div className="signal-stage">
        <PulseGame />
      </div>
    </GamePageFrame>
  );
}
