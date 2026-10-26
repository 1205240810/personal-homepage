import { GamePageFrame } from '@/components/games/game-room';
import { HoldemOnline } from '@/components/play/online-holdem';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '德州联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友坐同一张德州桌，一起对抗 AI：服务器发牌并运行 AI，底牌只有自己能看到。房间码或邀请链接即可入座，无需注册。',
};

export default function Page() {
  return (
    <GamePageFrame game={getGame('holdem-lab')}>
      <HoldemOnline />
    </GamePageFrame>
  );
}
