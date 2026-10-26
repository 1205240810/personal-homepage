// 五子棋规则：15 路棋盘，黑先。可选「禁手」（连珠规则）：黑棋长连、四四、三三
// 为禁手，落子即判负；白棋无禁手，长连也算胜。默认自由规则（五连及以上即胜）。
export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export type Stone = 0 | 1 | 2;
export type Player = 1 | 2;

export type GomokuState = {
  size: number;
  renju: boolean;
  cells: Stone[];
  toPlay: Player;
  moves: number[];
  winner: Player | 0 | null; // 0 = draw
  line: number[] | null;
  reason: 'five' | 'forbidden' | 'resign' | 'draw' | null;
};

export const other = (p: Player): Player => (p === BLACK ? WHITE : BLACK);
const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

export function newGame(renju = false, size = SIZE): GomokuState {
  return {
    size,
    renju,
    cells: Array(size * size).fill(EMPTY),
    toPlay: BLACK,
    moves: [],
    winner: null,
    line: null,
    reason: null,
  };
}

export const coord = (i: number, size = SIZE) =>
  `${'ABCDEFGHJKLMNOPQRST'[i % size]}${size - Math.floor(i / size)}`;

/** Stones of `p` in a row through `i` along a direction (including i). */
function run(
  cells: Stone[],
  size: number,
  i: number,
  dx: number,
  dy: number,
  p: Stone,
) {
  const x0 = i % size;
  const y0 = Math.floor(i / size);
  const line = [i];
  for (const s of [1, -1]) {
    let x = x0 + dx * s;
    let y = y0 + dy * s;
    while (
      x >= 0 &&
      y >= 0 &&
      x < size &&
      y < size &&
      cells[y * size + x] === p
    ) {
      if (s === 1) line.push(y * size + x);
      else line.unshift(y * size + x);
      x += dx * s;
      y += dy * s;
    }
  }
  return line;
}

/** The winning line made by the stone at i, or null. Exact five for black under renju. */
export function fiveAt(
  cells: Stone[],
  size: number,
  i: number,
  renju: boolean,
) {
  const p = cells[i];
  if (p === EMPTY) return null;
  for (const [dx, dy] of DIRS) {
    const l = run(cells, size, i, dx, dy, p);
    if (l.length === 5 || (l.length > 5 && !(renju && p === BLACK))) return l;
  }
  return null;
}

// ---- 禁手判定 ----
// Line pattern around i in one direction: 9 cells each side, chars '1' own,
// '0' empty, 'x' blocked (opponent or edge).
function lineCells(
  cells: Stone[],
  size: number,
  i: number,
  dx: number,
  dy: number,
) {
  const x0 = i % size;
  const y0 = Math.floor(i / size);
  const out: number[] = [];
  for (let k = -5; k <= 5; k++) {
    const x = x0 + dx * k;
    const y = y0 + dy * k;
    out.push(x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1);
  }
  return out; // index 5 is i
}

/** Does placing black at `i` (already placed) make an exact five along this line? */
function exactFiveWith(
  cells: Stone[],
  size: number,
  j: number,
  dx: number,
  dy: number,
) {
  if (cells[j] !== EMPTY) return false;
  cells[j] = BLACK;
  const ok = run(cells, size, j, dx, dy, BLACK).length === 5;
  cells[j] = EMPTY;
  return ok;
}

/** Number of distinct fours (positions completing an exact five) through i in direction. */
function foursInDir(
  cells: Stone[],
  size: number,
  i: number,
  dx: number,
  dy: number,
) {
  const idx = lineCells(cells, size, i, dx, dy);
  const wins = new Set<number>();
  for (const j of idx)
    if (j >= 0 && j !== i && exactFiveWith(cells, size, j, dx, dy)) {
      // must form five containing i
      cells[j] = BLACK;
      if (run(cells, size, j, dx, dy, BLACK).includes(i)) wins.add(j);
      cells[j] = EMPTY;
    }
  if (wins.size === 0) return 0;
  const arr = [...wins].sort((a, b) => a - b);
  if (arr.length >= 2) {
    const step = Math.abs(dy * size + dx);
    const gap = (arr[arr.length - 1] - arr[0]) / step;
    // 0 1111 0 (straight four) has its two points exactly 5 apart; any
    // other spacing means two separate fours on one line (e.g. 1 0 111 0 1).
    return gap === 5 ? 1 : 2;
  }
  return 1;
}

/** Open three through i in direction: some empty j makes a straight (open) four. */
function threeInDir(
  cells: Stone[],
  size: number,
  i: number,
  dx: number,
  dy: number,
  depth: number,
) {
  const idx = lineCells(cells, size, i, dx, dy);
  for (const j of idx) {
    if (j < 0 || cells[j] !== EMPTY) continue;
    cells[j] = BLACK;
    let straight = false;
    if (run(cells, size, j, dx, dy, BLACK).includes(i)) {
      // straight four: two distinct completion points adjacent to a run of exactly four
      const l = run(cells, size, j, dx, dy, BLACK);
      if (l.length === 4) {
        const step = dy * size + dx;
        const a = l[0] - step;
        const b = l[3] + step;
        const ok = (k: number, ref: number) => {
          const kx = k % size;
          return (
            k >= 0 &&
            k < size * size &&
            Math.abs(kx - (ref % size)) <= 1 &&
            cells[k] === EMPTY
          );
        };
        straight =
          ok(a, l[0]) &&
          ok(b, l[3]) &&
          exactFiveWith(cells, size, a, dx, dy) &&
          exactFiveWith(cells, size, b, dx, dy) &&
          (depth > 1 || !forbiddenAt(cells, size, j, depth + 1));
      }
    }
    cells[j] = EMPTY;
    if (straight) return true;
  }
  return false;
}

function forbiddenAt(
  cells: Stone[],
  size: number,
  i: number,
  depth: number,
): boolean {
  // cells[i] is BLACK already
  if (fiveAt(cells, size, i, true)) return false;
  let fours = 0;
  let threes = 0;
  for (const [dx, dy] of DIRS) {
    if (run(cells, size, i, dx, dy, BLACK).length > 5) return true;
    const f = foursInDir(cells, size, i, dx, dy);
    fours += f;
    if (f === 0 && threeInDir(cells, size, i, dx, dy, depth)) threes++;
  }
  return fours >= 2 || threes >= 2;
}

/** Cheap pre-check: a forbidden move needs a dense black line in two directions
 * (or an overline). Windows of 5 through i with ≥3 black (counting i). */
function maybeForbidden(cells: Stone[], size: number, i: number) {
  const x0 = i % size;
  const y0 = Math.floor(i / size);
  let dense = 0;
  for (const [dx, dy] of DIRS) {
    let best = 0;
    for (let k = -5; k <= 0; k++) {
      let n = 0;
      for (let t = k; t < k + 6; t++) {
        const x = x0 + dx * t;
        const y = y0 + dy * t;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const c = t === 0 ? BLACK : cells[y * size + x];
        if (c === WHITE) n -= 9;
        else if (c === BLACK) n++;
      }
      best = Math.max(best, n);
    }
    if (best >= 5) return true;
    if (best >= 3) dense++;
  }
  return dense >= 2;
}

/** Is black at empty point i a forbidden move (renju)? */
export function isForbidden(s: GomokuState, i: number) {
  if (!s.renju || s.cells[i] !== EMPTY) return false;
  if (!maybeForbidden(s.cells, s.size, i)) return false;
  const cells = s.cells.slice();
  cells[i] = BLACK;
  return forbiddenAt(cells, s.size, i, 0);
}

export function play(s: GomokuState, i: number): GomokuState {
  if (s.winner !== null) throw new Error('对局已结束');
  if (
    !Number.isInteger(i) ||
    i < 0 ||
    i >= s.cells.length ||
    s.cells[i] !== EMPTY
  )
    throw new Error('这里不能落子');
  const cells = s.cells.slice();
  cells[i] = s.toPlay;
  const next: GomokuState = {
    ...s,
    cells,
    moves: [...s.moves, i],
    toPlay: other(s.toPlay),
  };
  const line = fiveAt(cells, s.size, i, s.renju);
  if (line) return { ...next, winner: s.toPlay, line, reason: 'five' };
  if (s.renju && s.toPlay === BLACK && forbiddenAt(cells, s.size, i, 0))
    return { ...next, winner: WHITE, line: [i], reason: 'forbidden' };
  if (next.moves.length === cells.length)
    return { ...next, winner: 0, reason: 'draw' };
  return next;
}

export function undo(s: GomokuState, n = 1): GomokuState {
  let g = newGame(s.renju, s.size);
  for (const m of s.moves.slice(0, Math.max(0, s.moves.length - n)))
    g = play(g, m);
  return g;
}

export function resign(s: GomokuState, who: Player): GomokuState {
  return { ...s, winner: other(who), reason: 'resign', line: null };
}
