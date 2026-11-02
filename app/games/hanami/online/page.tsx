import { GamePageFrame } from '@/components/games/game-room';
import { HanamiOnline } from '@/components/play/online-hanami';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '花街七席联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线对局花街七席：服务器发牌，对手手牌、藏牌与弃牌从不下发。房间码或邀请链接入座，无需注册。',
};

export default function Page() {
  return (
    <GamePageFrame game={getGame('hanami')}>
      <HanamiOnline />
    </GamePageFrame>
  );
}
