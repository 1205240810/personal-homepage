import { GamePageFrame } from '@/components/games/game-room';
import { HanamiGame } from '@/components/games/hanami/local';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '花街七席 · 游戏室 · 徒手拆机甲',
  description:
    '两人卡牌对局：茶楼七位宾客、四种送礼行动，争夺彩绸青睐。五档 AI，也能开房间和朋友联机。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('hanami')} fromExplore={from === 'explore'}>
      <HanamiGame />
    </GamePageFrame>
  );
}
