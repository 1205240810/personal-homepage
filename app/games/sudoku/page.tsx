import { StandaloneGameRoom } from '@/components/games/standalone-game-room';

export const metadata = {
  title: '九间数独 · 游戏室 · 徒手拆机甲',
  description:
    '120 道唯一解数独，支持题库选题、笔记和解释每一步推理的教练。进度保存在本机。',
};
export default async function SudokuPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <StandaloneGameRoom gameId="sudoku" fromExplore={from === 'explore'} />
  );
}
