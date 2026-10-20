/**
 * 围棋 AI v2：UCT 蒙特卡洛树搜索 + RAVE（AMAF），树节点带启发式先验（提子、逃叫吃、3×3 棋形、
 * 开局线位），随机对局用 Mogo/Pachi 式的“重”策略：先应对上一手造成的叫吃（提子/长气），
 * 再在上一手周围按 3×3 棋形（扳、切、断、边上的挡/立）落子，最后才随机——且不填自己的眼、
 * 不自紧成叫吃。带边框的一维棋盘与时间戳洪泛，模拟不分配内存。Worker 里会保留搜索树，
 * 下一手若在树里就继续用（树复用）。十档难度由模拟次数/时间、选点温度和失误率控制。
 */
import {
  BLACK,
  EMPTY,
  WHITE,
  isEyeish,
  neighbours,
  other,
  play,
  type GoState,
  type Player,
} from './go.ts';

export type GoLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type LevelCfg = {
  name: string;
  playouts: number;
  timeMs: number;
  /** Softmax temperature over visit counts (0 = always the most visited). */
  temp: number;
  /** Chance of a random reasonable move. */
  blunder: number;
  note: string;
};
export const GO_LEVELS: Record<GoLevel, LevelCfg> = {
  1: {
    name: '1 · 刚学规则',
    playouts: 40,
    timeMs: 400,
    temp: 1,
    blunder: 0.3,
    note: '经常乱下',
  },
  2: {
    name: '2 · 入门',
    playouts: 120,
    timeMs: 500,
    temp: 0.8,
    blunder: 0.15,
    note: '会提子，不太会做眼',
  },
  3: {
    name: '3 · 初学',
    playouts: 300,
    timeMs: 600,
    temp: 0.6,
    blunder: 0.08,
    note: '约 300 局模拟',
  },
  4: {
    name: '4 · 初级',
    playouts: 800,
    timeMs: 800,
    temp: 0.4,
    blunder: 0.04,
    note: '约 800 局模拟',
  },
  5: {
    name: '5 · 中级',
    playouts: 2000,
    timeMs: 1200,
    temp: 0.2,
    blunder: 0.02,
    note: '约 2000 局模拟',
  },
  6: {
    name: '6 · 中级进阶',
    playouts: 4000,
    timeMs: 1600,
    temp: 0,
    blunder: 0,
    note: '约 4000 局模拟',
  },
  7: {
    name: '7 · 较强',
    playouts: 8000,
    timeMs: 2200,
    temp: 0,
    blunder: 0,
    note: '约 8000 局模拟',
  },
  8: {
    name: '8 · 强',
    playouts: 1e9,
    timeMs: 3000,
    temp: 0,
    blunder: 0,
    note: '思考约 3 秒',
  },
  9: {
    name: '9 · 更强',
    playouts: 1e9,
    timeMs: 5000,
    temp: 0,
    blunder: 0,
    note: '思考约 5 秒',
  },
  10: {
    name: '10 · 最强',
    playouts: 1e9,
    timeMs: 8000,
    temp: 0,
    blunder: 0,
    note: '思考约 8 秒',
  },
};

type Rng = () => number;

// ---------- 3×3 patterns (Pachi "moggy" set) ----------
// Center is the candidate point. X/O = the two colours (both assignments are tried),
// '.' empty, '?' anything, 'x' not X, 'o' not O, '#' off-board.
const PATTERNS = [
  ['XOX', '...', '???'], // hane: enclosing hane
  ['XO.', '...', '?.?'], // hane: non-cutting hane
  ['XO?', 'X..', 'x.?'], // hane: magari
  ['XOO', '...', '?.?'], // hane: thin hane
  ['XO?', 'O.o', '?o?'], // cut: unprotected cut
  ['XO?', 'O.X', '???'], // cut: peeped cut
  ['?X?', 'O.O', 'ooo'], // cut2
  ['OX?', 'o.O', '???'], // cut keima
  ['X.?', 'O.?', '##?'], // side: chase
  ['OX?', 'X.O', '###'], // side: block side cut
  ['?X?', 'x.O', '###'], // side: block side connection
  ['?XO', 'x.x', '###'], // side: sagari
  ['?OX', 'X.O', '###'], // side: cut
];
// Neighbour order for codes: NW N NE W E SW S SE; 2 bits each: 0 empty 1 black 2 white 3 edge.
let PAT: Uint8Array | null = null;
function patternTable() {
  if (PAT) return PAT;
  PAT = new Uint8Array(1 << 16);
  const grids: string[][] = [];
  for (const p of PATTERNS) {
    let g = p.map((r) => r.split(''));
    for (let rot = 0; rot < 4; rot++) {
      g = g[0].map((_, i) => g.map((r) => r[i]).reverse()); // rotate 90°
      for (const flip of [false, true]) {
        const h = flip ? g.map((r) => [...r].reverse()) : g;
        for (const swap of [false, true]) {
          const sw = (ch: string) =>
            !swap
              ? ch
              : (({ X: 'O', O: 'X', x: 'o', o: 'x' } as Record<string, string>)[
                  ch
                ] ?? ch);
          grids.push(
            [
              h[0][0],
              h[0][1],
              h[0][2],
              h[1][0],
              h[1][2],
              h[2][0],
              h[2][1],
              h[2][2],
            ].map(sw),
          );
        }
      }
    }
  }
  const ok = (ch: string, v: number) =>
    ch === '?' ||
    (ch === 'X' && v === 1) ||
    (ch === 'O' && v === 2) ||
    (ch === '.' && v === 0) ||
    (ch === '#' && v === 3) ||
    (ch === 'x' && v !== 1) ||
    (ch === 'o' && v !== 2);
  for (let code = 0; code < 1 << 16; code++) {
    for (const g of grids) {
      let m = true;
      for (let i = 0; i < 8 && m; i++) m = ok(g[i], (code >> (2 * i)) & 3);
      if (m) {
        PAT[code] = 1;
        break;
      }
    }
  }
  return PAT;
}

// ---------- Fast padded board for playouts ----------
const BORDER = 3;
class PBoard {
  W: number;
  size: number;
  b: Uint8Array;
  stamp: Int32Array;
  lstamp: Int32Array;
  tick = 1;
  stack: Int32Array;
  ko = -1;
  /** Offsets: N W E S and diagonals. */
  d4: number[];
  d8: number[];
  lastLib = -1;
  constructor(size: number) {
    this.size = size;
    const W = (this.W = size + 2);
    this.b = new Uint8Array(W * W).fill(BORDER);
    this.stamp = new Int32Array(W * W);
    this.lstamp = new Int32Array(W * W);
    this.stack = new Int32Array(W * W);
    this.d4 = [-W, -1, 1, W];
    this.d8 = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  }
  load(board: Uint8Array) {
    const { size, W } = this;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        this.b[(y + 1) * W + x + 1] = board[y * size + x];
  }
  toPad(p: number) {
    return ((p / this.size) | 0) * this.W + this.W + (p % this.size) + 1;
  }
  fromPad(q: number) {
    return ((q / this.W) | 0) * this.size - this.size + (q % this.W) - 1;
  }
  /** Liberties of the group at p, counted up to `cap`; sets lastLib. Also returns group size via `gsize`. */
  gsize = 0;
  libs(p: number, cap: number) {
    const { b, stamp, lstamp, stack, d4 } = this;
    const c = b[p];
    const t = ++this.tick;
    let sp = 0;
    let n = 0;
    stack[sp++] = p;
    stamp[p] = t;
    this.gsize = 0;
    while (sp) {
      const q = stack[--sp];
      this.gsize++;
      for (let k = 0; k < 4; k++) {
        const r = q + d4[k];
        const v = b[r];
        if (v === EMPTY) {
          if (lstamp[r] !== t) {
            lstamp[r] = t;
            this.lastLib = r;
            if (++n >= cap) return n;
          }
        } else if (v === c && stamp[r] !== t) {
          stamp[r] = t;
          stack[sp++] = r;
        }
      }
    }
    return n;
  }
  remove(p: number) {
    const { b, stack, d4 } = this;
    const c = b[p];
    let sp = 0;
    let n = 0;
    stack[sp++] = p;
    b[p] = EMPTY;
    while (sp) {
      const q = stack[--sp];
      n++;
      for (let k = 0; k < 4; k++) {
        const r = q + d4[k];
        if (b[r] === c) {
          b[r] = EMPTY;
          stack[sp++] = r;
        }
      }
    }
    return n;
  }
  /** Play c at p. Returns captures, or -1 if illegal (occupied, ko, suicide). */
  place(p: number, c: number) {
    const { b, d4 } = this;
    if (b[p] !== EMPTY || p === this.ko) return -1;
    b[p] = c;
    const opp = 3 - c;
    let cap = 0;
    let capAt = -1;
    for (let k = 0; k < 4; k++) {
      const r = p + d4[k];
      if (b[r] === opp && this.libs(r, 1) === 0) {
        capAt = r;
        cap += this.remove(r);
      }
    }
    const l = this.libs(p, 2);
    if (!cap && l === 0) {
      b[p] = EMPTY;
      return -1;
    }
    this.ko = cap === 1 && this.gsize === 1 && l === 1 ? capAt : -1;
    return cap;
  }
  isEye(p: number, c: number) {
    const { b, d4, d8 } = this;
    for (let k = 0; k < 4; k++) {
      const v = b[p + d4[k]];
      if (v !== c && v !== BORDER) return false;
    }
    let bad = 0;
    let edge = 0;
    for (const k of [0, 2, 5, 7]) {
      const v = b[p + d8[k]];
      if (v === BORDER) edge = 1;
      else if (v === 3 - c) bad++;
    }
    return bad + edge < 2;
  }
  /** Would playing c at p leave its own group (≥2 stones) in atari without capturing? */
  selfAtari(p: number, c: number) {
    const { b, d4 } = this;
    const opp = 3 - c;
    let empties = 0;
    for (let k = 0; k < 4; k++) {
      const r = p + d4[k];
      if (b[r] === EMPTY) empties++;
      else if (b[r] === opp && this.libs(r, 2) === 1) return false; // captures
    }
    if (empties >= 2) return false;
    b[p] = c;
    const l = this.libs(p, 2);
    const big = this.gsize >= 2;
    b[p] = EMPTY;
    return l < 2 && big;
  }
  code(p: number) {
    const { b, d8 } = this;
    let k = 0;
    for (let i = 0; i < 8; i++) k |= b[p + d8[i]] << (2 * i);
    return k;
  }
}

/** Heavy playout. Returns black-minus-white area score; fills `amaf` (padded index → first colour). */
function playout(
  pb: PBoard,
  toPlay: number,
  rng: Rng,
  amaf: Uint8Array,
  lastMove: number,
) {
  const { b, d4, d8, W } = pb;
  const pat = patternTable();
  const N = pb.size;
  const empties: number[] = [];
  for (let y = 1; y <= N; y++)
    for (let x = 1; x <= N; x++)
      if (b[y * W + x] === EMPTY) empties.push(y * W + x);
  let c = toPlay;
  let passes = 0;
  let last = lastMove;
  const cand: number[] = [];
  const maxMoves = N * N * 3;
  for (let mv = 0; mv < maxMoves && passes < 2; mv++) {
    let chosen = -1;
    if (last > 0 && b[last] !== EMPTY) {
      cand.length = 0;
      // 1. Capture an enemy group in atari next to the last move, or the last move itself.
      const opp = 3 - c;
      if (pb.libs(last, 2) === 1 && b[last] === opp) cand.push(pb.lastLib);
      for (let k = 0; k < 4; k++) {
        const r = last + d4[k];
        if (b[r] === c && pb.libs(r, 2) === 1) {
          // 2. Our group in atari: capture an attacker next to it, or extend if that gains liberties.
          const lib = pb.lastLib;
          const st = pb.stamp;
          const t = pb.tick;
          for (let y = 1; y <= N; y++)
            for (let x = 1; x <= N; x++) {
              const q = y * W + x;
              if (st[q] !== t) continue;
              for (let j = 0; j < 4; j++) {
                const e = q + d4[j];
                if (b[e] === opp && pb.libs(e, 2) === 1) cand.push(pb.lastLib);
              }
            }
          if (!pb.selfAtari(lib, c)) {
            b[lib] = c;
            const ok = pb.libs(lib, 3) >= 2;
            b[lib] = EMPTY;
            if (ok) cand.push(lib);
          }
        }
      }
      for (let i = cand.length; i > 0 && chosen < 0; i--) {
        const j = (rng() * cand.length) | 0;
        if (pb.place(cand[j], c) >= 0) chosen = cand[j];
        else {
          cand[j] = cand[cand.length - 1];
          cand.pop();
        }
      }
      // 3. 3×3 patterns around the last move.
      if (chosen < 0) {
        cand.length = 0;
        for (let k = 0; k < 8; k++) {
          const q = last + d8[k];
          if (b[q] === EMPTY && pat[pb.code(q)] && !pb.selfAtari(q, c))
            cand.push(q);
        }
        while (cand.length && chosen < 0) {
          const j = (rng() * cand.length) | 0;
          if (pb.place(cand[j], c) >= 0) chosen = cand[j];
          else {
            cand[j] = cand[cand.length - 1];
            cand.pop();
          }
        }
      }
    }
    // 4. Random point that is not our own eye and not a self-atari.
    if (chosen < 0) {
      for (let tries = empties.length; tries > 0 && empties.length; tries--) {
        const i = (rng() * empties.length) | 0;
        const p = empties[i];
        if (b[p] !== EMPTY) {
          empties[i] = empties[empties.length - 1];
          empties.pop();
          continue;
        }
        if (pb.isEye(p, c) || pb.selfAtari(p, c)) continue;
        if (pb.place(p, c) >= 0) {
          chosen = p;
          break;
        }
      }
    }
    // Sampling can miss the last few legal points: scan before passing.
    if (chosen < 0)
      for (let y = 1; y <= N && chosen < 0; y++)
        for (let x = 1; x <= N; x++) {
          const p = y * W + x;
          if (b[p] !== EMPTY || pb.isEye(p, c) || pb.selfAtari(p, c)) continue;
          if (pb.place(p, c) >= 0) {
            chosen = p;
            break;
          }
        }
    if (chosen < 0) {
      passes++;
      pb.ko = -1;
    } else {
      passes = 0;
      if (!amaf[chosen]) amaf[chosen] = c;
      if (empties.length < (N * N) / 4) {
        empties.length = 0;
        for (let y = 1; y <= N; y++)
          for (let x = 1; x <= N; x++)
            if (b[y * W + x] === EMPTY) empties.push(y * W + x);
      }
    }
    last = chosen;
    c = 3 - c;
  }
  let s = 0;
  for (let y = 1; y <= N; y++)
    for (let x = 1; x <= N; x++) {
      const p = y * W + x;
      const v = b[p];
      if (v === BLACK) s++;
      else if (v === WHITE) s--;
      else {
        let bl = 0;
        let wh = 0;
        for (let k = 0; k < 4; k++) {
          const u = b[p + d4[k]];
          if (u === BLACK) bl++;
          else if (u === WHITE) wh++;
        }
        if (bl && !wh) s++;
        else if (wh && !bl) s--;
      }
    }
  return s;
}

// ---------- Tree ----------
type Node = {
  move: number; // unpadded point, -1 pass
  player: Player;
  visits: number;
  wins: number;
  raveVisits: number;
  raveWins: number;
  prior: number;
  children: Node[] | null;
  state: GoState | null;
  /** Black's final area margin (komi applied) of every playout through this
   *  move. Keep it with visits so reused descendants retain the same sample. */
  margins?: number[];
};

function libsAt(board: Uint8Array, size: number, p: number, cap: number) {
  const c = board[p];
  const seen = new Set<number>([p]);
  const libs = new Set<number>();
  const st = [p];
  while (st.length) {
    const q = st.pop()!;
    for (const n of neighbours(size, q)) {
      if (board[n] === EMPTY) {
        libs.add(n);
        if (libs.size >= cap) return cap;
      } else if (board[n] === c && !seen.has(n)) {
        seen.add(n);
        st.push(n);
      }
    }
  }
  return libs.size;
}

/** Heuristic prior in [-3, 6] for playing p in s. */
function priorFor(s: GoState, p: number, pb: PBoard): number {
  const size = s.size;
  const me = s.toPlay;
  const opp = other(me);
  let v = 0;
  for (const n of neighbours(size, p)) {
    if (s.board[n] === opp) {
      const l = libsAt(s.board, size, n, 3);
      if (l === 1)
        v += 4; // capture
      else if (l === 2) v += 0.5; // atari
    }
    if (s.board[n] === me && libsAt(s.board, size, n, 2) === 1) v += 3; // save
  }
  const q = pb.toPad(p);
  if (patternTable()[pb.code(q)]) v += 1.5;
  if (pb.selfAtari(q, me)) v -= 3;
  const last = s.moves[s.moves.length - 1];
  if (last !== undefined && last >= 0) {
    const dx = Math.abs((last % size) - (p % size));
    const dy = Math.abs(Math.floor(last / size) - Math.floor(p / size));
    if (dx + dy <= 2) v += 1;
  }
  const x = p % size;
  const y = Math.floor(p / size);
  const line = Math.min(x, y, size - 1 - x, size - 1 - y) + 1;
  const open = s.moves.length < (size * size) / 6;
  if (line === 1) v -= open ? 3 : 0.5;
  if (line === 2 && open) v -= 1.5;
  // Joseki-ish shape for 13/19: 3-4 / 4-4 points early, third and fourth lines in the opening.
  if (size >= 13 && open) {
    if (line === 3 || line === 4) v += 1;
    const cx = Math.min(x, size - 1 - x);
    const cy = Math.min(y, size - 1 - y);
    if ((cx === 2 || cx === 3) && (cy === 2 || cy === 3) && s.moves.length < 12)
      v += 2;
  }
  return v;
}

function newNode(move: number, player: Player, prior: number): Node {
  return {
    move,
    player,
    visits: 0,
    wins: 0,
    raveVisits: 0,
    raveWins: 0,
    prior,
    children: null,
    state: null,
  };
}

/** Opening pruning: in the first `size` moves, a 1st/2nd-line point with no
 *  stone within two steps is never a good move, but random playouts on an
 *  empty board cannot tell. Searching them made short searches open on the
 *  edge at random. Contact moves near the edge stay available. */
function lonelyEdgeOpening(s: GoState, p: number) {
  const n = s.size;
  if (s.moves.length >= n) return false;
  const x = p % n;
  const y = Math.floor(p / n);
  if (Math.min(x, y, n - 1 - x, n - 1 - y) >= 2) return false;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 2) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      if (s.board[yy * n + xx] !== EMPTY) return false;
    }
  return true;
}

function expand(node: Node, pb: PBoard) {
  const s = node.state!;
  pb.b.fill(BORDER);
  pb.load(s.board);
  pb.ko = -1;
  const kids: Node[] = [];
  for (let p = 0; p < s.board.length; p++) {
    if (s.board[p] !== EMPTY || p === s.ko) continue;
    if (isEyeish(s.board, s.size, p, s.toPlay)) continue;
    if (lonelyEdgeOpening(s, p)) continue;
    if (!play(s, p).ok) continue;
    kids.push(newNode(p, s.toPlay, priorFor(s, p, pb)));
  }
  kids.push(newNode(-1, s.toPlay, kids.length ? -3 : 1));
  node.children = kids;
}

const RAVE_K = 800;
const PRIOR_N = 12;
function select(node: Node): Node {
  let best: Node | null = null;
  let bestV = -Infinity;
  const logN = Math.log(node.visits + 1);
  for (const c of node.children!) {
    const n = c.visits + PRIOR_N;
    const q =
      (c.wins +
        PRIOR_N * Math.min(0.95, Math.max(0.05, 0.5 + 0.07 * c.prior))) /
      n;
    const beta =
      c.raveVisits / (c.raveVisits + n + (c.raveVisits * n) / RAVE_K);
    const r = c.raveVisits ? c.raveWins / c.raveVisits : 0.5;
    const v = (1 - beta) * q + beta * r + 0.25 * Math.sqrt(logN / n);
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best!;
}

export type GoAiResult = {
  move: number; // -1 pass, -2 resign (decided by shouldResign, not the search)
  /** Side to move's winning share, from the best move's playouts. */
  winrate: number;
  playouts: number;
  /** Black's winning share and upper-median score lead from the same
   *  playouts as `winrate`. At exactly 50% the upper median favours black. */
  blackWinrate: number;
  lead: number;
  /** Per-point ownership averaged over this search's playouts (opt-in). */
  ownership?: Float32Array;
};

/** Win share and median margin of one playout sample (black perspective). */
export function marginStats(margins: number[]) {
  if (!margins.length) return { blackWinrate: 0.5, lead: 0 };
  const m = [...margins].sort((a, b) => a - b);
  const wins = m.filter((x) => x > 0).length;
  // Upper median: positive exactly when at least half of the playouts are won.
  return { blackWinrate: wins / m.length, lead: m[m.length >> 1] };
}

// Tree reuse across calls (each worker keeps its own).
let kept: { root: Node; komi: number } | null = null;
const sameState = (a: GoState, b: GoState) =>
  a.size === b.size &&
  a.toPlay === b.toPlay &&
  a.ko === b.ko &&
  a.passes === b.passes &&
  a.moves.length === b.moves.length &&
  a.moves.at(-1) === b.moves.at(-1) &&
  a.board.every((v, i) => v === b.board[i]);
function reuse(s: GoState, komi: number): Node | null {
  if (!kept || kept.komi !== komi || kept.root.state!.size !== s.size)
    return null;
  // The new position is usually two plies below the old root (our move, their reply).
  const queue: [Node, number][] = [[kept.root, 0]];
  while (queue.length) {
    const [n, d] = queue.shift()!;
    if (n.state && sameState(n.state, s)) return n;
    if (d < 2 && n.children)
      for (const c of n.children)
        if (c.state && c.visits > 0) queue.push([c, d + 1]);
  }
  return null;
}
/** Forget the kept tree (tests, new games). */
export function resetGoTree() {
  kept = null;
}

export function chooseGoMove(
  s: GoState,
  komi: number,
  level: GoLevel,
  rng: Rng = Math.random,
  now: () => number = () => Date.now(),
  opts: {
    reuse?: boolean;
    keep?: boolean;
    playouts?: number;
    timeMs?: number;
    ownership?: boolean;
  } = {},
): GoAiResult {
  const cfg = {
    ...GO_LEVELS[level],
    ...(opts.playouts ? { playouts: opts.playouts } : {}),
    ...(opts.timeMs ? { timeMs: opts.timeMs } : {}),
  };
  const deadline = now() + cfg.timeMs;
  const pb = new PBoard(s.size);
  let root = opts.reuse === false ? null : reuse(s, komi);
  if (!root) {
    root = newNode(-1, other(s.toPlay), 0);
    root.state = s;
  }
  if (!root.children) expand(root, pb);
  const amaf = new Uint8Array(pb.W * pb.W);
  const own = opts.ownership ? new Float32Array(s.board.length) : null;
  let n = 0;
  const start = root.visits;
  while (n < cfg.playouts && now() < deadline) {
    n++;
    const path: Node[] = [root];
    let node = root;
    while (node.children && node.children.length) {
      node = select(node);
      path.push(node);
      if (!node.state) {
        const parent = path[path.length - 2].state!;
        const r = play(parent, node.move);
        node.state = r.ok ? r.state : parent;
      }
      if (node.visits < 2) break;
      if (!node.children && node.state.passes < 2) expand(node, pb);
    }
    const st = node.state!;
    amaf.fill(0);
    let diff: number;
    pb.b.fill(BORDER);
    pb.load(st.board);
    if (st.passes >= 2) diff = areaOf(pb);
    else {
      pb.ko = st.ko >= 0 ? pb.toPad(st.ko) : -1;
      const lm = st.moves[st.moves.length - 1];
      diff = playout(
        pb,
        st.toPlay,
        rng,
        amaf,
        lm !== undefined && lm >= 0 ? pb.toPad(lm) : -1,
      );
    }
    const margin = diff - komi;
    const blackWins = margin > 0;
    if (own) addOwnership(pb, own);
    for (const p of path) {
      p.visits++;
      // A descendant can become the root on the next turn. Its children's
      // margins must cover the same simulations as their existing visits.
      if (p !== root) (p.margins ??= []).push(margin);
      if ((p.player === BLACK) === blackWins) p.wins++;
      if (p.children)
        for (const c of p.children)
          if (c.move >= 0 && amaf[pb.toPad(c.move)] === c.player) {
            c.raveVisits++;
            if ((c.player === BLACK) === blackWins) c.raveWins++;
          }
    }
  }
  if (opts.keep !== false) kept = { root, komi };
  const kids = root.children!;
  const best = kids.reduce((a, c) => (c.visits > a.visits ? c : a), kids[0]);
  const total = root.visits - start;
  const est = best.margins?.length
    ? marginStats(best.margins)
    : { blackWinrate: 0.5, lead: 0 };
  const winrate = s.toPlay === BLACK ? est.blackWinrate : 1 - est.blackWinrate;
  const extra = {
    blackWinrate: est.blackWinrate,
    lead: est.lead,
    ...(own ? { ownership: own.map((v) => v / Math.max(1, n)) } : {}),
  };
  // Weaker levels: occasional random reasonable move, otherwise sample by visits.
  if (cfg.blunder && rng() < cfg.blunder) {
    const ok = kids.filter((c) => c.move >= 0 && c.prior > -1);
    if (ok.length) {
      const c = ok[(rng() * ok.length) | 0];
      return {
        move: c.move,
        winrate, // best-move estimate: the honest evaluation of the position
        playouts: total,
        ...extra,
      };
    }
  }
  if (cfg.temp > 0) {
    const pool = kids.filter(
      (c) => c.visits > 0 && (c.move >= 0 || best.move < 0),
    );
    const w = pool.map((c) => Math.pow(c.visits / best.visits, 1 / cfg.temp));
    let r = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= w[i];
      if (r <= 0) {
        const c = pool[i];
        return {
          move: c.move,
          winrate,
          playouts: total,
          ...extra,
        };
      }
    }
  }
  return { move: best.move, winrate, playouts: total, ...extra };
}

function areaOf(pb: PBoard) {
  const { b, d4, W, size: N } = pb;
  let s = 0;
  for (let y = 1; y <= N; y++)
    for (let x = 1; x <= N; x++) {
      const p = y * W + x;
      if (b[p] === BLACK) s++;
      else if (b[p] === WHITE) s--;
      else {
        let bl = 0;
        let wh = 0;
        for (let k = 0; k < 4; k++) {
          if (b[p + d4[k]] === BLACK) bl++;
          else if (b[p + d4[k]] === WHITE) wh++;
        }
        if (bl && !wh) s++;
        else if (wh && !bl) s--;
      }
    }
  return s;
}

/** Monte-Carlo ownership: estimated owner per point (+1 black … -1 white). */
function addOwnership(pb: PBoard, own: Float32Array) {
  for (let p = 0; p < own.length; p++) {
    const q = pb.toPad(p);
    let o = pb.b[q] === BLACK ? 1 : pb.b[q] === WHITE ? -1 : 0;
    if (!o) {
      let bl = 0;
      let wh = 0;
      for (const d of pb.d4) {
        if (pb.b[q + d] === BLACK) bl++;
        else if (pb.b[q + d] === WHITE) wh++;
      }
      o = bl && !wh ? 1 : wh && !bl ? -1 : 0;
    }
    own[p] += o;
  }
}

export function ownership(
  s: GoState,
  samples = 200,
  rng: Rng = Math.random,
): Float32Array {
  const pb = new PBoard(s.size);
  const own = new Float32Array(s.board.length);
  const amaf = new Uint8Array(pb.W * pb.W);
  for (let i = 0; i < samples; i++) {
    pb.b.fill(BORDER);
    pb.load(s.board);
    pb.ko = s.ko >= 0 ? pb.toPad(s.ko) : -1;
    playout(pb, s.toPlay, rng, amaf, -1);
    for (let p = 0; p < s.board.length; p++) {
      const q = pb.toPad(p);
      let o = pb.b[q] === BLACK ? 1 : pb.b[q] === WHITE ? -1 : 0;
      if (!o) {
        let bl = 0;
        let wh = 0;
        for (const d of pb.d4) {
          if (pb.b[q + d] === BLACK) bl++;
          else if (pb.b[q + d] === WHITE) wh++;
        }
        o = bl && !wh ? 1 : wh && !bl ? -1 : 0;
      }
      own[p] += o / samples;
    }
  }
  return own;
}

/** Stones that probably end up captured (owner strongly the other colour). */
export function guessDead(
  s: GoState,
  samples = 200,
  rng: Rng = Math.random,
): number[] {
  const own = ownership(s, samples, rng);
  const dead: number[] = [];
  for (let p = 0; p < s.board.length; p++) {
    if (s.board[p] === BLACK && own[p] < -0.5) dead.push(p);
    if (s.board[p] === WHITE && own[p] > 0.5) dead.push(p);
  }
  return dead;
}

/** Black-perspective estimate of a position: ownership in [-1, 1] per point
 *  and the area score lead after komi (positive = black ahead). */
export function estimateScore(
  s: GoState,
  komi: number,
  samples = 200,
  rng: Rng = Math.random,
): { ownership: Float32Array; lead: number } {
  const own = ownership(s, samples, rng);
  let sum = 0;
  for (const o of own) sum += o;
  return { ownership: own, lead: Math.round((sum - komi) * 2) / 2 };
}

export type GoJudgment = {
  /** Black's winning share of the best move's playouts. */
  blackWinrate: number;
  /** Median area lead for black (komi applied) of the same playouts. */
  lead: number;
  /** Ownership averaged over all of this search's playouts. */
  ownership: number[];
  playouts: number;
};

/** Win rate and score lead share the best move's playout sample. Ownership
 *  averages every explored move; it is an illustration, not a score tally. */
export function judgeGo(
  s: GoState,
  komi: number,
  rng: Rng = Math.random,
  now: () => number = () => Date.now(),
  budget: { playouts?: number; timeMs?: number } = {},
): GoJudgment {
  const r = chooseGoMove(s, komi, 10, rng, now, {
    reuse: false,
    keep: false,
    ownership: true,
    playouts: budget.playouts ?? 3000,
    timeMs: budget.timeMs ?? 1000,
  });
  return {
    blackWinrate: r.blackWinrate,
    lead: r.lead,
    ownership: Array.from(r.ownership!, (v) => Math.round(v * 100) / 100),
    playouts: r.playouts,
  };
}

/** Resign policy, kept outside the search so it is testable and switchable.
 *  `winrates` are the AI's own best-move winrates after each of its moves,
 *  `deficit` is how many points the AI is behind (positive = losing). */
export function shouldResign(o: {
  winrates: number[];
  deficit: number;
  moveCount: number;
  size: number;
  level: GoLevel;
  enabled: boolean;
}): boolean {
  if (!o.enabled || o.level <= 2) return false;
  const area = o.size * o.size;
  // Never in the opening: ~40% of the board must have been played.
  if (o.moveCount < Math.round(area * 0.4)) return false;
  const strong = o.level >= 6;
  const need = strong ? 3 : 4;
  const limit = strong ? 0.08 : 0.04;
  const tail = o.winrates.slice(-need);
  if (tail.length < need || tail.some((w) => w >= limit)) return false;
  return o.deficit >= Math.max(10, area * (strong ? 0.12 : 0.18));
}
