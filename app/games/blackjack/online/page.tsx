import { GamePageFrame } from '@/components/games/game-room';
import { BlackjackOnline } from '@/components/play/online-blackjack';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '21 点单挑 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线 21 点单挑：轮流坐庄，服务器洗牌发牌，暗牌只有自己能看到。房间码或邀请链接即可入座，无需注册。',
};

export default function Page() {
  return (
    <GamePageFrame
      game={{
        ...getGame('blackjack'),
        title: '21 点单挑',
        description:
          '和朋友轮流坐庄，各自保管暗牌，练习要牌、停牌和加倍。所有筹码均为虚拟数值。',
        controls: '鼠标或触控；每次行动限时 30 秒，超时自动停牌',
      }}
    >
      <BlackjackOnline />
    </GamePageFrame>
  );
}
