/**
 * 死活 / 吃子题：小块角部局面 + 有界穷举求解器。
 * 题目图中 X 黑、O 白、+ 为“题目区域”的空点（双方只在这里落子）、. 为区域外空点。
 * 黑先。kill/capture：黑要提掉 target 所在的白棋；live：黑要让 target 所在的黑棋不被提。
 * 求解器在区域内（守方还可以虚手）搜索到给定深度，用于判对错、给出对手应着与测试验证。
 */
import {
  BLACK,
  EMPTY,
  WHITE,
  fromRows,
  play,
  type GoState,
  type Player,
} from './go.ts';

export type ProblemKind = 'kill' | 'live' | 'capture';
export type GoProblem = {
  id: string;
  name: string;
  kind: ProblemKind;
  rows: string[];
  /** A stone of the group in question, as [x, y]. */
  target: [number, number];
  /** Main line, black and white alternating, as [x, y] pairs. */
  line: [number, number][];
  note: string;
  depth: number;
};

export type ProblemSetup = {
  state: GoState;
  region: number[];
  target: number;
  attacker: Player;
  depth: number;
};

export function setup(p: GoProblem): ProblemSetup {
  const state = fromRows(p.rows, BLACK);
  const size = state.size;
  const region: number[] = [];
  p.rows.forEach((r, y) =>
    Array.from(r).forEach((ch, x) => {
      if (ch === '+') region.push(y * size + x);
    }),
  );
  // Stones inside the problem can also be captured, freeing their points.
  p.rows.forEach((r, y) =>
    Array.from(r).forEach((ch, x) => {
      if ((ch === 'X' || ch === 'O') && touchesRegion(p.rows, x, y))
        region.push(y * size + x);
    }),
  );
  return {
    state,
    region,
    target: p.target[1] * size + p.target[0],
    attacker: p.kind === 'live' ? WHITE : BLACK,
    depth: p.depth,
  };
}
function touchesRegion(rows: string[], x: number, y: number) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].some(([a, b]) => rows[b]?.[a] === '+');
}

const key = (s: GoState) => `${s.toPlay}${s.ko}|${s.board.join('')}`;

/** Does the attacker capture the target within `depth` plies, with best play by both? */
export function attackerWins(
  su: ProblemSetup,
  s: GoState,
  depth: number,
  memo = new Map<string, boolean>(),
): boolean {
  if (s.board[su.target] === EMPTY) return true;
  if (depth <= 0) return false;
  const k = `${depth}:${key(s)}`;
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  let result: boolean;
  if (s.toPlay === su.attacker) {
    result = false;
    for (const p of su.region) {
      const r = play(s, p);
      if (r.ok && attackerWins(su, r.state, depth - 1, memo)) {
        result = true;
        break;
      }
    }
  } else {
    result = true;
    // Defender may also pass (e.g. not to fill its own eye).
    for (const p of [-1, ...su.region]) {
      if (p >= 0 && s.board[p] !== EMPTY) continue;
      const r = play(s, p);
      if (r.ok && !attackerWins(su, r.state, depth - 1, memo)) {
        result = false;
        break;
      }
    }
  }
  memo.set(k, result);
  return result;
}

/** Whether the player (always Black) is winning in state s. */
export function playerWinning(su: ProblemSetup, s: GoState, depth = su.depth) {
  const w = attackerWins(su, s, depth);
  return su.attacker === BLACK ? w : !w;
}

/** Black moves in the region that keep Black winning (all correct first moves). */
export function correctMoves(
  su: ProblemSetup,
  s: GoState = su.state,
): number[] {
  const out: number[] = [];
  for (const p of su.region) {
    const r = play(s, p);
    if (r.ok && playerWinning(su, r.state, su.depth - 1)) out.push(p);
  }
  return out;
}

/**
 * The AI (White) reply: a refutation if one exists, else the most stubborn move
 * (preferring `hint`, the main line, when it is legal).
 */
export function whiteReply(
  su: ProblemSetup,
  s: GoState,
  depth: number,
  hint?: number,
): number {
  const options = [-1, ...su.region].filter(
    (p) => p < 0 || (s.board[p] === EMPTY && play(s, p).ok),
  );
  for (const p of options) {
    const r = play(s, p);
    if (r.ok && !playerWinning(su, r.state, depth - 1) && p >= 0) return p;
  }
  if (hint !== undefined && options.includes(hint)) return hint;
  return options.find((p) => p >= 0) ?? -1;
}

export const GO_PROBLEMS: GoProblem[] = [
  {
    id: 'straight-three-kill',
    name: '直三：点眼杀',
    kind: 'kill',
    rows: [
      '+++OX....',
      'OOOOX....',
      'XXXXX....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [
      [1, 0],
      [0, 0],
      [2, 0],
    ],
    note: '直三的中间是要点：白下这里就成两只眼。',
    depth: 7,
  },
  {
    id: 'bent-three-kill',
    name: '弯三：点眼杀',
    kind: 'kill',
    rows: [
      '++OX.....',
      '+OOX.....',
      'OOXX.....',
      'XXX......',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [2, 0],
    line: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    note: '弯三的要点在拐角。',
    depth: 7,
  },
  {
    id: 'pyramid-four-kill',
    name: '丁四：点中央',
    kind: 'kill',
    rows: [
      '+++OX....',
      'O+OOX....',
      'OOOXX....',
      'XXXX.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [
      [1, 0],
      [0, 0],
      [2, 0],
      [1, 1],
      [1, 0],
      [2, 0],
      [1, 0],
    ],
    note: '丁四的三个“脚”都连着中心，中心就是要点。',
    depth: 13,
  },
  {
    id: 'bulky-five-kill',
    name: '刀把五：点要害',
    kind: 'kill',
    rows: [
      '+++OX....',
      '++OOX....',
      'OOOXX....',
      'XXXX.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [
      [1, 0],
      [0, 0],
      [0, 1],
      [2, 0],
      [0, 0],
      [1, 1],
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    note: '刀把五只有一个要点，下错一步白就活了。',
    depth: 15,
  },
  {
    id: 'straight-three-live',
    name: '直三：做活',
    kind: 'live',
    rows: [
      '+++XO....',
      'XXXXO....',
      'OOOOO....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [
      [1, 0],
      [-1, -1],
    ],
    note: '轮到你走：一手棋把眼位分成两只眼。',
    depth: 7,
  },
  {
    id: 'bent-three-live',
    name: '弯三：做活',
    kind: 'live',
    rows: [
      '++XO.....',
      '+XXO.....',
      'XXOO.....',
      'OOO......',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [2, 0],
    line: [
      [0, 0],
      [-1, -1],
    ],
    note: '同样的形状，这次轮到你守。',
    depth: 7,
  },
  {
    id: 'cut-no-return',
    name: '接不归',
    kind: 'capture',
    rows: [
      'XOO+X....',
      'XO+OX....',
      'XXXXX....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 0],
    line: [
      [3, 0],
      [-1, -1],
      [2, 1],
    ],
    note: '同时叫吃两块，白棋想接也接不回去。',
    depth: 5,
  },
];
