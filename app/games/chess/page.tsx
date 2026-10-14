import { GamePageFrame } from '@/components/games/game-room';
import { ChessGame } from '@/components/games/chess';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '国际象棋 · 游戏室 · 徒手拆机甲',
  description:
    '十档 AI 对弈，支持王车易位、吃过路兵、升变与和棋判定。28 道杀局和战术题附中文解析，走错后可查看对手的反击；另有 2 个基本残局练习。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('chess')} fromExplore={from === 'explore'}>
      <ChessGame />
    </GamePageFrame>
  );
}
