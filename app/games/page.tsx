import { GameRoom } from '@/components/games/game-room';

export const metadata = {
  title: '游戏室 · 徒手拆机甲',
  description:
    '游戏室分单机与联机：单机有德州、21 点、国际象棋、围棋、五子棋、数独与每日谜题；联机可以开房间和朋友下围棋、五子棋，单挑 21 点，或联手打德州 AI。',
};

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <GameRoom fromExplore={from === 'explore'} />;
}
