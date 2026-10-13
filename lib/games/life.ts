// 生命游戏沙盒：Conway's Game of Life (B3/S23).
// Pure rules only: typed-array boards, stepping with optional toroidal wrap,
// a pattern library with rotation, challenge evaluation, the daily challenge
// and local records. The React screen is components/games/life-sandbox.tsx.

export type Board = { width: number; height: number; cells: Uint8Array };

export function createBoard(width: number, height: number): Board {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 3 ||
    height < 3
  )
    throw new RangeError('棋盘至少 3 × 3');
  return { width, height, cells: new Uint8Array(width * height) };
}
export const cloneBoard = (b: Board): Board => ({
  width: b.width,
  height: b.height,
  cells: b.cells.slice(),
});
export function population(b: Board): number {
  let n = 0;
  for (let i = 0; i < b.cells.length; i++) n += b.cells[i];
  return n;
}
export const inBounds = (b: Board, x: number, y: number) =>
  x >= 0 && y >= 0 && x < b.width && y < b.height;
export function setCell(b: Board, x: number, y: number, alive: boolean) {
  if (inBounds(b, x, y)) b.cells[y * b.width + x] = alive ? 1 : 0;
}
export const getCell = (b: Board, x: number, y: number) =>
  inBounds(b, x, y) ? b.cells[y * b.width + x] : 0;

/**
 * One generation of B3/S23. `wrap` joins opposite edges (torus); otherwise
 * everything beyond the edge is dead. Writes into `out` when given (it must
 * have the same size) so the UI can ping-pong two buffers without allocating.
 */
export function step(b: Board, wrap: boolean, out?: Uint8Array): Board {
  const { width: w, height: h, cells } = b;
  const next = out ?? new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const up = y === 0 ? (wrap ? h - 1 : -1) : y - 1;
    const down = y === h - 1 ? (wrap ? 0 : -1) : y + 1;
    for (let x = 0; x < w; x++) {
      const left = x === 0 ? (wrap ? w - 1 : -1) : x - 1;
      const right = x === w - 1 ? (wrap ? 0 : -1) : x + 1;
      let n = 0;
      for (const row of [up, y, down]) {
        if (row < 0) continue;
        const base = row * w;
        if (left >= 0) n += cells[base + left];
        if (row !== y) n += cells[base + x];
        if (right >= 0) n += cells[base + right];
      }
      const alive = cells[y * w + x];
      next[y * w + x] = n === 3 || (alive && n === 2) ? 1 : 0;
    }
  }
  return { width: w, height: h, cells: next };
}

export function randomize(b: Board, density: number, random: () => number) {
  for (let i = 0; i < b.cells.length; i++)
    b.cells[i] = random() < density ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Patterns. Rows use `O` for live and `.` for dead cells.

export type PatternId =
  | 'glider'
  | 'lwss'
  | 'blinker'
  | 'toad'
  | 'beacon'
  | 'pulsar'
  | 'pentadecathlon'
  | 'block'
  | 'beehive'
  | 'r-pentomino'
  | 'acorn'
  | 'diehard'
  | 'gosper-gun';
export type Pattern = {
  id: PatternId;
  name: string;
  kind: '飞船' | '振荡器' | '静物' | '长寿种子' | '枪';
  note: string;
  rows: string[];
};
export const PATTERNS: readonly Pattern[] = [
  {
    id: 'glider',
    name: '滑翔机',
    kind: '飞船',
    note: '每 4 代斜移一格',
    rows: ['.O.', '..O', 'OOO'],
  },
  {
    id: 'lwss',
    name: '轻型飞船',
    kind: '飞船',
    note: '每 4 代平移两格',
    rows: ['.O..O', 'O....', 'O...O', 'OOOO.'],
  },
  {
    id: 'blinker',
    name: '闪烁灯',
    kind: '振荡器',
    note: '周期 2',
    rows: ['OOO'],
  },
  {
    id: 'toad',
    name: '蟾蜍',
    kind: '振荡器',
    note: '周期 2',
    rows: ['.OOO', 'OOO.'],
  },
  {
    id: 'beacon',
    name: '信标',
    kind: '振荡器',
    note: '周期 2',
    rows: ['OO..', 'OO..', '..OO', '..OO'],
  },
  {
    id: 'pulsar',
    name: '脉冲星',
    kind: '振荡器',
    note: '周期 3',
    rows: [
      '..OOO...OOO..',
      '.............',
      'O....O.O....O',
      'O....O.O....O',
      'O....O.O....O',
      '..OOO...OOO..',
      '.............',
      '..OOO...OOO..',
      'O....O.O....O',
      'O....O.O....O',
      'O....O.O....O',
      '.............',
      '..OOO...OOO..',
    ],
  },
  {
    id: 'pentadecathlon',
    name: '十五项全能',
    kind: '振荡器',
    note: '周期 15',
    rows: ['..O....O..', 'OO.OOOO.OO', '..O....O..'],
  },
  {
    id: 'block',
    name: '方块',
    kind: '静物',
    note: '永远不变',
    rows: ['OO', 'OO'],
  },
  {
    id: 'beehive',
    name: '蜂巢',
    kind: '静物',
    note: '永远不变',
    rows: ['.OO.', 'O..O', '.OO.'],
  },
  {
    id: 'r-pentomino',
    name: 'R 五格',
    kind: '长寿种子',
    note: '5 格，演化 1103 代',
    rows: ['.OO', 'OO.', '.O.'],
  },
  {
    id: 'acorn',
    name: '橡子',
    kind: '长寿种子',
    note: '7 格，演化 5206 代',
    rows: ['.O.....', '...O...', 'OO..OOO'],
  },
  {
    id: 'diehard',
    name: '顽固',
    kind: '长寿种子',
    note: '130 代后全部消失',
    rows: ['......O.', 'OO......', '.O...OOO'],
  },
  {
    id: 'gosper-gun',
    name: '高斯帕滑翔机枪',
    kind: '枪',
    note: '每 30 代射出一架滑翔机',
    rows: [
      '........................O...........',
      '......................O.O...........',
      '............OO......OO............OO',
      '...........O...O....OO............OO',
      'OO........O.....O...OO..............',
      'OO........O...O.OO....O.O...........',
      '..........O.....O.......O...........',
      '...........O...O....................',
      '............OO......................',
    ],
  },
];
export const getPattern = (id: PatternId) => PATTERNS.find((p) => p.id === id)!;

/** Live cells of a pattern as [x, y] offsets, after `turns` quarter turns clockwise. */
export function patternCells(
  rows: readonly string[],
  turns = 0,
): [number, number][] {
  let cells: [number, number][] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'O') cells.push([x, y]);
  });
  let w = Math.max(...rows.map((r) => r.length)),
    h = rows.length;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    // Clockwise inside the bounding box: (x, y) -> (h - 1 - y, x).
    const height = h;
    cells = cells.map(([x, y]) => [height - 1 - y, x]);
    [w, h] = [h, w];
  }
  return cells;
}
export function patternSize(rows: readonly string[], turns = 0) {
  const w = Math.max(...rows.map((r) => r.length)),
    h = rows.length;
  return turns % 2 ? { width: h, height: w } : { width: w, height: h };
}

/** Stamp a pattern with its top-left at (x, y). Off-board cells wrap or are dropped. */
export function stamp(
  b: Board,
  rows: readonly string[],
  x: number,
  y: number,
  turns = 0,
  wrap = false,
) {
  for (const [dx, dy] of patternCells(rows, turns)) {
    let cx = x + dx,
      cy = y + dy;
    if (wrap) {
      cx = ((cx % b.width) + b.width) % b.width;
      cy = ((cy % b.height) + b.height) % b.height;
    }
    setCell(b, cx, cy, true);
  }
}
export function boardFromRows(
  rows: readonly string[],
  width: number,
  height: number,
  x = 0,
  y = 0,
) {
  const b = createBoard(width, height);
  stamp(b, rows, x, y);
  return b;
}

/** Bounding box of live cells, or null for an empty board. */
export function liveBounds(b: Board) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++)
      if (b.cells[y * b.width + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  return maxX < 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
const sameCells = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
/** Live cells relative to their bounding box, for shape comparison under translation. */
function shapeKey(b: Board) {
  const box = liveBounds(b);
  if (!box) return '';
  const out: string[] = [];
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++)
      if (b.cells[y * b.width + x]) out.push(`${x - box.x},${y - box.y}`);
  return `${box.width}x${box.height}:${out.join(';')}`;
}

/** Smallest p ≤ maxPeriod with gen(p) == gen(0) exactly, else null. 1 = still life. */
export function oscillatorPeriod(
  b: Board,
  wrap: boolean,
  maxPeriod: number,
): number | null {
  let cur = b;
  for (let p = 1; p <= maxPeriod; p++) {
    cur = step(cur, wrap);
    if (sameCells(cur.cells, b.cells)) return population(b) ? p : null;
  }
  return null;
}
/** Smallest p ≤ maxPeriod where the shape reappears moved by a non-zero offset. */
export function spaceshipPeriod(
  b: Board,
  wrap: boolean,
  maxPeriod: number,
): number | null {
  const key = shapeKey(b),
    start = liveBounds(b);
  if (!start) return null;
  let cur = b;
  for (let p = 1; p <= maxPeriod; p++) {
    cur = step(cur, wrap);
    const box = liveBounds(cur);
    if (
      box &&
      shapeKey(cur) === key &&
      (box.x !== start.x || box.y !== start.y)
    )
      return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Challenges. The player draws a seed inside a build zone, then 验证 runs it.

export type ChallengeGoal =
  | { type: 'survive'; generations: number }
  | { type: 'population'; target: number; within: number }
  | { type: 'oscillator'; period: number }
  | { type: 'still'; minCells: number }
  | { type: 'spaceship'; maxPeriod: number };
export type Challenge = {
  id: string;
  title: string;
  brief: string;
  /** Maximum live cells the seed may use. */
  budget: number;
  /** Seed must fit in this centred zone. */
  zone: { width: number; height: number };
  goal: ChallengeGoal;
};
/** Fixed arena; edges are dead (no wrap) so results do not depend on the toggle. */
export const CHALLENGE_BOARD = { width: 64, height: 48 } as const;

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'long-fuse',
    title: '长引线',
    brief: '最多 5 个细胞，撑过 100 代仍有活细胞。',
    budget: 5,
    zone: { width: 6, height: 6 },
    goal: { type: 'survive', generations: 100 },
  },
  {
    id: 'boom',
    title: '人口爆发',
    brief: '最多 8 个细胞，300 代内让人口达到 100。',
    budget: 8,
    zone: { width: 8, height: 8 },
    goal: { type: 'population', target: 100, within: 300 },
  },
  {
    id: 'period-3',
    title: '三拍心跳',
    brief: '造一个周期正好为 3 的振荡器。',
    budget: 60,
    zone: { width: 15, height: 15 },
    goal: { type: 'oscillator', period: 3 },
  },
  {
    id: 'still-10',
    title: '静物写生',
    brief: '用至少 10 个细胞摆一个永远不变的静物。',
    budget: 24,
    zone: { width: 10, height: 10 },
    goal: { type: 'still', minCells: 10 },
  },
  {
    id: 'ship',
    title: '出港',
    brief: '最多 9 个细胞，造一艘会自己移动的飞船。',
    budget: 9,
    zone: { width: 7, height: 7 },
    goal: { type: 'spaceship', maxPeriod: 4 },
  },
];
export const getChallenge = (id: string) => CHALLENGES.find((c) => c.id === id);

export function challengeZone(c: Challenge) {
  return {
    x: Math.floor((CHALLENGE_BOARD.width - c.zone.width) / 2),
    y: Math.floor((CHALLENGE_BOARD.height - c.zone.height) / 2),
    width: c.zone.width,
    height: c.zone.height,
  };
}
export const inZone = (c: Challenge, x: number, y: number) => {
  const z = challengeZone(c);
  return x >= z.x && y >= z.y && x < z.x + z.width && y < z.y + z.height;
};

export type ChallengeResult =
  | { ok: true; cells: number; detail: string }
  | { ok: false; cells: number; reason: string };

export function evaluateChallenge(c: Challenge, seed: Board): ChallengeResult {
  const cells = population(seed);
  if (
    seed.width !== CHALLENGE_BOARD.width ||
    seed.height !== CHALLENGE_BOARD.height
  )
    return { ok: false, cells, reason: '棋盘尺寸不对' };
  if (!cells) return { ok: false, cells, reason: '先在建造区里画几个细胞' };
  if (cells > c.budget)
    return {
      ok: false,
      cells,
      reason: `用了 ${cells} 格，超出上限 ${c.budget} 格`,
    };
  for (let y = 0; y < seed.height; y++)
    for (let x = 0; x < seed.width; x++)
      if (seed.cells[y * seed.width + x] && !inZone(c, x, y))
        return { ok: false, cells, reason: '有细胞画在建造区外' };
  const g = c.goal;
  if (g.type === 'survive') {
    let cur = seed;
    for (let i = 1; i <= g.generations; i++) {
      cur = step(cur, false);
      if (!population(cur))
        return { ok: false, cells, reason: `第 ${i} 代全部消失` };
    }
    return {
      ok: true,
      cells,
      detail: `第 ${g.generations} 代还剩 ${population(cur)} 个细胞`,
    };
  }
  if (g.type === 'population') {
    let cur = seed,
      peak = cells;
    for (let i = 1; i <= g.within; i++) {
      cur = step(cur, false);
      const n = population(cur);
      peak = Math.max(peak, n);
      if (n >= g.target)
        return { ok: true, cells, detail: `第 ${i} 代人口达到 ${n}` };
    }
    return { ok: false, cells, reason: `${g.within} 代内人口最高只有 ${peak}` };
  }
  if (g.type === 'oscillator') {
    const p = oscillatorPeriod(seed, false, 60);
    if (p === g.period)
      return { ok: true, cells, detail: `周期 ${p}，${cells} 个细胞` };
    return {
      ok: false,
      cells,
      reason: p ? `这是周期 ${p}，不是 ${g.period}` : '它不会回到最初的样子',
    };
  }
  if (g.type === 'still') {
    if (cells < g.minCells)
      return { ok: false, cells, reason: `至少需要 ${g.minCells} 个细胞` };
    return oscillatorPeriod(seed, false, 1) === 1
      ? { ok: true, cells, detail: `${cells} 个细胞的静物` }
      : { ok: false, cells, reason: '下一代就变了，还不是静物' };
  }
  const p = spaceshipPeriod(seed, false, g.maxPeriod);
  return p
    ? { ok: true, cells, detail: `每 ${p} 代原样前进` }
    : { ok: false, cells, reason: `${g.maxPeriod} 代内没有原样移动` };
}

// ---------------------------------------------------------------------------
// Daily: the same survive challenge for everyone on a given day.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lifeRandom = mulberry32;
export function dailyLifeSeed(
  year: number,
  month: number,
  day: number,
): number {
  let h = 2166136261;
  for (const part of [year, month, day, 0x11fe]) {
    h ^= part;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function dailyKey(t: { year: number; month: number; day: number }) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
}
/** Always solvable with the R-pentomino (5 cells, 3 × 3), verified by tests. */
export function dailyChallenge(t: {
  year: number;
  month: number;
  day: number;
}): Challenge {
  const rng = mulberry32(dailyLifeSeed(t.year, t.month, t.day));
  const budget = 5 + Math.floor(rng() * 3);
  const generations = 120 + Math.floor(rng() * 19) * 10;
  const zone = 5 + Math.floor(rng() * 3);
  return {
    id: `daily-${dailyKey(t)}`,
    title: '今日引线',
    brief: `最多 ${budget} 个细胞、${zone} × ${zone} 以内，撑过 ${generations} 代。`,
    budget,
    zone: { width: zone, height: zone },
    goal: { type: 'survive', generations },
  };
}

// ---------------------------------------------------------------------------
// Local records: fewest cells per challenge, cleared daily dates.

export const LIFE_RECORDS_KEY = 'tscjj:life:v1';
const MAX_DAILY = 400;
export type LifeRecords = { best: Record<string, number>; daily: string[] };
export const emptyLifeRecords = (): LifeRecords => ({ best: {}, daily: [] });

export function validateLifeRecords(value: unknown): LifeRecords | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const { best, daily } = value as Record<string, unknown>;
  if (best === null || typeof best !== 'object' || Array.isArray(best))
    return null;
  if (!Array.isArray(daily) || daily.length > MAX_DAILY) return null;
  const out = emptyLifeRecords();
  for (const [id, n] of Object.entries(best)) {
    if (
      !getChallenge(id) ||
      !Number.isSafeInteger(n) ||
      (n as number) < 1 ||
      (n as number) > 10_000
    )
      return null;
    out.best[id] = n as number;
  }
  for (const d of daily) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    if (!out.daily.includes(d)) out.daily.push(d);
  }
  return out;
}
/** Record a pass. Fewer cells is better; daily ids also mark the date cleared. */
export function mergeLifeRecord(
  r: LifeRecords,
  challengeId: string,
  cells: number,
): LifeRecords {
  const next: LifeRecords = { best: { ...r.best }, daily: [...r.daily] };
  const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(challengeId);
  if (daily) {
    if (!next.daily.includes(daily[1]))
      next.daily = [...next.daily, daily[1]].slice(-MAX_DAILY);
  } else if (getChallenge(challengeId)) {
    const prev = next.best[challengeId];
    if (prev === undefined || cells < prev) next.best[challengeId] = cells;
  }
  return next;
}
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
export function loadLifeRecords(
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): LifeRecords {
  try {
    const raw = storage?.getItem(LIFE_RECORDS_KEY);
    if (!raw || raw.length > 50_000) return emptyLifeRecords();
    return validateLifeRecords(JSON.parse(raw)) ?? emptyLifeRecords();
  } catch {
    return emptyLifeRecords();
  }
}
export function saveLifeRecords(
  r: LifeRecords,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
) {
  try {
    storage?.setItem(LIFE_RECORDS_KEY, JSON.stringify(r));
    return storage ? 'saved' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
