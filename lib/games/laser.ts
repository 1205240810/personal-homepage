// 光线反射：place mirrors and splitters so one laser lights every target.
// Pure logic: beam tracing, handcrafted + generated levels (built from a known
// solution, so always solvable), star rating and local records.
import {
  dailyKey,
  isDateKey,
  isPlainObject,
  loadJson,
  mulberry32,
  saveJson,
  type Today,
  dailySeed,
} from './kit.ts';

// Directions: 0 up, 1 right, 2 down, 3 left.
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
/** '/' mirror: up<->right, down<->left. */
const SLASH = [1, 0, 3, 2];
/** '\' mirror: up<->left, down<->right. */
const BACK = [3, 2, 1, 0];
export type PieceKind = 'mirror' | 'split';
export type Piece = { kind: PieceKind; ori: 0 | 1 };
/** Fixed cells: '.', '#', source '^>v<', 'T' target, fixed '/' '\\', fixed splitters 'a' (/) 'b' (\\). */
export type Level = {
  id: string;
  name: string;
  grid: string[];
  mirrors: number;
  splitters: number;
  /** Pieces in the reference solution. */
  par: number;
  /** Reference solution: grid with player pieces written in. */
  solution: string[];
};
export type Placements = Map<number, Piece>;
export const SOURCE_DIR: Record<string, number> = {
  '^': 0,
  '>': 1,
  v: 2,
  '<': 3,
};

export const pieceChar = (p: Piece) =>
  p.kind === 'mirror' ? (p.ori ? '\\' : '/') : p.ori ? 'b' : 'a';
export function charPiece(c: string): Piece | null {
  if (c === '/') return { kind: 'mirror', ori: 0 };
  if (c === '\\') return { kind: 'mirror', ori: 1 };
  if (c === 'a') return { kind: 'split', ori: 0 };
  if (c === 'b') return { kind: 'split', ori: 1 };
  return null;
}
export const dims = (l: Level) => ({
  width: l.grid[0].length,
  height: l.grid.length,
});
export const isOpen = (l: Level, x: number, y: number) =>
  l.grid[y]?.[x] === '.';

export type Segment = { x1: number; y1: number; x2: number; y2: number };
export type Trace = {
  lit: Set<number>;
  hit: Set<number>;
  targets: number;
  segments: Segment[];
  solved: boolean;
};

/** Follow every beam; targets let light pass. Loops are cut by (cell, dir) memo. */
export function trace(level: Level, placed: Placements): Trace {
  const { width: w, height: h } = dims(level);
  const lit = new Set<number>();
  const hit = new Set<number>();
  const seen = new Set<number>();
  const segments: Segment[] = [];
  let targets = 0;
  const beams: { x: number; y: number; d: number }[] = [];
  level.grid.forEach((row, y) =>
    row.split('').forEach((c, x) => {
      if (c in SOURCE_DIR) beams.push({ x, y, d: SOURCE_DIR[c] });
      if (c === 'T') targets++;
    }),
  );
  while (beams.length) {
    const b = beams.pop()!;
    let { x, y } = b;
    const { d } = b;
    const sx = x,
      sy = y;
    for (;;) {
      const nx = x + DX[d],
        ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        segments.push({
          x1: sx,
          y1: sy,
          x2: x + DX[d] * 0.5,
          y2: y + DY[d] * 0.5,
        });
        break;
      }
      x = nx;
      y = ny;
      const i = y * w + x;
      const key = i * 4 + d;
      if (seen.has(key)) {
        segments.push({ x1: sx, y1: sy, x2: x, y2: y });
        break;
      }
      seen.add(key);
      lit.add(i);
      const c = level.grid[y][x];
      if (c === 'T') hit.add(i);
      const p = placed.get(i) ?? charPiece(c);
      if (c === '#' || c in SOURCE_DIR) {
        segments.push({
          x1: sx,
          y1: sy,
          x2: x - DX[d] * 0.5,
          y2: y - DY[d] * 0.5,
        });
        break;
      }
      if (p) {
        segments.push({ x1: sx, y1: sy, x2: x, y2: y });
        const turned = p.ori ? BACK[d] : SLASH[d];
        if (p.kind === 'split') beams.push({ x, y, d });
        beams.push({ x, y, d: turned });
        break;
      }
    }
  }
  return {
    lit,
    hit,
    targets,
    segments,
    solved: targets > 0 && hit.size === targets,
  };
}

export function solutionPlacements(level: Level): Placements {
  const { width } = dims(level);
  const out: Placements = new Map();
  level.solution.forEach((row, y) =>
    row.split('').forEach((c, x) => {
      const p = charPiece(c);
      if (p && level.grid[y][x] === '.') out.set(y * width + x, p);
    }),
  );
  return out;
}

export type Check = { ok: true } | { ok: false; reason: string };
export function placementsAllowed(level: Level, placed: Placements): Check {
  const { width } = dims(level);
  let m = 0,
    s = 0;
  for (const [i, p] of placed) {
    if (!isOpen(level, i % width, Math.floor(i / width)))
      return { ok: false, reason: '只能放在空格上' };
    if (p.kind === 'mirror') m++;
    else s++;
  }
  if (m > level.mirrors) return { ok: false, reason: '镜子不够了' };
  if (s > level.splitters) return { ok: false, reason: '分光镜不够了' };
  return { ok: true };
}

/** 3★ at par without hints; 2★ with one extra piece or any hint; else 1★. */
export function starsFor(level: Level, used: number, hints: number): 1 | 2 | 3 {
  if (used <= level.par && hints === 0) return 3;
  if (used <= level.par + 1 && hints <= 1) return 2;
  return 1;
}

// ---- handcrafted levels
function hand(
  id: string,
  name: string,
  solution: string[],
  mirrors: number,
  splitters: number,
): Level {
  const grid = solution.map((r) => r.replace(/[/\\ab]/g, '.'));
  const level: Level = { id, name, grid, mirrors, splitters, par: 0, solution };
  return { ...level, par: solutionPlacements(level).size };
}
export const HANDCRAFTED: readonly Level[] = [
  hand('h1', '第一次转弯', ['>...\\', '.....', '.....', '....T'], 1, 0),
  hand('h2', '绕开墙', ['>\\.#.', '.....', '.....', 'T/...'], 2, 0),
  hand('h3', '一分为二', ['..T..', '.....', '>.a.T'], 0, 1),
  hand(
    'h4',
    '拐三道弯',
    ['v.....', '......', '......', '\\.T.\\#', '....\\T', '......'],
    3,
    0,
  ),
  hand('h5', '分岔', ['....T.', '>.b./.', '......', '......', '..T...'], 1, 1),
  hand(
    'h6',
    '十字路口',
    [
      '.......',
      '.......',
      '.......',
      'T..\\...',
      '.......',
      '>..a.bT',
      '.....T.',
    ],
    1,
    2,
  ),
];

// ---- generated levels: place pieces at random, trace, then put targets on the
// lit path. Every piece the reference solution keeps is necessary.
export type Size = 'small' | 'medium' | 'large';
export const SIZES: Record<
  Size,
  { width: number; height: number; pieces: number; name: string }
> = {
  small: { width: 6, height: 6, pieces: 3, name: '6×6' },
  medium: { width: 8, height: 8, pieces: 5, name: '8×8' },
  large: { width: 10, height: 10, pieces: 7, name: '10×10' },
};

export function generateLevel(
  size: Size,
  seed: number,
  id = `g-${size}-${seed}`,
): Level {
  const { width: w, height: h, pieces } = SIZES[size];
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < 400; attempt++) {
    const grid = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => '.'),
    );
    // Source on an edge facing inward.
    const side = Math.floor(rng() * 4);
    const along = 1 + Math.floor(rng() * ((side % 2 ? h : w) - 2));
    const [sx, sy, sc] =
      side === 0
        ? [along, 0, 'v']
        : side === 1
          ? [w - 1, along, '<']
          : side === 2
            ? [along, h - 1, '^']
            : [0, along, '>'];
    grid[sy][sx] = sc;
    const sol = grid.map((r) => [...r]);
    const placed: Placements = new Map();
    const want = pieces + Math.floor(rng() * 2);
    // Walk the beam, dropping pieces on it so each one is actually used.
    for (let n = 0; n < want; n++) {
      const t = trace(
        {
          id,
          name: '',
          grid: sol.map((r) => r.join('')),
          mirrors: 0,
          splitters: 0,
          par: 0,
          solution: [],
        },
        new Map(),
      );
      const cells = [...t.lit].filter(
        (i) => sol[Math.floor(i / w)][i % w] === '.',
      );
      if (!cells.length) break;
      const i = cells[Math.floor(rng() * cells.length)];
      const piece: Piece = {
        kind: rng() < (size === 'small' ? 0.15 : 0.25) ? 'split' : 'mirror',
        ori: rng() < 0.5 ? 0 : 1,
      };
      sol[Math.floor(i / w)][i % w] = pieceChar(piece);
      placed.set(i, piece);
    }
    const base: Level = {
      id,
      name: '',
      grid: grid.map((r) => r.join('')),
      mirrors: 0,
      splitters: 0,
      par: 0,
      solution: [],
    };
    const full = trace(
      { ...base, grid: sol.map((r) => r.join('')) },
      new Map(),
    );
    // Candidate targets: lit empty cells, excluding the source's straight run.
    const straight = trace(base, new Map()).lit;
    const candidates = [...full.lit].filter(
      (i) => sol[Math.floor(i / w)][i % w] === '.' && !straight.has(i),
    );
    if (candidates.length < 3) continue;
    const nTargets = Math.min(
      candidates.length,
      2 + Math.floor(rng() * (size === 'large' ? 4 : 3)),
    );
    for (let n = 0; n < nTargets; n++) {
      const j = Math.floor(rng() * candidates.length);
      const i = candidates.splice(j, 1)[0];
      grid[Math.floor(i / w)][i % w] = 'T';
      sol[Math.floor(i / w)][i % w] = 'T';
    }
    let level: Level = {
      ...base,
      grid: grid.map((r) => r.join('')),
      solution: sol.map((r) => r.join('')),
    };
    // Drop pieces that are not needed for the reference solution.
    for (let changed = true; changed;) {
      changed = false;
      for (const i of Array.from(placed.keys())) {
        const without = new Map(placed);
        without.delete(i);
        if (trace(level, without).solved) {
          placed.delete(i);
          sol[Math.floor(i / w)][i % w] = '.';
          changed = true;
        }
      }
    }
    if (!trace(level, placed).solved || placed.size < Math.max(2, pieces - 2))
      continue;
    // Walls on cells the solution never lights.
    const lit = trace(level, placed).lit;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (grid[y][x] === '.' && !lit.has(y * w + x) && rng() < 0.18) {
          grid[y][x] = '#';
          sol[y][x] = '#';
        }
    const mirrors = [...placed.values()].filter(
      (p) => p.kind === 'mirror',
    ).length;
    const splitters = placed.size - mirrors;
    level = {
      id,
      name: `${SIZES[size].name} 随机`,
      grid: grid.map((r) => r.join('')),
      solution: sol.map((r) => r.join('')),
      // One spare mirror so there is room to experiment.
      mirrors: mirrors + 1,
      splitters,
      par: placed.size,
    };
    if (trace(level, new Map()).solved) continue;
    return level;
  }
  throw new Error('laser generator gave up');
}
export const dailyLaser = (t: Today) =>
  generateLevel('medium', dailySeed('laser', t), `daily-${dailyKey(t)}`);

/** One piece of the reference solution the player has not placed correctly yet. */
export function hint(
  level: Level,
  placed: Placements,
): { index: number; piece: Piece } | null {
  for (const [i, p] of solutionPlacements(level)) {
    const mine = placed.get(i);
    if (!mine || mine.kind !== p.kind || mine.ori !== p.ori)
      return { index: i, piece: p };
  }
  return null;
}

// ---- records
export const LASER_RECORDS_KEY = 'tscjj:laser:v1';
export type LaserRecords = { stars: Record<string, number>; daily: string[] };
export const emptyLaserRecords = (): LaserRecords => ({ stars: {}, daily: [] });
export function validateLaserRecords(v: unknown): LaserRecords | null {
  if (
    !isPlainObject(v) ||
    !isPlainObject(v.stars) ||
    !Array.isArray(v.daily) ||
    v.daily.length > 400
  )
    return null;
  const out = emptyLaserRecords();
  for (const [id, n] of Object.entries(v.stars)) {
    if (
      !/^(h\d+|g-(small|medium|large)-\d+)$/.test(id) ||
      ![1, 2, 3].includes(n as number)
    )
      return null;
    out.stars[id] = n as number;
  }
  for (const d of v.daily) {
    if (!isDateKey(d)) return null;
    if (!out.daily.includes(d)) out.daily.push(d);
  }
  return out;
}
export function mergeLaserRecord(
  r: LaserRecords,
  id: string,
  stars: number,
): LaserRecords {
  const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (daily)
    return {
      stars: r.stars,
      daily: r.daily.includes(daily[1])
        ? r.daily
        : [...r.daily, daily[1]].slice(-400),
    };
  if (!/^(h\d+|g-(small|medium|large)-\d+)$/.test(id)) return r;
  return {
    stars: { ...r.stars, [id]: Math.max(r.stars[id] ?? 0, stars) },
    daily: r.daily,
  };
}
export const loadLaserRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(LASER_RECORDS_KEY, validateLaserRecords, emptyLaserRecords, s);
export const saveLaserRecords = (
  r: LaserRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(LASER_RECORDS_KEY, r, s);
