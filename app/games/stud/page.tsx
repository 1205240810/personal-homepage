import { StandaloneGameRoom } from '@/components/games/standalone-game-room';

export const metadata = {
  title: '绯夜五张梭哈 · 游戏室 · 徒手拆机甲',
  description:
    '双人五张梭哈练习桌，逐轮发牌和下注，结束后回看双方当时的思路。仅使用本机虚拟筹码。',
};
export default async function StudPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <StandaloneGameRoom gameId="stud" fromExplore={from === 'explore'} />;
}
