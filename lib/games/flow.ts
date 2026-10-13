// 连线解谜：join same-coloured endpoints with paths that fill the whole board.
// Puzzles are cut from a random Hamiltonian path, so a full-fill solution
// always exists. Any full fill that follows the rules counts as solved.
import {
  dailyKey,
  dailySeed,
  isDateKey,
  isPlainObject,
  loadJson,
  mulberry32,
  saveJson,
  type Today,
} from './kit.ts';

export type FlowPuzzle = {
  id: string;
  size: number;
  /** Endpoint pairs as cell indices; colour = array index. */
  pairs: [number, number][];
  /** Reference solution: colour per cell. */
  solution: number[];
  /** Reference solution: ordered cells per colour. */
  routes: number[][];
};
export const FLOW_SIZES = [5, 6, 7, 8, 9] as const;
export type FlowSize = (typeof FLOW_SIZES)[number];

export const neighbours = (size: number, i: number) => {
  const x = i % size,
    y = Math.floor(i / size);
  const out: number[] = [];
  if (y > 0) out.push(i - size);
  if (x < size - 1) out.push(i + 1);
  if (y < size - 1) out.push(i + size);
  if (x > 0) out.push(i - 1);
  return out;
};
export const adjacent = (size: number, a: number, b: number) =>
  neighbours(size, a).includes(b);

/** Random Hamiltonian path on the grid via backbite moves from a zigzag. */
export function hamiltonianPath(size: number, random: () => number): number[] {
  let path: number[] = [];
  for (let y = 0; y < size; y++)
    for (let k = 0; k < size; k++)
      path.push(y * size + (y % 2 ? size - 1 - k : k));
  const pos = new Int32Array(size * size);
  const reindex = () => path.forEach((c, i) => (pos[c] = i));
  reindex();
  const moves = size * size * 40;
  for (let m = 0; m < moves; m++) {
    if (random() < 0.5) {
      path.reverse();
      reindex();
    }
    // Backbite at the tail.
    const n = path.length;
    const end = path[n - 1];
    const options = neighbours(size, end).filter((c) => c !== path[n - 2]);
    const pick = options[Math.floor(random() * options.length)];
    const j = pos[pick];
    // Reverse the part after j: tail now connects to pick.
    path = path.slice(0, j + 1).concat(path.slice(j + 1).reverse());
    reindex();
  }
  return path;
}

export function generateFlow(
  size: number,
  seed: number,
  id = `flow-${size}-${seed}`,
): FlowPuzzle {
  const random = mulberry32(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const path = hamiltonianPath(size, random);
    const total = size * size;
    const target = size + Math.floor(random() * 2) - (size <= 6 ? 0 : 1);
    // Cut lengths: at least 3 each, otherwise random.
    const cuts: number[] = [];
    let left = total;
    for (let k = target; k > 1; k--) {
      const max = left - 3 * (k - 1);
      const avg = left / k;
      const len = Math.max(
        3,
        Math.min(max, Math.round(avg * (0.5 + random()))),
      );
      cuts.push(len);
      left -= len;
    }
    cuts.push(left);
    if (left < 3) continue;
    const solution = Array.from({ length: total }, () => 0);
    const pairs: [number, number][] = [];
    const routes: number[][] = [];
    let at = 0;
    let bad = false;
    cuts.forEach((len, colour) => {
      const seg = path.slice(at, at + len);
      at += len;
      seg.forEach((c) => (solution[c] = colour));
      if (adjacent(size, seg[0], seg[seg.length - 1])) bad = true;
      pairs.push([seg[0], seg[seg.length - 1]]);
      routes.push(seg);
    });
    if (bad) continue;
    return { id, size, pairs, solution, routes };
  }
  throw new Error('flow generator gave up');
}
export const dailyFlow = (t: Today) =>
  generateFlow(7, dailySeed('flow', t), `daily-${dailyKey(t)}`);

// ---- play state: one path (list of cells) per colour.
export type Paths = number[][];
export const emptyPaths = (p: FlowPuzzle): Paths => p.pairs.map(() => []);
export function endpointColour(p: FlowPuzzle, cell: number): number {
  return p.pairs.findIndex(([a, b]) => a === cell || b === cell);
}
export function ownerOf(paths: Paths, cell: number): number {
  return paths.findIndex((path) => path.includes(cell));
}
export const isComplete = (p: FlowPuzzle, path: number[], colour: number) => {
  const [a, b] = p.pairs[colour];
  return (
    path.length >= 2 &&
    ((path[0] === a && path[path.length - 1] === b) ||
      (path[0] === b && path[path.length - 1] === a))
  );
};

/** Start drawing colour `colour` at `cell` (an endpoint, or a cell of its path). */
export function startPath(
  p: FlowPuzzle,
  paths: Paths,
  cell: number,
): { paths: Paths; colour: number } | null {
  const end = endpointColour(p, cell);
  const next = paths.map((x) => [...x]);
  if (end >= 0) {
    next[end] = [cell];
    return { paths: next, colour: end };
  }
  const owner = ownerOf(paths, cell);
  if (owner < 0) return null;
  next[owner] = next[owner].slice(0, next[owner].indexOf(cell) + 1);
  return { paths: next, colour: owner };
}

/**
 * Extend the active colour's path into `cell` (must be adjacent to its head).
 * Backtracking onto its own path truncates; crossing another path cuts it.
 */
export function extendPath(
  p: FlowPuzzle,
  paths: Paths,
  colour: number,
  cell: number,
): Paths | null {
  const path = paths[colour];
  if (!path.length) return null;
  const head = path[path.length - 1];
  if (cell === head) return paths;
  const own = path.indexOf(cell);
  const next = paths.map((x) => [...x]);
  if (own >= 0) {
    next[colour] = path.slice(0, own + 1);
    return next;
  }
  if (!adjacent(p.size, head, cell)) return null;
  if (isComplete(p, path, colour)) return null;
  const end = endpointColour(p, cell);
  if (end >= 0 && end !== colour) return null;
  const other = ownerOf(paths, cell);
  if (other >= 0 && other !== colour) {
    const k = next[other].indexOf(cell);
    // Keep the half attached to where that path started.
    next[other] = next[other].slice(0, k);
  }
  next[colour] = [...path, cell];
  return next;
}

export type FlowStatus = {
  connected: number;
  filled: number;
  total: number;
  solved: boolean;
};
export function flowStatus(p: FlowPuzzle, paths: Paths): FlowStatus {
  const total = p.size * p.size;
  const seen = new Set<number>();
  let connected = 0;
  let valid = true;
  paths.forEach((path, colour) => {
    for (let k = 0; k < path.length; k++) {
      if (k && !adjacent(p.size, path[k - 1], path[k])) valid = false;
      if (seen.has(path[k])) valid = false;
      seen.add(path[k]);
    }
    if (isComplete(p, path, colour)) connected++;
  });
  // Endpoints count as filled even before they are drawn from.
  for (const [a, b] of p.pairs) {
    seen.add(a);
    seen.add(b);
  }
  return {
    connected,
    filled: seen.size,
    total,
    solved: valid && connected === p.pairs.length && seen.size === total,
  };
}
/** Path of the reference solution, for hints. */
export const solutionPath = (p: FlowPuzzle, colour: number): number[] => [
  ...p.routes[colour],
];

// ---- records: best time per size (seconds), cleared daily dates.
export const FLOW_RECORDS_KEY = 'tscjj:flow:v1';
export type FlowRecords = { best: Record<string, number>; daily: string[] };
export const emptyFlowRecords = (): FlowRecords => ({ best: {}, daily: [] });
export function validateFlowRecords(v: unknown): FlowRecords | null {
  if (
    !isPlainObject(v) ||
    !isPlainObject(v.best) ||
    !Array.isArray(v.daily) ||
    v.daily.length > 400
  )
    return null;
  const out = emptyFlowRecords();
  for (const [k, n] of Object.entries(v.best)) {
    if (
      !FLOW_SIZES.includes(Number(k) as FlowSize) ||
      !Number.isSafeInteger(n) ||
      (n as number) < 1 ||
      (n as number) > 86_400
    )
      return null;
    out.best[k] = n as number;
  }
  for (const d of v.daily) {
    if (!isDateKey(d)) return null;
    if (!out.daily.includes(d)) out.daily.push(d);
  }
  return out;
}
export function mergeFlowRecord(
  r: FlowRecords,
  size: number,
  seconds: number,
  daily?: string,
): FlowRecords {
  const key = String(size);
  const s = Math.max(1, Math.round(seconds));
  return {
    best: { ...r.best, [key]: Math.min(r.best[key] ?? Infinity, s) },
    daily:
      daily && !r.daily.includes(daily)
        ? [...r.daily, daily].slice(-400)
        : r.daily,
  };
}
export const loadFlowRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(FLOW_RECORDS_KEY, validateFlowRecords, emptyFlowRecords, s);
export const saveFlowRecords = (
  r: FlowRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(FLOW_RECORDS_KEY, r, s);
