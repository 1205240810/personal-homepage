import { GamePageFrame } from '@/components/games/game-room';
import { GlazeOnline } from '@/components/play/online-glaze';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '琉璃坊联机 · 游戏室 · 徒手拆机甲',
  description: '和朋友在线对局琉璃坊：服务器校验每一步并补砖，断线自动重连。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame
      online
      game={{
        ...getGame('glaze'),
        title: '琉璃坊联机',
        description: metadata.description,
        controls: '点釉砖，再点自己的料架或碎瓷区',
      }}
      fromExplore={from === 'explore'}
    >
      <GlazeOnline fromExplore={from === 'explore'} />
    </GamePageFrame>
  );
}
