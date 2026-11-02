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
    <GamePageFrame game={{ ...getGame('holdem-lab'), title: '德州联机', description: '两位朋友同桌，与 1–3 位 AI 对局；可选择 AI 风格与难度，服务器负责发牌和行动计时。', controls: '鼠标或触控选择弃牌、过牌、跟注或加注；每步限时 30 秒' }}>
      <HoldemOnline />
    </GamePageFrame>
  );
}
