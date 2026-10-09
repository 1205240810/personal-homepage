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
    label: '入门',
    description: '从一次点击开始，认识相邻翻转。',
  },
  {
    id: 2,
    name: '连锁变化',
    label: '进阶',
    description: '留意重叠区域，让每次点击彼此配合。',
  },
  {
    id: 3,
    name: '进阶方阵',
    label: '挑战',
    description: '走进五阶灯阵，整理更长的解题思路。',
  },
  {
    id: 4,
    name: '轮廓追光',
    label: '轮廓',
    description: '先选首行，再逐行清理上方；亮灯少，不一定步数少。',
  },
  {
    id: 5,
    name: '行间推演',
    label: '推演',
    description: '用下一行清理上一行，最后的残光用来检验首行方案。',
  },
  {
    id: 6,
    name: '全阵归零',
    label: '共振',
    description: '把点击记成一组位置，检查重叠与抵消，再完成整片灯阵。',
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
  {
    id: 13,
    chapter: 4,
    name: '花瓣余晖',
    size: 5,
    board: 11188906,
    par: 9,
    hint: '先分清花瓣和中心的重叠；对称的亮灯不一定要按相同位置。',
  },
  {
    id: 14,
    chapter: 4,
    name: '内外回环',
    size: 5,
    board: 33084991,
    par: 9,
    hint: '外圈和中心只有一层间隔，先想哪些点击会同时改变两处。',
  },
  {
    id: 15,
    chapter: 4,
    name: '轮廓追光',
    size: 5,
    board: 33080895,
    par: 10,
    hint: '只有轮廓亮起，也可能需要点击内部暗格；从最上面一行开始观察。',
  },
  {
    id: 16,
    chapter: 4,
    name: '四向回声',
    size: 5,
    board: 4211716,
    par: 10,
    hint: '亮灯越少不一定越简单；记录首行的选择，再逐行消掉上方的灯。',
  },
  {
    id: 17,
    chapter: 4,
    name: '一点深光',
    size: 5,
    board: 4096,
    par: 11,
    hint: '中心单灯需要周围协作。用撤回比较整片变化，不要只追着最后一盏灯点。',
  },
  {
    id: 18,
    chapter: 4,
    name: '十字脉冲',
    size: 5,
    board: 4357252,
    par: 11,
    hint: '十字只是起始形状；选定第一行，再用下面一行修正上面的残光。',
  },
  {
    id: 19,
    chapter: 5,
    name: '交错花窗',
    size: 5,
    board: 15400622,
    par: 11,
    hint: '边缘和中轴会被多次影响；留意相邻点击的重叠如何成对抵消。',
  },
  {
    id: 20,
    chapter: 5,
    name: '四点归流',
    size: 5,
    board: 328000,
    par: 12,
    hint: '从第一行的不同选择出发；后面的点击清理上一行，最后检查最底行。',
  },
  {
    id: 21,
    chapter: 5,
    name: '四隅合奏',
    size: 5,
    board: 29197179,
    par: 12,
    hint: '四个角块隔着暗带，暗带上的格子也能把两侧联系起来。',
  },
  {
    id: 22,
    chapter: 5,
    name: '中央留白',
    size: 5,
    board: 33550335,
    par: 12,
    hint: '只缺中心并不比全亮容易；别用亮灯数量猜步数，跟踪每一行的残光。',
  },
  {
    id: 23,
    chapter: 5,
    name: '交替光谱',
    size: 5,
    board: 22369621,
    par: 13,
    hint: '棋盘纹样里，相邻点击总有重叠；先确定一组位置，避免追灯来回翻转。',
  },
  {
    id: 24,
    chapter: 5,
    name: '方庭回声',
    size: 5,
    board: 473536,
    par: 13,
    hint: '内部亮块和外圈暗格同属一张灯阵，边缘的点击也可能是最短解的一部分。',
  },
  {
    id: 25,
    chapter: 6,
    name: '重环共振',
    size: 5,
    board: 33412991,
    par: 13,
    hint: '每一行只负责清理上方；底行不全灭，就回到首行重新选择。',
  },
  {
    id: 26,
    chapter: 6,
    name: '交织归途',
    size: 5,
    board: 29342715,
    par: 13,
    hint: '把点击视为一组位置而不是一条路径；同一格重复两次只会抵消。',
  },
  {
    id: 27,
    chapter: 6,
    name: '环带折返',
    size: 5,
    board: 15583086,
    par: 14,
    hint: '从首行开始逐行向下推；底行负责检验，不必把所有亮格都按一遍。',
  },
  {
    id: 28,
    chapter: 6,
    name: '菱环留白',
    size: 5,
    board: 4539716,
    par: 14,
    hint: '空心菱环的内外格会互相牵动；先读第一行，避免只沿着亮圈点击。',
  },
  {
    id: 29,
    chapter: 6,
    name: '菱形共振',
    size: 5,
    board: 4685252,
    par: 15,
    hint: '完整菱形会牵动每一条边；让下行清理上行，再核对最后的残光。',
  },
  {
    id: 30,
    chapter: 6,
    name: '满庭归寂',
    size: 5,
    board: 33554431,
    par: 15,
    hint: '全亮不是全部点一遍；按行追灯，底行熄灭才说明首行选择正确。',
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
