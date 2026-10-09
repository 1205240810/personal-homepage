// 线路检修：旋转线路块，让电源核心连通全部端点且不留断头。
// Pure rules only: generation, rotation, power tracing, hints and records.
// The React screen lives in components/games/circuit-repair.tsx.

/** Edge bits, clockwise from the top. */
export const NORTH = 1;
export const EAST = 2;
export const SOUTH = 4;
export const WEST = 8;

const EDGES = [
  { bit: NORTH, opposite: SOUTH, dr: -1, dc: 0, name: '上' },
  { bit: EAST, opposite: WEST, dr: 0, dc: 1, name: '右' },
  { bit: SOUTH, opposite: NORTH, dr: 1, dc: 0, name: '下' },
  { bit: WEST, opposite: EAST, dr: 0, dc: -1, name: '左' },
] as const;

export type CircuitSize = 4 | 5 | 6 | 7;

export const CIRCUIT_LEVELS: readonly {
  size: CircuitSize;
  label: string;
}[] = [
  { size: 4, label: '入门' },
  { size: 5, label: '标准' },
  { size: 6, label: '进阶' },
  { size: 7, label: '挑战' },
];

export const DEFAULT_CIRCUIT_SIZE: CircuitSize = 5;

export type CircuitPuzzle = {
  size: CircuitSize;
  seed: number;
  /** Index of the power core. */
  source: number;
  /** Generated wiring in its solved orientation. */
  solution: number[];
  /** Initial clockwise quarter turns applied to each solved tile. */
  scramble: number[];
};

export function isCircuitSize(value: unknown): value is CircuitSize {
  return CIRCUIT_LEVELS.some((level) => level.size === value);
}

/** Rotate an edge mask clockwise by a number of quarter turns (may be negative). */
export function rotateMask(mask: number, turns: number): number {
  const steps = ((turns % 4) + 4) % 4;
  let next = mask & 15;
  for (let i = 0; i < steps; i += 1) next = ((next << 1) | (next >> 3)) & 15;
  return next;
}

/** Fewest clockwise quarter turns that bring `mask` to `target`, or null. */
export function turnsToMatch(mask: number, target: number): number | null {
  for (let k = 0; k < 4; k += 1) if (rotateMask(mask, k) === target) return k;
  return null;
}

export function degree(mask: number): number {
  let count = 0;
  for (const edge of EDGES) if (mask & edge.bit) count += 1;
  return count;
}

export function describeEdges(mask: number): string {
  return EDGES.filter((edge) => mask & edge.bit)
    .map((edge) => edge.name)
    .join('、');
}

/** Small deterministic PRNG so a seed always rebuilds the same board. */
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

/** Same date + size → same "today's circuit" for every visitor. */
export function dailyCircuitSeed(
  year: number,
  month: number,
  day: number,
  size: CircuitSize,
): number {
  let h = 2166136261;
  for (const part of [year, month, day, size, 0x7c]) {
    h ^= part;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function neighbor(size: number, index: number, edge: (typeof EDGES)[number]) {
  const r = Math.floor(index / size) + edge.dr;
  const c = (index % size) + edge.dc;
  if (r < 0 || c < 0 || r >= size || c >= size) return -1;
  return r * size + c;
}

export function currentMasks(puzzle: CircuitPuzzle, turns: readonly number[]) {
  return puzzle.solution.map((mask, i) => rotateMask(mask, turns[i] ?? 0));
}

/** Tiles reachable from the core through mutually facing connectors. */
export function tracePower(
  size: number,
  masks: readonly number[],
  source: number,
): boolean[] {
  const powered = masks.map(() => false);
  if (source < 0 || source >= masks.length) return powered;
  const queue = [source];
  powered[source] = true;
  while (queue.length) {
    const index = queue.shift()!;
    for (const edge of EDGES) {
      if (!(masks[index] & edge.bit)) continue;
      const next = neighbor(size, index, edge);
      if (next < 0 || powered[next] || !(masks[next] & edge.opposite)) continue;
      powered[next] = true;
      queue.push(next);
    }
  }
  return powered;
}

/** Solved when every tile is powered and no connector points at nothing. */
export function isCircuitSolved(
  size: number,
  masks: readonly number[],
  source: number,
): boolean {
  if (!tracePower(size, masks, source).every(Boolean)) return false;
  return masks.every((mask, index) =>
    EDGES.every((edge) => {
      if (!(mask & edge.bit)) return true;
      const next = neighbor(size, index, edge);
      return next >= 0 && Boolean(masks[next] & edge.opposite);
    }),
  );
}

export function generateCircuit(
  size: CircuitSize,
  seed: number,
): CircuitPuzzle {
  if (!isCircuitSize(size))
    throw new RangeError(`不支持的线路尺寸：${String(size)}`);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError(`线路编号必须是 32 位无符号整数：${seed}`);
  const random = mulberry32(seed);
  const total = size * size;
  const center = Math.floor(size / 2);
  const source = center * size + center;
  const solution = Array.from({ length: total }, () => 0);
  const joined = Array.from({ length: total }, () => false);
  joined[source] = true;
  let remaining = total - 1;

  // Randomised Prim spanning tree. Four-way crosses look the same in every
  // orientation, so prefer branches that keep tiles at three connectors.
  while (remaining > 0) {
    const candidates: {
      from: number;
      to: number;
      edge: (typeof EDGES)[number];
    }[] = [];
    for (let from = 0; from < total; from += 1) {
      if (!joined[from]) continue;
      for (const edge of EDGES) {
        const to = neighbor(size, from, edge);
        if (to >= 0 && !joined[to]) candidates.push({ from, to, edge });
      }
    }
    const preferred = candidates.filter((c) => degree(solution[c.from]) < 3);
    const pool = preferred.length ? preferred : candidates;
    const pick = pool[Math.floor(random() * pool.length)];
    solution[pick.from] |= pick.edge.bit;
    solution[pick.to] |= pick.edge.opposite;
    joined[pick.to] = true;
    remaining -= 1;
  }

  const scramble = solution.map(() => Math.floor(random() * 4));
  // Never hand out a board that is already finished.
  const scrambled = solution.map((mask, i) => rotateMask(mask, scramble[i]));
  if (isCircuitSolved(size, scrambled, source)) {
    const index = solution.findIndex((mask) => rotateMask(mask, 1) !== mask);
    scramble[index] = (scramble[index] + 1) % 4;
  }
  return { size, seed, source, solution, scramble };
}

/** Reference rotations: clockwise turns from the scramble back to the generated wiring. */
export function circuitPar(puzzle: CircuitPuzzle): number {
  return puzzle.solution.reduce(
    (sum, mask, i) =>
      sum + (turnsToMatch(rotateMask(mask, puzzle.scramble[i]), mask) ?? 0),
    0,
  );
}

/**
 * Next tile to fix, walking outward from the core so power spreads steadily.
 * Returns how many clockwise turns that tile still needs.
 */
export function circuitHint(
  puzzle: CircuitPuzzle,
  turns: readonly number[],
): { index: number; turns: number } | null {
  const masks = currentMasks(puzzle, turns);
  if (isCircuitSolved(puzzle.size, masks, puzzle.source)) return null;
  const seen = new Set([puzzle.source]);
  const queue = [puzzle.source];
  while (queue.length) {
    const index = queue.shift()!;
    const needed = turnsToMatch(masks[index], puzzle.solution[index]) ?? 0;
    if (needed > 0) return { index, turns: needed };
    for (const edge of EDGES) {
      if (!(puzzle.solution[index] & edge.bit)) continue;
      const next = neighbor(puzzle.size, index, edge);
      if (next >= 0 && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Local best records. Only per-size bests are kept; boards in progress are not.

export const CIRCUIT_RECORDS_KEY = 'tscjj:circuit-repair:v1';

export type CircuitBest = { seconds: number; moves: number; solved: number };
export type CircuitRecords = Partial<Record<CircuitSize, CircuitBest>>;

const MAX_RECORD = 10_000_000;

function count(value: unknown, min: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= MAX_RECORD
  );
}

export function validateCircuitRecords(value: unknown): CircuitRecords | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const records: CircuitRecords = {};
  for (const [key, best] of Object.entries(value)) {
    const size = Number(key);
    if (!isCircuitSize(size)) return null;
    if (best === null || typeof best !== 'object' || Array.isArray(best))
      return null;
    const { seconds, moves, solved } = best as Record<string, unknown>;
    if (!count(seconds, 1) || !count(moves, 1) || !count(solved, 1))
      return null;
    records[size] = { seconds, moves, solved };
  }
  return records;
}

export function mergeCircuitRecord(
  records: CircuitRecords,
  size: CircuitSize,
  result: { seconds: number; moves: number },
): CircuitRecords {
  const seconds = Math.min(MAX_RECORD, Math.max(1, Math.round(result.seconds)));
  const moves = Math.min(MAX_RECORD, Math.max(1, Math.round(result.moves)));
  const best = records[size];
  return {
    ...records,
    [size]: best
      ? {
          seconds: Math.min(best.seconds, seconds),
          moves: Math.min(best.moves, moves),
          solved: Math.min(MAX_RECORD, best.solved + 1),
        }
      : { seconds, moves, solved: 1 },
  };
}

export type CircuitRecordsLoad =
  | { status: 'saved' | 'empty'; records: CircuitRecords }
  | { status: 'invalid' | 'unavailable'; records: CircuitRecords };

export function loadCircuitRecords(
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): CircuitRecordsLoad {
  if (!storage) return { status: 'unavailable', records: {} };
  let raw: string | null;
  try {
    raw = storage.getItem(CIRCUIT_RECORDS_KEY);
  } catch {
    return { status: 'unavailable', records: {} };
  }
  if (raw === null) return { status: 'empty', records: {} };
  try {
    const records = validateCircuitRecords(JSON.parse(raw));
    return records
      ? { status: 'saved', records }
      : { status: 'invalid', records: {} };
  } catch {
    return { status: 'invalid', records: {} };
  }
}

export function saveCircuitRecords(
  records: CircuitRecords,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): 'saved' | 'unavailable' {
  if (!storage) return 'unavailable';
  try {
    storage.setItem(CIRCUIT_RECORDS_KEY, JSON.stringify(records));
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
