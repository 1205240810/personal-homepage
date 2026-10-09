import { RecentGameMark } from '@/components/games/recent-games';
import { BlackjackRoom } from '@/components/games/blackjack/blackjack-room';

export const metadata = {
  title: '暗牌 21 · 游戏室 · 徒手拆机甲',
  description:
    '一张安静的二十一点牌桌：经典 S17、策略庄家与只看当时信息的赛后教练。',
};

export default async function BlackjackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <>
      <RecentGameMark gameId="blackjack" />
      <BlackjackRoom fromExplore={from === 'explore'} />
    </>
  );
}
