import { GamePageFrame } from '@/components/games/game-room';
import { ChessGame } from '@/components/games/chess';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '国际象棋 · 游戏室 · 徒手拆机甲',
  description:
    '完整规则：王车易位、吃过路兵、升变、三次重复与五十回合判和。十档 AI 在后台线程思考（置换表、静态搜索、空着裁剪、开局库）；28 道杀局与战术题附中文解析，走错会摆出对方的反击并说明原因；另有 2 个基本残局练习。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('chess')} fromExplore={from === 'explore'}>
      <ChessGame />
    </GamePageFrame>
  );
}
