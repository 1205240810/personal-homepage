import { GamePageFrame } from '@/components/games/game-room';
import { GoOnline } from '@/components/play/online-go';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '围棋联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线下围棋：房间码或邀请链接即可入座，无需注册。支持 9 / 13 / 19 路、让子、悔棋请求、停一手与双方确认点目，断线自动重连。',
};

export default function Page() {
  return (
    <GamePageFrame game={getGame('go')}>
      <GoOnline />
    </GamePageFrame>
  );
}
