// 琉璃坊（Azul 机制，两人）：从窑口挑釉砖，放上料架，轮末贴上照壁计分。
// 纯规则引擎，前后端共用。釉色 0..4：天青、霁红、鹅黄、墨玉、月白。

export type Color = 0 | 1 | 2 | 3 | 4;
export type Side = 0 | 1;
export const COLORS = [
  { name: '天青', glyph: '青' },
  { name: '霁红', glyph: '红' },
  { name: '鹅黄', glyph: '黄' },
  { name: '墨玉', glyph: '墨' },
  { name: '月白', glyph: '白' },
] as const;
export const FACTORIES = 5;
export const PER_COLOR = 20;
export const FLOOR = [-1, -1, -2, -2, -2, -3, -3] as const;
/** Wall colour at (row, col). */
export const wallColor = (row: number, col: number) =>
  ((col - row + 5) % 5) as Color;
export const wallCol = (row: number, c: Color) => (row + c) % 5;

export type Board = {
  lines: { color: Color | null; n: number }[];
  wall: boolean[][];
  floor: (Color | 'first')[];
  score: number;
};
export type Move = {
  /** Factory index, or -1 for the centre. */
  src: number;
  color: Color;
  /** Pattern line 0..4, or -1 to drop everything on the floor. */
  line: number;
};
export type GlazeState = {
  bag: Color[];
  lid: Color[];
  factories: Color[][];
  center: Color[];
  firstInCenter: boolean;
  boards: [Board, Board];
  toPlay: Side;
  nextFirst: Side;
  round: number;
  phase: 'play' | 'over';
  winner: Side | null | 'draw';
  /** Points scored at the last wall tiling, for the round summary. */
  lastRound: {
    gained: [number, number];
    placed: [number[][], number[][]];
  } | null;
  bonus: [number, number] | null;
  last: { side: Side; move: Move } | null;
};

const emptyBoard = (): Board => ({
  lines: Array.from({ length: 5 }, () => ({ color: null, n: 0 })),
  wall: Array.from({ length: 5 }, () => Array(5).fill(false)),
  floor: [],
  score: 0,
});

function shuffle<T>(a: T[], rng: () => number): T[] {
  const d = a.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function fill(s: GlazeState, rng: () => number): GlazeState {
  let bag = s.bag.slice();
  let lid = s.lid.slice();
  const factories: Color[][] = [];
  for (let f = 0; f < FACTORIES; f++) {
    const t: Color[] = [];
    while (t.length < 4) {
      if (!bag.length) {
        if (!lid.length) break;
        bag = shuffle(lid, rng);
        lid = [];
      }
      t.push(bag.shift()!);
    }
    factories.push(t.sort((a, b) => a - b));
  }
  return {
    ...s,
    bag,
    lid,
    factories,
    center: [],
    firstInCenter: true,
    toPlay: s.nextFirst,
  };
}

export function newGame(rng: () => number, first: Side = 0): GlazeState {
  const tiles: Color[] = [];
  for (let c = 0; c < 5; c++)
    for (let k = 0; k < PER_COLOR; k++) tiles.push(c as Color);
  return fill(
    {
      bag: shuffle(tiles, rng),
      lid: [],
      factories: [],
      center: [],
      firstInCenter: true,
      boards: [emptyBoard(), emptyBoard()],
      toPlay: first,
      nextFirst: first,
      round: 1,
      phase: 'play',
      winner: null,
      lastRound: null,
      bonus: null,
      last: null,
    },
    rng,
  );
}

/** Can `color` go on pattern line `row` of board `b`? */
export function lineAccepts(b: Board, row: number, color: Color): boolean {
  const l = b.lines[row];
  if (b.wall[row][wallCol(row, color)]) return false;
  if (l.n >= row + 1) return false;
  return l.color === null || l.color === color;
}

export function legalMoves(s: GlazeState): Move[] {
  if (s.phase !== 'play') return [];
  const b = s.boards[s.toPlay];
  const out: Move[] = [];
  const sources: [number, Color[]][] = s.factories.map(
    (f, i) => [i, f] as [number, Color[]],
  );
  sources.push([-1, s.center]);
  for (const [src, tiles] of sources) {
    const colors = new Set(tiles);
    for (const color of colors) {
      for (let line = 0; line < 5; line++)
        if (lineAccepts(b, line, color)) out.push({ src, color, line });
      out.push({ src, color, line: -1 });
    }
  }
  return out;
}

/** Horizontal + vertical run score for a tile just placed at (r, c). */
export function placeScore(wall: boolean[][], r: number, c: number): number {
  let h = 1;
  for (let x = c - 1; x >= 0 && wall[r][x]; x--) h++;
  for (let x = c + 1; x < 5 && wall[r][x]; x++) h++;
  let v = 1;
  for (let y = r - 1; y >= 0 && wall[y][c]; y--) v++;
  for (let y = r + 1; y < 5 && wall[y][c]; y++) v++;
  if (h > 1 && v > 1) return h + v;
  return h > 1 ? h : v;
}

export const floorPenalty = (n: number) =>
  FLOOR.slice(0, Math.min(n, FLOOR.length)).reduce((a, b) => a + b, 0);

function tile(s: GlazeState, rng: () => number): GlazeState {
  const lid = s.lid.slice();
  const gained: [number, number] = [0, 0];
  const placed: [number[][], number[][]] = [[], []];
  let nextFirst = s.nextFirst;
  const boards = s.boards.map((b0, p) => {
    const b: Board = {
      lines: b0.lines.map((l) => ({ ...l })),
      wall: b0.wall.map((r) => r.slice()),
      floor: [],
      score: b0.score,
    };
    let g = 0;
    b.lines.forEach((l, r) => {
      if (l.color !== null && l.n === r + 1) {
        const c = wallCol(r, l.color);
        b.wall[r][c] = true;
        g += placeScore(b.wall, r, c);
        placed[p].push([r, c]);
        for (let k = 0; k < r; k++) lid.push(l.color);
        b.lines[r] = { color: null, n: 0 };
      }
    });
    g += floorPenalty(b0.floor.length);
    for (const t of b0.floor) {
      if (t === 'first') nextFirst = p as Side;
      else lid.push(t);
    }
    b.score = Math.max(0, b.score + g);
    gained[p] = b.score - b0.score;
    return b;
  }) as [Board, Board];
  const done = boards.some((b) => b.wall.some((row) => row.every(Boolean)));
  const next: GlazeState = {
    ...s,
    boards,
    lid,
    nextFirst,
    lastRound: { gained, placed },
  };
  if (!done) return fill({ ...next, round: s.round + 1 }, rng);
  // End-of-game bonuses.
  const bonus: [number, number] = [0, 0];
  const final = boards.map((b, p) => {
    let add = 0;
    for (let r = 0; r < 5; r++) if (b.wall[r].every(Boolean)) add += 2;
    for (let c = 0; c < 5; c++) if (b.wall.every((row) => row[c])) add += 7;
    for (let k = 0; k < 5; k++)
      if ([0, 1, 2, 3, 4].every((r) => b.wall[r][wallCol(r, k as Color)]))
        add += 10;
    bonus[p] = add;
    return { ...b, score: b.score + add };
  }) as [Board, Board];
  const rows = (b: Board) => b.wall.filter((r) => r.every(Boolean)).length;
  const [a, b] = final;
  const winner: Side | 'draw' =
    a.score !== b.score
      ? a.score > b.score
        ? 0
        : 1
      : rows(a) !== rows(b)
        ? rows(a) > rows(b)
          ? 0
          : 1
        : 'draw';
  return {
    ...next,
    boards: final,
    phase: 'over',
    winner,
    bonus,
    factories: next.factories.map(() => []),
    center: [],
  };
}

export function apply(
  s: GlazeState,
  side: Side,
  m: Move,
  rng: () => number = Math.random,
): GlazeState {
  if (s.phase !== 'play') throw new Error('对局已结束');
  if (side !== s.toPlay) throw new Error('还没轮到你');
  if (
    !m ||
    !Number.isInteger(m.src) ||
    !Number.isInteger(m.color) ||
    !Number.isInteger(m.line)
  )
    throw new Error('操作无效');
  if (m.color < 0 || m.color > 4) throw new Error('釉色无效');
  const fromCenter = m.src === -1;
  const pool = fromCenter ? s.center : s.factories[m.src];
  if (!pool) throw new Error('没有这个窑口');
  const n = pool.filter((c) => c === m.color).length;
  if (!n) throw new Error('这里没有这种釉色');
  const b0 = s.boards[side];
  if (
    m.line !== -1 &&
    (m.line < 0 || m.line > 4 || !lineAccepts(b0, m.line, m.color))
  )
    throw new Error('这一层料架放不下这种釉色');
  const factories = s.factories.map((f) => f.slice());
  let center = s.center.slice();
  let firstInCenter = s.firstInCenter;
  const floor = b0.floor.slice();
  if (fromCenter) {
    center = center.filter((c) => c !== m.color);
    if (firstInCenter) {
      floor.push('first');
      firstInCenter = false;
    }
  } else {
    center = [...center, ...factories[m.src].filter((c) => c !== m.color)].sort(
      (a, b) => a - b,
    );
    factories[m.src] = [];
  }
  const lines = b0.lines.map((l) => ({ ...l }));
  let overflow = n;
  if (m.line >= 0) {
    const l = lines[m.line];
    const room = m.line + 1 - l.n;
    const put = Math.min(room, n);
    lines[m.line] = { color: m.color, n: l.n + put };
    overflow = n - put;
  }
  const lid = s.lid.slice();
  for (let k = 0; k < overflow; k++) {
    if (floor.length < FLOOR.length) floor.push(m.color);
    else lid.push(m.color);
  }
  const boards: [Board, Board] = [s.boards[0], s.boards[1]];
  boards[side] = { ...b0, lines, floor };
  const next: GlazeState = {
    ...s,
    factories,
    center,
    firstInCenter,
    boards,
    lid,
    toPlay: (1 - side) as Side,
    last: { side, move: m },
  };
  const empty = factories.every((f) => !f.length) && !center.length;
  return empty ? tile(next, rng) : next;
}

export type GlazeView = Omit<GlazeState, 'bag' | 'lid'> & {
  you: Side | null;
  bagCount: number;
  lidCount: number;
};
export function viewFor(s: GlazeState, side: Side | null): GlazeView {
  const { bag, lid, ...rest } = s;
  return { ...rest, you: side, bagCount: bag.length, lidCount: lid.length };
}

export function parseMove(raw: unknown): Move | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  if (
    Number.isInteger(m.src) &&
    Number.isInteger(m.color) &&
    Number.isInteger(m.line)
  )
    return {
      src: m.src as number,
      color: m.color as Color,
      line: m.line as number,
    };
  return null;
}
