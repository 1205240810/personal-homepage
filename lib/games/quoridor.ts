// 步步为营（Quoridor）：9×9 棋盘，每人 10 块墙。纯规则引擎，前后端共用。
// 坐标 i = y * 9 + x；玩家 0 从底部（y=8）出发走向 y=0，玩家 1 相反。
// 墙用 8×8 交叉点锚定：横墙 h 挡住第 y 与 y+1 行之间、第 x 与 x+1 列；
// 竖墙 v 挡住第 x 与 x+1 列之间、第 y 与 y+1 行。

export const N = 9;
export const A = 8;
export const WALLS = 10;
export type Side = 0 | 1;
export type Orient = 'h' | 'v';
export type Move =
  | { t: 'm'; to: number }
  | { t: 'w'; o: Orient; x: number; y: number };

export type QuoridorState = {
  pawns: [number, number];
  left: [number, number];
  h: boolean[];
  v: boolean[];
  toPlay: Side;
  winner: Side | null;
  reason: 'goal' | 'resign' | null;
  history: Move[];
};

export const START: [number, number] = [8 * N + 4, 4];
export const goalRow = (s: Side) => (s === 0 ? 0 : N - 1);

export function newGame(first: Side = 0): QuoridorState {
  return {
    pawns: [...START],
    left: [WALLS, WALLS],
    h: Array(A * A).fill(false),
    v: Array(A * A).fill(false),
    toPlay: first,
    winner: null,
    reason: null,
    history: [],
  };
}

const hAt = (s: { h: boolean[] }, x: number, y: number) =>
  x >= 0 && x < A && y >= 0 && y < A && s.h[y * A + x];
const vAt = (s: { v: boolean[] }, x: number, y: number) =>
  x >= 0 && x < A && y >= 0 && y < A && s.v[y * A + x];

/** Can a pawn step from cell a to the orthogonally adjacent cell (dx, dy)? */
export function open(
  s: { h: boolean[]; v: boolean[] },
  a: number,
  dx: number,
  dy: number,
): boolean {
  const x = a % N;
  const y = (a - x) / N;
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || nx >= N || ny < 0 || ny >= N) return false;
  if (dy !== 0) {
    const r = dy < 0 ? y - 1 : y;
    return !hAt(s, x - 1, r) && !hAt(s, x, r);
  }
  const c = dx < 0 ? x - 1 : x;
  return !vAt(s, c, y - 1) && !vAt(s, c, y);
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** Shortest number of steps to the goal row ignoring pawns; -1 when sealed. */
export function distance(
  s: { h: boolean[]; v: boolean[] },
  from: number,
  side: Side,
): number {
  const goal = goalRow(side);
  const seen = new Int8Array(N * N);
  let frontier = [from];
  seen[from] = 1;
  for (let d = 0; frontier.length; d++) {
    const next: number[] = [];
    for (const a of frontier) {
      if (Math.floor(a / N) === goal) return d;
      for (const [dx, dy] of DIRS)
        if (open(s, a, dx, dy)) {
          const b = a + dy * N + dx;
          if (!seen[b]) {
            seen[b] = 1;
            next.push(b);
          }
        }
    }
    frontier = next;
  }
  return -1;
}

/** One shortest path (cells after `from`) to the goal row. */
export function shortestPath(
  s: { h: boolean[]; v: boolean[] },
  from: number,
  side: Side,
): number[] {
  const goal = goalRow(side);
  const prev = new Int16Array(N * N).fill(-2);
  prev[from] = -1;
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    if (Math.floor(a / N) === goal) {
      const out: number[] = [];
      for (let c = a; c !== from; c = prev[c]) out.unshift(c);
      return out;
    }
    for (const [dx, dy] of DIRS)
      if (open(s, a, dx, dy)) {
        const b = a + dy * N + dx;
        if (prev[b] === -2) {
          prev[b] = a;
          q.push(b);
        }
      }
  }
  return [];
}

/** Legal pawn destinations for the side to move, including jumps. */
export function pawnMoves(s: QuoridorState, side: Side = s.toPlay): number[] {
  const me = s.pawns[side];
  const opp = s.pawns[1 - side];
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    if (!open(s, me, dx, dy)) continue;
    const n = me + dy * N + dx;
    if (n !== opp) {
      out.push(n);
      continue;
    }
    if (open(s, n, dx, dy)) {
      out.push(n + dy * N + dx);
      continue;
    }
    // Straight jump blocked by a wall or the edge: step diagonally.
    for (const [sx, sy] of dx === 0
      ? [
          [-1, 0],
          [1, 0],
        ]
      : [
          [0, -1],
          [0, 1],
        ])
      if (open(s, n, sx, sy)) out.push(n + sy * N + sx);
  }
  return out;
}

/** Wall fits the grid without overlapping or crossing (path not checked). */
export function wallFits(
  s: QuoridorState,
  o: Orient,
  x: number,
  y: number,
): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= A || y < 0 || y >= A) return false;
  const k = y * A + x;
  if (s.h[k] || s.v[k]) return false;
  if (o === 'h') return !hAt(s, x - 1, y) && !hAt(s, x + 1, y);
  return !vAt(s, x, y - 1) && !vAt(s, x, y + 1);
}

export function withWall(
  s: QuoridorState,
  o: Orient,
  x: number,
  y: number,
): { h: boolean[]; v: boolean[] } {
  const h = o === 'h' ? s.h.slice() : s.h;
  const v = o === 'v' ? s.v.slice() : s.v;
  (o === 'h' ? h : v)[y * A + x] = true;
  return { h, v };
}

export function wallLegal(
  s: QuoridorState,
  o: Orient,
  x: number,
  y: number,
  side: Side = s.toPlay,
): boolean {
  if (s.left[side] <= 0 || !wallFits(s, o, x, y)) return false;
  const b = withWall(s, o, x, y);
  return distance(b, s.pawns[0], 0) >= 0 && distance(b, s.pawns[1], 1) >= 0;
}

export function legalWalls(s: QuoridorState): Move[] {
  const out: Move[] = [];
  if (s.left[s.toPlay] <= 0) return out;
  for (const o of ['h', 'v'] as const)
    for (let y = 0; y < A; y++)
      for (let x = 0; x < A; x++)
        if (wallLegal(s, o, x, y)) out.push({ t: 'w', o, x, y });
  return out;
}

export function isLegal(s: QuoridorState, m: Move): boolean {
  if (s.winner !== null || !m || typeof m !== 'object') return false;
  if (m.t === 'm') return pawnMoves(s).includes(m.to);
  if (m.t === 'w')
    return (m.o === 'h' || m.o === 'v') && wallLegal(s, m.o, m.x, m.y);
  return false;
}

/** Apply without legality checks (used by the AI after generating moves). */
export function applyUnchecked(s: QuoridorState, m: Move): QuoridorState {
  const side = s.toPlay;
  const next: QuoridorState = {
    ...s,
    toPlay: (1 - side) as Side,
    history: [...s.history, m],
  };
  if (m.t === 'm') {
    const pawns: [number, number] = [...s.pawns];
    pawns[side] = m.to;
    next.pawns = pawns;
    if (Math.floor(m.to / N) === goalRow(side)) {
      next.winner = side;
      next.reason = 'goal';
    }
  } else {
    const b = withWall(s, m.o, m.x, m.y);
    next.h = b.h;
    next.v = b.v;
    const left: [number, number] = [...s.left];
    left[side]--;
    next.left = left;
  }
  return next;
}

export function play(s: QuoridorState, m: Move): QuoridorState {
  if (s.winner !== null) throw new Error('对局已结束');
  if (!isLegal(s, m))
    throw new Error(m?.t === 'w' ? '这里不能放墙' : '不能走到这里');
  return applyUnchecked(s, m);
}

export function resign(s: QuoridorState, side: Side): QuoridorState {
  if (s.winner !== null) return s;
  return { ...s, winner: (1 - side) as Side, reason: 'resign' };
}

/** Replay history minus the last n moves. */
export function undo(s: QuoridorState, n: number): QuoridorState {
  const first =
    s.history.length % 2 === 0 ? s.toPlay : ((1 - s.toPlay) as Side);
  let g = newGame(first);
  for (const m of s.history.slice(0, Math.max(0, s.history.length - n)))
    g = applyUnchecked(g, m);
  return g;
}

export function parseMove(raw: unknown): Move | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  if (
    m.t === 'm' &&
    Number.isInteger(m.to) &&
    (m.to as number) >= 0 &&
    (m.to as number) < N * N
  )
    return { t: 'm', to: m.to as number };
  if (
    m.t === 'w' &&
    (m.o === 'h' || m.o === 'v') &&
    Number.isInteger(m.x) &&
    Number.isInteger(m.y)
  )
    return { t: 'w', o: m.o, x: m.x as number, y: m.y as number };
  return null;
}

const COLS = 'abcdefghi';
export const cellName = (i: number) => `${COLS[i % N]}${N - Math.floor(i / N)}`;
export const moveName = (m: Move) =>
  m.t === 'm'
    ? cellName(m.to)
    : `${COLS[m.x]}${N - m.y - 1}${m.o === 'h' ? '横' : '竖'}墙`;
