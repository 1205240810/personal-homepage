import { GamePageFrame } from '@/components/games/game-room';
import { LangtonAnt } from '@/components/games/langton';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '朗顿蚂蚁 · 游戏室 · 徒手拆机甲',
  description:
    '一只只会左转右转的蚂蚁，一万步混沌之后突然修起高速路。可放多只蚂蚁、自定义 RLLR 之类的转向规则，最快每帧十万步。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('langton')} fromExplore={from === 'explore'}>
      <LangtonAnt />
    </GamePageFrame>
  );
}
