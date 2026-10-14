import { GamePageFrame } from '@/components/games/game-room';
import { GoGame } from '@/components/games/go';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '围棋 · 游戏室 · 徒手拆机甲',
  description:
    '9 / 13 / 19 路与十档 AI，支持让子、提子、劫和数子，9 路更适合练习。29 道死活与吃子题附中文解析，包含打劫与双活；走错后可查看对手的反击。',
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
