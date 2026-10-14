/**
 * 死活 / 吃子题：小块角部局面 + 有界穷举求解器。
 * 题目图中 X 黑、O 白、+ 为“题目区域”的空点（双方只在这里落子）、. 为区域外空点。
 * 黑先。kill/capture：黑要提掉 target 所在的白棋；live：黑要让 target 所在的黑棋不被提。
 * 求解器在区域内（守方还可以虚手）搜索到给定深度，用于判对错、给出对手应着与测试验证。
 */
import { GO_PROBLEM_DATA } from './go-problem-data.ts';
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
  /** Passing is a correct answer (seki). */
  passOk?: boolean;
  /** 中文解析：要点和原因。 */
  explain: string;
  /** Generated refutations of wrong first moves (see scripts/gen-go-problems.ts). */
  wrong?: GoWrong[];
};
export type GoWrong = {
  /** Wrong first move [x, y] ([-1, -1] = pass). */
  at: [number, number];
  /** White's refutation and the best continuation, [x, y] pairs. */
  line: [number, number][];
  why: string;
};

export type ProblemSetup = {
  state: GoState;
  region: number[];
  target: number;
  attacker: Player;
  depth: number;
  /** Passing can be a correct answer (seki problems). */
  passOk: boolean;
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
    passOk: !!p.passOk,
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
  // Sometimes the best move is no move at all (e.g. keeping a seki).
  if (
    su.passOk &&
    playerWinning(su, (play(s, -1) as { state: GoState }).state, su.depth - 1)
  )
    out.push(-1);
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

export const BASE_PROBLEMS: GoProblem[] = [
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
    explain:
      '白棋的眼位是一排三个点（直三）。中间那一点是“要点”：黑点进去之后，白不论在哪边做眼，都只能得到一只眼；反过来白先占中间就分成两只眼。',
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
    explain:
      '弯三的拐角同时连着另外两点，是唯一的要点。黑点在拐角，白只能做成一只眼，黑再紧气就提掉。',
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
    explain:
      '丁四（T 字形四点）的中心连着其余三点，是要点。黑点中心后，白吃掉黑子也只能得到“弯三/直三”这类一只眼的形状，黑再点一次就杀死。',
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
    explain:
      '刀把五只有一个要点：同时连着四个点的那一格。点中它，白提子后剩下的形状仍然只有一只眼；点错任何别的位置，白占要点就活。',
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
    explain:
      '自己做活时，同样是中间的要点：黑占中间就把三格分成两只真眼；让白点进来就只剩一只眼。',
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
    explain: '弯三做活要占拐角，这样两边各留一只眼。下在端点只会把眼位缩小。',
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
    explain:
      '黑一手同时叫吃两块白棋。白接上一块，另一块就被提；就算接，接上后的整块也只剩一口气，接了也回不去——这就是“接不归”。',
  },
  {
    id: 'plum-five-kill',
    name: '梅花五：点中心',
    kind: 'kill',
    rows: [
      'OO+OOX...',
      'O+++OX...',
      'OO+OOX...',
      'OOOOXX...',
      'XXXXX....',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [0, 0],
    line: [],
    note: '十字形的五个眼位。',
    depth: 25,
    explain:
      '梅花五（十字形）只有中心一个要点，它连着其余四点。黑点中心，白不管从哪边提子，剩下的都是“丁四”“刀把五”这类可以再次点杀的形状；如果让白先占中心，四个角各成一眼，白净活。',
  },
  {
    id: 'plum-five-live',
    name: '梅花五：做活',
    kind: 'live',
    rows: [
      'XX+XXO...',
      'X+++XO...',
      'XX+XXO...',
      'XXXXOO...',
      'OOOOO....',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [0, 0],
    line: [],
    note: '轮到你守：同样的十字形眼位。',
    depth: 17,
    explain:
      '守方同样要占中心：黑在中心落子，四周立刻分出两只以上的眼，白无从下手。下在边上的任何一点，白点中心就杀死。',
  },
  {
    id: 'pyramid-four-live',
    name: '丁四：做活',
    kind: 'live',
    rows: [
      '+++XO....',
      'X+XXO....',
      'XXXOO....',
      'OOOO.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [],
    note: 'T 字形的四个眼位，轮到你。',
    depth: 9,
    explain:
      '丁四的中心连着其余三点。黑占中心，左右和下方各留一只眼；下在“脚”上，白点中心后黑只剩弯三，必死。',
  },
  {
    id: 'bulky-five-live',
    name: '刀把五：做活',
    kind: 'live',
    rows: [
      '+++XO....',
      '++XXO....',
      'XXXOO....',
      'OOOO.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [],
    note: '刀把五，轮到你守。',
    depth: 17,
    explain:
      '刀把五的要点就是连着四个点的那一格。黑先占住，剩下的点自然分成两只眼。别的点都会让白点进要点。',
  },
  {
    id: 'side-bent3-kill',
    name: '边上的弯三',
    kind: 'kill',
    rows: [
      'X+++OX...',
      'XO+OOX...',
      'XOOOX....',
      'XXXX.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 1],
    line: [],
    note: '这次眼位贴着上边。',
    depth: 11,
    explain:
      '白棋的三个眼位 B9、C9、D9 加上 C8，拐角的 C9 同时连着其他点，是要点。点中它，白只能做出一只眼。',
  },
  {
    id: 'side-pyramid-live',
    name: '边上的丁四：做活',
    kind: 'live',
    rows: [
      'O+++XO...',
      'OX+XXO...',
      'OXXXO....',
      'OOOO.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 1],
    line: [],
    note: '丁四贴边，轮到你。',
    depth: 13,
    explain: '位置变了，道理不变：占丁四的中心，三只“脚”就各成一只眼。',
  },
  {
    id: 'side-straight3-kill',
    name: '边上的直三',
    kind: 'kill',
    rows: [
      'XO+++OX..',
      'XOOOOOX..',
      'XXXXXXX..',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 0],
    line: [],
    note: '白棋在边上只有三格眼位。',
    depth: 9,
    explain:
      '直三的中间是要点。黑点中间，白两边各一格都成不了独立的两只眼，紧气后就被提。',
  },
  {
    id: 'side-straight3-live',
    name: '边上的直三：做活',
    kind: 'live',
    rows: [
      'OX+++XO..',
      'OXXXXXO..',
      'OOOOOOO..',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 0],
    line: [],
    note: '轮到你守，三格眼位。',
    depth: 9,
    explain: '占直三中间，两边各成一只真眼，白再也点不进来。',
  },
  {
    id: 'side-bulky5-kill',
    name: '边上的刀把五',
    kind: 'kill',
    rows: [
      'XO+++OX..',
      'XO++OOX..',
      'XOOOOXX..',
      'XXXXXX...',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 0],
    line: [],
    note: '找到刀把五的要害。',
    depth: 21,
    explain:
      '这五个眼位里，D9 是刀把五的要害。点中后，白吃掉黑子得到的仍是一只眼的形状，黑再点一次即可；点在其他位置，白占 D9 或 C9 就能分出两只眼，还会把你下进去的子提掉。',
  },
  {
    id: 'straight-four-fill',
    name: '直四：别自己填眼',
    kind: 'live',
    rows: [
      '++++XO...',
      'XXXXXO...',
      'OOOOOO...',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [4, 0],
    line: [],
    note: '四格一排的眼位，轮到你。怎样才不会自毁？',
    depth: 11,
    explain:
      '直四本身就是活棋：白点进中间任一点，黑占另一点就分出两只眼。中间两点都是正解，虚手也活；但下在两端会把自己缩成“直三”，白点中间就杀死了——千万别自己填眼。',
  },
  {
    id: 'ko-live',
    name: '打劫做活',
    kind: 'live',
    rows: [
      '+XXO+O...',
      'XXXXOO...',
      'OOOOO....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 0],
    line: [],
    note: '黑棋只有一只眼，右边的白子只剩一口气。',
    depth: 9,
    explain:
      '黑在 E9 提掉 D9 的白子，就有了第二只眼。这个形状是“劫”：白本来可以立刻在 D9 提回，但打劫规则不允许马上回提，白必须先在别处走一手；本题不考虑劫材，黑下一手粘在 D9 即可做活。',
  },
  {
    id: 'corner-vital',
    name: '角上的要点',
    kind: 'kill',
    rows: [
      '++OX.....',
      '+OOX.....',
      '+OXX.....',
      'OOX......',
      'XXX......',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 1],
    line: [],
    note: '角上的眼位看似很多。',
    depth: 13,
    explain:
      '白棋的眼位沿着角和边分成 A9–B9 与 A7 两段，A8 是把它们连起来的要点。黑占住 A8，剩下的空间再也分不出两只真眼；点在 A9、B9 或 A7，白就会占到要点成活，还会把你下进去的子提掉。',
  },
  {
    id: 'capture-inside-live',
    name: '提子做活',
    kind: 'live',
    rows: [
      '+O++XO...',
      'XXXXXO...',
      'OOOOOO...',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [4, 0],
    line: [],
    note: '眼位里有一颗白子。',
    depth: 11,
    explain:
      '眼位里的 B9 白子是关键。黑 C9 叫吃，白在 A9 接回是自杀，黑随后提子，眼位够做两只眼。若先下 A9，白 C9 长成两子，黑提掉后只剩两格眼位，仍是一只眼；下 D9 则是自己填眼。',
  },
  {
    id: 'double-atari',
    name: '双叫吃',
    kind: 'capture',
    rows: [
      'XO+OX....',
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
    line: [],
    note: '两块白棋共用中间的两口气。',
    depth: 5,
    explain:
      '两块白棋各只有两口气，而且都在中间这条线上。黑任意占一点，同时叫吃两块，白只能救一块（甚至连起来也只剩一口气），黑必然吃子。两点都是正解。',
  },
  {
    id: 'square-four-kill',
    name: '方四：点杀',
    kind: 'kill',
    rows: [
      '++OX.....',
      '++OX.....',
      'OOXX.....',
      'XXX......',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [2, 0],
    line: [],
    note: '四格方块眼位，怎样点死？',
    depth: 11,
    explain:
      '方四（2×2 四个空点）是典型死形：黑先在任意一格落下，白不论怎样应都做不出两只真眼，继续点杀即可。四个点都是正解——方四没有“唯一要点”，但怎么点都死。',
  },
  {
    id: 'false-eye-kill',
    name: '假眼：扑杀',
    kind: 'kill',
    rows: [
      'XO+OX....',
      'XOOOX....',
      'XXXXX....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [],
    note: '白看似两眼，其实有一只是假眼。',
    depth: 9,
    explain:
      'A9 一侧被黑子顶住，C9 看起来像第二只眼。黑扑入 C9，白提后只剩一只真眼，黑再紧气即可杀死。点错边端，白会把假眼补成真眼。',
  },
  {
    id: 'net-capture',
    name: '门吃',
    kind: 'capture',
    rows: [
      '..O......',
      '.X+X.....',
      '.XOX.....',
      '.XXX.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [2, 2],
    line: [],
    note: '白子两口气，出路已被封住。',
    depth: 5,
    explain:
      '白子两口气分别在上方与 C8。黑占 C8，白无处可逃，下一手提掉。这就是“门吃”：先封出路，再紧气吃子。',
  },
  {
    id: 'oiotoshi',
    name: '滚打包收',
    kind: 'capture',
    rows: [
      'XOO+X....',
      'XOO+X....',
      'XXXXX....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 0],
    line: [],
    note: '连续叫吃，通吃白棋。',
    depth: 9,
    explain:
      '黑先占一口公气叫吃，白接不胜接；黑再占另一口，把白子整块提掉。这是“滚打包收”的基本形：连续叫吃逼对方接，最后通吃。D9、D8 都是正解的起点。',
  },
  {
    id: 'eye-vs-noeye',
    name: '有眼杀无眼',
    kind: 'capture',
    rows: [
      'XO++XO...',
      'XOOOOX...',
      'XXXXXX...',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [1, 0],
    line: [],
    note: '黑有眼，白无眼，气很紧。',
    depth: 11,
    explain:
      '黑棋自己有一只眼，白棋没有。对杀时“有眼杀无眼”：黑占 D9 紧住白的公气，白无法反杀。先走错边，白可能逃出或反杀。',
  },
  {
    id: 'eye-vs-noeye-b',
    name: '有眼杀无眼（单缺）',
    kind: 'capture',
    rows: [
      'X+OXO....',
      'XOOOX....',
      'XXXXX....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [2, 0],
    line: [],
    note: '黑有眼，白气更紧。',
    depth: 9,
    explain:
      '黑在 B9 紧气，白无眼无法长气，下一手提掉。有眼的一方在对杀里天然多一口气。',
  },
  {
    id: 'tighten-two',
    name: '两口气：紧气',
    kind: 'capture',
    rows: [
      'X++OX....',
      'XOOOX....',
      'XXXXX....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [3, 0],
    line: [],
    note: '白只剩两口气。',
    depth: 7,
    explain:
      '白棋只剩 B9、C9 两口气。黑占其中任意一口叫吃，白逃不掉，再提即可。这是最基本的“紧气吃子”：数清气口，先占要害。',
  },
  {
    id: 'seki-pass',
    name: '双活：先动就输',
    kind: 'live',
    rows: [
      '+OOO+XO..',
      'XXXXXXO..',
      'OOOOOOO..',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    target: [5, 0],
    passOk: true,
    line: [],
    note: '黑白两块都没有眼，共用两口气。轮到你。',
    depth: 13,
    explain:
      '这是“双活”：黑白都没有眼，共用 A9、E9 两口公气。黑去紧任何一口，自己就只剩一口气，白随即提掉整块黑棋；白如果去紧，黑提掉四颗白子后得到直四，反而净活。所以双方都不敢动，正确的应对是「虚手」。',
  },
];

/** All problems with generated main lines and refutations merged in. */
export const GO_PROBLEMS: GoProblem[] = BASE_PROBLEMS.map((p) => {
  const d = GO_PROBLEM_DATA[p.id];
  return {
    ...p,
    line: p.line.length ? p.line : (d?.line ?? []),
    wrong: d?.wrong ?? [],
  };
});
