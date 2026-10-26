import { GamePageFrame } from '@/components/games/game-room';
import { GomokuOnline } from '@/components/play/online-gomoku';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '五子棋联机 · 游戏室 · 徒手拆机甲',
  description:
    '和朋友在线下五子棋：房间码或邀请链接入座，可选禁手，悔棋需对方同意，断线自动重连。',
};

export default function Page() {
  return (
    <GamePageFrame game={getGame('gomoku')}>
      <GomokuOnline />
    </GamePageFrame>
  );
}
