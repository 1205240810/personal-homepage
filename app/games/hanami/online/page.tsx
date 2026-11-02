import { GamePageFrame } from '@/components/games/game-room';
import { HanamiOnline } from '@/components/play/online-hanami';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '花街七席联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线对局花街七席：服务器发牌，对手手牌与弃牌保持隐藏，藏牌在轮末揭晓。房间码或邀请链接入座，无需注册。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const fromExplore = (await searchParams).from === 'explore';
  return (
    <GamePageFrame
      game={{
        ...getGame('hanami'),
        title: '花街七席联机',
        description: metadata.description,
        controls: '选择行动与花笺；对方赠牌或比试时挑选，轮末双方确认后继续',
      }}
      fromExplore={fromExplore}
    >
      <HanamiOnline fromExplore={fromExplore} />
    </GamePageFrame>
  );
}
