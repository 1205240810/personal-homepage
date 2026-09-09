function makeMasks(size: number) {
  return Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size),
      col = index % size;
    return [
      [row, col],
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ]
      .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size)
      .reduce((mask, [r, c]) => mask | (1 << (r * size + c)), 0);
  });
}
export const PULSE_MASKS = makeMasks(4);
const LARGE_MASKS = makeMasks(5);
export const PULSE_CHAPTERS = [
  {
    id: 1,
    name: '初识灯阵',
    description: '从一次点击开始，认识相邻翻转。',
  },
  {
    id: 2,
    name: '连锁变化',
    description: '留意重叠区域，让每次点击彼此配合。',
  },
  {
    id: 3,
    name: '进阶方阵',
    description: '走进五阶灯阵，整理更长的解题思路。',
  },
] as const;
export const PULSE_LEVELS = [
  {
    id: 1,
    chapter: 1,
    name: '一点微光',
    size: 4,
    board: 626,
    par: 1,
    hint: '点一下格子，它自己和上下左右的邻格都会翻转。',
  },
  {
    id: 2,
    chapter: 1,
    name: '两角相望',
    size: 4,
    board: 51219,
    par: 2,
    hint: '边缘和角落的格子，能影响的邻格会更少。',
  },
  {
    id: 3,
    chapter: 1,
    name: '交错光点',
    size: 4,
    board: 19506,
    par: 2,
    hint: '被两次点击共同影响的格子，会恢复原来的明暗。',
  },
  {
    id: 4,
    chapter: 1,
    name: '连锁初试',
    size: 4,
    board: 30455,
    par: 3,
    hint: '亮灯数量不等于所需步数，留意每次点击的范围。',
  },
  {
    id: 5,
    chapter: 2,
    name: '留白之间',
    size: 4,
    board: 19646,
    par: 3,
    hint: '熄灭的格子也可以点击，有时它能带来新的思路。',
  },
  {
    id: 6,
    chapter: 2,
    name: '余光成线',
    size: 4,
    board: 2791,
    par: 4,
    hint: '同一格点两次会互相抵消，尽量记住已经点过的位置。',
  },
  {
    id: 7,
    chapter: 2,
    name: '渐入回环',
    size: 4,
    board: 60251,
    par: 5,
    hint: '点击顺序不会改变最终结果，可以先想好要点哪些格子。',
  },
  {
    id: 8,
    chapter: 2,
    name: '灯影交织',
    size: 4,
    board: 46509,
    par: 6,
    hint: '一次点击可能让灯暂时变多，观察整片灯阵的变化。',
  },
  {
    id: 9,
    chapter: 3,
    name: '初见方庭',
    size: 5,
    board: 31363571,
    par: 6,
    hint: '灯阵变大了，规则相同：翻转自己和上下左右的邻格。',
  },
  {
    id: 10,
    chapter: 3,
    name: '环环相扣',
    size: 5,
    board: 22527937,
    par: 7,
    hint: '观察相邻点击的重叠区域，分清哪些变化会互相抵消。',
  },
  {
    id: 11,
    chapter: 3,
    name: '夜色回响',
    size: 5,
    board: 30185830,
    par: 8,
    hint: '把灯阵分成几行来观察，有助于理清连锁变化。',
  },
  {
    id: 12,
    chapter: 3,
    name: '星阵归寂',
    size: 5,
    board: 27013362,
    par: 9,
    hint: '耐心整理要点击的位置，再逐个检查整片灯阵。',
  },
] as const;

function masksFor(size: number) {
  return size === 4 ? PULSE_MASKS : size === 5 ? LARGE_MASKS : null;
}
export function pressPulse(board: number, cell: number, size = 4) {
  const masks = masksFor(size);
  return masks && Number.isInteger(cell) && cell >= 0 && cell < size * size
    ? board ^ masks[cell]
    : board;
}

export function solvePulse(board: number, size = 4): number | null {
  const masks = masksFor(size);
  if (
    !masks ||
    !Number.isInteger(board) ||
    board < 0 ||
    board >= 2 ** (size * size)
  )
    return null;
  let best: number | null = null,
    bestCount = Infinity;
  // Once the first row is chosen, each following row must clear the row above.
  // Checking every first-row combination gives an exact shortest solution.
  for (let first = 0; first < 1 << size; first++) {
    let state = board,
      presses = 0,
      count = 0;
    for (let col = 0; col < size; col++) {
      if (first & (1 << col)) {
        state ^= masks[col];
        presses |= 1 << col;
        count++;
      }
    }
    for (let index = size; index < size * size; index++) {
      if (state & (1 << (index - size))) {
        state ^= masks[index];
        presses |= 1 << index;
        count++;
      }
    }
    if (state === 0 && count < bestCount) {
      best = presses;
      bestCount = count;
    }
  }
  return best;
}
