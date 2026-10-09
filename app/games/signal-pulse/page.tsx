import { GamePageFrame } from '@/components/games/game-room';
import { PulseDaily } from '@/components/home/pulse-daily';
import { PulseGame } from '@/components/home/pulse-game';
import { getGame } from '@/lib/games/catalog';
import { PULSE_LEVELS } from '@/lib/pulse-puzzle';
import '@/components/games/signal-pulse.css';

export const metadata = {
  title: '信号接力 · 游戏室 · 徒手拆机甲',
  description: `每日生成的 4 × 4 至 6 × 6 灯阵挑战与 ${PULSE_LEVELS.length} 道关卡，按步数评一至三星，让所有信号归零。支持本机存档与刷新续玩。`,
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
        <PulseDaily />
        <PulseGame />
      </div>
    </GamePageFrame>
  );
}
