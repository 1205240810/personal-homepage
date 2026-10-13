import { GamePageFrame } from '@/components/games/game-room';
import { HashiBridges } from '@/components/games/hashi';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '数桥 · 游戏室 · 徒手拆机甲',
  description: '在岛与岛之间架桥：岛上的数字就是它的桥数，桥只走横竖、不能交叉、两岛之间最多两座，最后所有岛连成一片。每题都由求解器确认唯一解。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('hashi')} fromExplore={from === 'explore'}>
      <HashiBridges />
    </GamePageFrame>
  );
}
