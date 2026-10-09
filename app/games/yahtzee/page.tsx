import { RecentGameMark } from '@/components/games/recent-games';
import { StandaloneGameRoom } from '@/components/games/standalone-game-room';

export const metadata = {
  title: '快艇骰子 · 游戏室 · 徒手拆机甲',
  description:
    '保留骰子、选择分栏，与 AI 完成十三回合快艇骰子对局，支持本机存档和原创配乐。',
};
export default async function YahtzeePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <>
      <RecentGameMark gameId="yahtzee" />
      <StandaloneGameRoom gameId="yahtzee" fromExplore={from === 'explore'} />
    </>
  );
}
