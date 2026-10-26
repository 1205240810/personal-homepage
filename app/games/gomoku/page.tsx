import { GamePageFrame } from '@/components/games/game-room';
import { GomokuGame } from '@/components/games/gomoku';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '五子棋 · 游戏室 · 徒手拆机甲',
  description:
    '15 路五子棋：十档 AI 或双人同屏，可选黑棋禁手（连珠规则），也能开房间和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('gomoku')} fromExplore={from === 'explore'}>
      <GomokuGame />
    </GamePageFrame>
  );
}
