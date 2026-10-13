// 数桥（Hashiwokakero）：connect islands with horizontal/vertical bridges so
// every island has exactly its number of bridges, bridges never cross, at most
// two join a pair, and everything is connected. Generated puzzles are checked
// with an exhaustive solver to have exactly one solution.
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

export type Island = { x: number; y: number; n: number };
export type Edge = { a: number; b: number; horizontal: boolean };
export type HashiPuzzle = {
  id: string;
  size: number;
  islands: Island[];
  /** Every pair of islands that see each other. */
  edges: Edge[];
  /** For each edge, the indices of edges it would cross. */
  crossings: number[][];
  /** Reference (unique) solution: bridges per edge. */
  solution: number[];
};
export const HASHI_SIZES = { small: 7, medium: 9, large: 11 } as const;
export type HashiSize = keyof typeof HASHI_SIZES;

/** Pairs of islands that see each other along a row or column. */
export function buildEdges(size: number, islands: { x: number; y: number }[]) {
  const at = new Map(islands.map((p, i) => [p.y * size + p.x, i]));
  const edges: Edge[] = [];
  islands.forEach((p, a) => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      let x = p.x + dx,
        y = p.y + dy;
      while (x < size && y < size) {
        const b = at.get(y * size + x);
        if (b !== undefined) {
          edges.push({ a, b, horizontal: dy === 0 });
          break;
        }
        x += dx;
        y += dy;
      }
    }
  });
  const crossings = edges.map((e) =>
    edges.flatMap((f, j) => (crosses(islands, e, f) ? [j] : [])),
  );
  return { edges, crossings };
}
function crosses(isl: { x: number; y: number }[], e: Edge, f: Edge) {
  if (e.horizontal === f.horizontal) return false;
  const h = e.horizontal ? e : f;
  const v = e.horizontal ? f : e;
  const hy = isl[h.a].y,
    hx1 = Math.min(isl[h.a].x, isl[h.b].x),
    hx2 = Math.max(isl[h.a].x, isl[h.b].x);
  const vx = isl[v.a].x,
    vy1 = Math.min(isl[v.a].y, isl[v.b].y),
    vy2 = Math.max(isl[v.a].y, isl[v.b].y);
  return vx > hx1 && vx < hx2 && hy > vy1 && hy < vy2;
}

export function isConnected(
  islandCount: number,
  edges: Edge[],
  bridges: number[],
) {
  if (!islandCount) return false;
  const adj: number[][] = Array.from({ length: islandCount }, () => []);
  edges.forEach((e, i) => {
    if (bridges[i] > 0) {
      adj[e.a].push(e.b);
      adj[e.b].push(e.a);
    }
  });
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length)
    for (const n of adj[stack.pop()!])
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
  return seen.size === islandCount;
}

/**
 * Count solutions (stopping at `limit`). Branches on the most constrained
 * island's edges with forced-move propagation.
 */
export function countSolutions(
  islands: Island[],
  edges: Edge[],
  crossings: number[][],
  limit = 2,
  budget = 200_000,
): { count: number; first: number[] | null; exhausted: boolean } {
  const E = edges.length;
  const byIsland: number[][] = islands.map(() => []);
  edges.forEach((e, i) => {
    byIsland[e.a].push(i);
    byIsland[e.b].push(i);
  });
  const val = new Int8Array(E).fill(-1);
  let count = 0;
  let first: number[] | null = null;
  let nodes = 0;
  const maxFor = (i: number) => {
    // Upper bound for an undecided edge: 0 if a crossing edge is already > 0.
    for (const j of crossings[i]) if (val[j] > 0) return 0;
    return 2;
  };
  const stats = (k: number) => {
    let sum = 0,
      cap = 0;
    for (const i of byIsland[k]) {
      if (val[i] >= 0) sum += val[i];
      else cap += maxFor(i);
    }
    return { sum, cap };
  };
  const consistent = () => {
    for (let k = 0; k < islands.length; k++) {
      const { sum, cap } = stats(k);
      if (sum > islands[k].n || sum + cap < islands[k].n) return false;
    }
    return true;
  };
  const dfs = (): void => {
    if (count >= limit || ++nodes > budget) return;
    // Propagate forced moves.
    const trail: number[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let k = 0; k < islands.length; k++) {
        const { sum, cap } = stats(k);
        const need = islands[k].n - sum;
        if (need < 0 || need > cap) {
          for (const i of trail) val[i] = -1;
          return;
        }
        for (const i of byIsland[k]) {
          if (val[i] >= 0) continue;
          const m = maxFor(i);
          const other = cap - m;
          const lo = Math.max(0, need - other);
          const hi = Math.min(m, need);
          if (lo > hi) {
            for (const t of trail) val[t] = -1;
            return;
          }
          if (lo === hi) {
            val[i] = lo;
            trail.push(i);
            changed = true;
          }
        }
      }
    }
    if (!consistent()) {
      for (const i of trail) val[i] = -1;
      return;
    }
    // Pick the undecided edge on the island with the least slack.
    let best = -1,
      bestSlack = Infinity;
    for (let k = 0; k < islands.length; k++) {
      const { sum, cap } = stats(k);
      const slack = cap - (islands[k].n - sum);
      for (const i of byIsland[k])
        if (val[i] < 0 && slack < bestSlack) {
          best = i;
          bestSlack = slack;
        }
    }
    if (best < 0) {
      const sol = Array.from(val);
      if (isConnected(islands.length, edges, sol)) {
        count++;
        if (!first) first = sol;
      }
    } else {
      const m = maxFor(best);
      for (let v = m; v >= 0 && count < limit; v--) {
        val[best] = v;
        if (consistent()) dfs();
      }
      val[best] = -1;
    }
    for (const i of trail) val[i] = -1;
  };
  dfs();
  return { count, first, exhausted: nodes > budget };
}

export function generateHashi(
  sizeName: HashiSize,
  seed: number,
  id = `hashi-${sizeName}-${seed}`,
): HashiPuzzle {
  const size = HASHI_SIZES[sizeName];
  const rng = mulberry32(seed);
  const target = Math.round(size * size * 0.2);
  for (let attempt = 0; attempt < 300; attempt++) {
    const grid = new Int16Array(size * size).fill(-1); // island index
    const used = new Uint8Array(size * size); // bridge cells
    const pts: { x: number; y: number }[] = [];
    const bridges = new Map<string, number>();
    const add = (x: number, y: number) => {
      grid[y * size + x] = pts.length;
      pts.push({ x, y });
    };
    add(Math.floor(rng() * size), Math.floor(rng() * size));
    for (let tries = 0; pts.length < target && tries < 2000; tries++) {
      const from = Math.floor(rng() * pts.length);
      const p = pts[from];
      const [dx, dy] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ][Math.floor(rng() * 4)];
      const dist = 2 + Math.floor(rng() * Math.max(1, size / 2 - 1));
      const nx = p.x + dx * dist,
        ny = p.y + dy * dist;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      let ok = grid[ny * size + nx] < 0 && !used[ny * size + nx];
      for (let s = 1; s < dist && ok; s++) {
        const c = (p.y + dy * s) * size + p.x + dx * s;
        if (grid[c] >= 0 || used[c]) ok = false;
      }
      // Keep islands from touching orthogonally.
      for (const [ax, ay] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (
          ok &&
          grid[(ny + ay) * size + nx + ax] >= 0 &&
          nx + ax >= 0 &&
          nx + ax < size &&
          ny + ay >= 0 &&
          ny + ay < size
        )
          ok = false;
      if (!ok) continue;
      for (let s = 1; s < dist; s++)
        used[(p.y + dy * s) * size + p.x + dx * s] = 1;
      add(nx, ny);
      bridges.set(`${from}-${pts.length - 1}`, rng() < 0.4 ? 2 : 1);
    }
    if (pts.length < target * 0.8) continue;
    const { edges, crossings } = buildEdges(size, pts);
    const sol = edges.map(
      (e) => bridges.get(`${e.a}-${e.b}`) ?? bridges.get(`${e.b}-${e.a}`) ?? 0,
    );
    // Sanity: generated bridges never cross (cells were reserved).
    if (sol.some((v, i) => v > 0 && crossings[i].some((j) => sol[j] > 0)))
      continue;
    const islands = pts.map((p, k) => ({
      ...p,
      n: edges.reduce(
        (s, e, i) => s + (e.a === k || e.b === k ? sol[i] : 0),
        0,
      ),
    }));
    const res = countSolutions(islands, edges, crossings, 2);
    if (res.exhausted || res.count !== 1) continue;
    return { id, size, islands, edges, crossings, solution: res.first! };
  }
  throw new Error('hashi generator gave up');
}
export const dailyHashi = (t: Today) =>
  generateHashi('medium', dailySeed('hashi', t), `daily-${dailyKey(t)}`);

export type HashiStatus = {
  done: number;
  over: number[];
  connected: boolean;
  solved: boolean;
};
export function hashiStatus(p: HashiPuzzle, bridges: number[]): HashiStatus {
  const counts = p.islands.map(() => 0);
  p.edges.forEach((e, i) => {
    counts[e.a] += bridges[i];
    counts[e.b] += bridges[i];
  });
  const over = counts.flatMap((c, k) => (c > p.islands[k].n ? [k] : []));
  const done = counts.filter((c, k) => c === p.islands[k].n).length;
  const crossing = bridges.some(
    (v, i) => v > 0 && p.crossings[i].some((j) => bridges[j] > 0),
  );
  const connected = isConnected(p.islands.length, p.edges, bridges);
  return {
    done,
    over,
    connected,
    solved: !crossing && connected && done === p.islands.length,
  };
}
/** Cycle 0→1→2→0 on an edge; refuses (returns null) when it would cross a bridge. */
export function cycleBridge(
  p: HashiPuzzle,
  bridges: number[],
  edge: number,
): number[] | null {
  const next = [...bridges];
  const v = (bridges[edge] + 1) % 3;
  if (v > 0 && p.crossings[edge].some((j) => bridges[j] > 0)) return null;
  next[edge] = v;
  return next;
}
export function edgeBetween(p: HashiPuzzle, a: number, b: number) {
  return p.edges.findIndex(
    (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
  );
}
/** Edge leaving island `k` in direction dx,dy, or -1. */
export function edgeToward(p: HashiPuzzle, k: number, dx: number, dy: number) {
  const me = p.islands[k];
  return p.edges.findIndex((e) => {
    if (e.a !== k && e.b !== k) return false;
    const o = p.islands[e.a === k ? e.b : e.a];
    return Math.sign(o.x - me.x) === dx && Math.sign(o.y - me.y) === dy;
  });
}

// ---- records
export const HASHI_RECORDS_KEY = 'tscjj:hashi:v1';
export type HashiRecords = { best: Record<string, number>; daily: string[] };
export const emptyHashiRecords = (): HashiRecords => ({ best: {}, daily: [] });
export function validateHashiRecords(v: unknown): HashiRecords | null {
  if (
    !isPlainObject(v) ||
    !isPlainObject(v.best) ||
    !Array.isArray(v.daily) ||
    v.daily.length > 400
  )
    return null;
  const out = emptyHashiRecords();
  for (const [k, n] of Object.entries(v.best)) {
    if (
      !(k in HASHI_SIZES) ||
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
export function mergeHashiRecord(
  r: HashiRecords,
  size: HashiSize,
  seconds: number,
  daily?: string,
): HashiRecords {
  const s = Math.max(1, Math.round(seconds));
  return {
    best: { ...r.best, [size]: Math.min(r.best[size] ?? Infinity, s) },
    daily:
      daily && !r.daily.includes(daily)
        ? [...r.daily, daily].slice(-400)
        : r.daily,
  };
}
export const loadHashiRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(HASHI_RECORDS_KEY, validateHashiRecords, emptyHashiRecords, s);
export const saveHashiRecords = (
  r: HashiRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(HASHI_RECORDS_KEY, r, s);
