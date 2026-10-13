import { GamePageFrame } from '@/components/games/game-room';
import { RuleWords } from '@/components/games/rulewords';
import { getGame } from '@/lib/games/catalog';

export const metadata = {
  title: '改写规则 · 游戏室 · 徒手拆机甲',
  description: '规则就写在地上：推动字块拼出「机甲 是 你」「旗 是 赢」「水 是 沉」……拆掉一条规则，墙就不再挡路。12 个由浅入深的原创关卡，支持撤销与重来。',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <GamePageFrame game={getGame('rulewords')} fromExplore={from === 'explore'}>
      <RuleWords />
    </GamePageFrame>
  );
}
