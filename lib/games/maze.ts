// 迷宫生成与竞速：perfect mazes from four algorithms, recorded as a list of
// carve steps so the UI can animate generation. Pure logic only.
import {
  dailyKey,
  dailySeed,
  isDateKey,
  isPlainObject,
  loadJson,
  mulberry32,
  saveJson,
  shuffle,
  type Today,
} from './kit.ts';

// Wall bits that are OPEN: north, east, south, west.
export const N = 1,
  E = 2,
  S = 4,
  W = 8;
const DX: Record<number, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY: Record<number, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const OPP: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E };
export const DIRS = [N, E, S, W] as const;

export type Algorithm = 'backtracker' | 'prim' | 'kruskal' | 'wilson';
export const ALGORITHMS: Record<Algorithm, { name: string; note: string }> = {
  backtracker: { name: '递归回溯', note: '长走廊、岔路少，像一条蜿蜒的蛇' },
  prim: { name: 'Prim', note: '从中心向外长，短死胡同很多' },
  kruskal: { name: 'Kruskal', note: '随机合并区域，纹理均匀' },
  wilson: { name: 'Wilson', note: '随机游走消圈，所有迷宫出现的概率相同' },
};
export const MAZE_SIZES = {
  small: { width: 10, height: 10, name: '10×10' },
  medium: { width: 16, height: 16, name: '16×16' },
  large: { width: 24, height: 24, name: '24×24' },
} as const;
export type MazeSize = keyof typeof MAZE_SIZES;

export type Maze = { width: number; height: number; cells: Uint8Array };
/** One carve: open the wall between cell `a` and its neighbour in `dir`. */
export type Carve = { a: number; dir: number };

const neighbour = (w: number, h: number, i: number, d: number) => {
  const x = (i % w) + DX[d],
    y = Math.floor(i / w) + DY[d];
  return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
};

export function carveSteps(
  alg: Algorithm,
  w: number,
  h: number,
  random: () => number,
): Carve[] {
  const n = w * h;
  const out: Carve[] = [];
  const pickDirs = () => shuffle([...DIRS], random);
  if (alg === 'backtracker') {
    const seen = new Uint8Array(n);
    const stack = [Math.floor(random() * n)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const d = pickDirs().find((dir) => {
        const m = neighbour(w, h, c, dir);
        return m >= 0 && !seen[m];
      });
      if (d === undefined) {
        stack.pop();
        continue;
      }
      const m = neighbour(w, h, c, d);
      seen[m] = 1;
      out.push({ a: c, dir: d });
      stack.push(m);
    }
  } else if (alg === 'prim') {
    const inMaze = new Uint8Array(n);
    const start = Math.floor(w / 2) + Math.floor(h / 2) * w;
    inMaze[start] = 1;
    const frontier: Carve[] = DIRS.filter(
      (d) => neighbour(w, h, start, d) >= 0,
    ).map((d) => ({ a: start, dir: d }));
    while (frontier.length) {
      const k = Math.floor(random() * frontier.length);
      const f = frontier[k];
      frontier[k] = frontier[frontier.length - 1];
      frontier.pop();
      const m = neighbour(w, h, f.a, f.dir);
      if (inMaze[m]) continue;
      inMaze[m] = 1;
      out.push(f);
      for (const d of DIRS) {
        const q = neighbour(w, h, m, d);
        if (q >= 0 && !inMaze[q]) frontier.push({ a: m, dir: d });
      }
    }
  } else if (alg === 'kruskal') {
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const walls: Carve[] = [];
    for (let i = 0; i < n; i++) {
      if (neighbour(w, h, i, E) >= 0) walls.push({ a: i, dir: E });
      if (neighbour(w, h, i, S) >= 0) walls.push({ a: i, dir: S });
    }
    for (const c of shuffle(walls, random)) {
      const ra = find(c.a),
        rb = find(neighbour(w, h, c.a, c.dir));
      if (ra !== rb) {
        parent[ra] = rb;
        out.push(c);
      }
    }
  } else {
    // Wilson: loop-erased random walks into the growing tree.
    const inTree = new Uint8Array(n);
    inTree[Math.floor(random() * n)] = 1;
    const next = new Int8Array(n);
    const order = shuffle(
      Array.from({ length: n }, (_, i) => i),
      random,
    );
    for (const start of order) {
      if (inTree[start]) continue;
      let c = start;
      while (!inTree[c]) {
        const dirs = DIRS.filter((d) => neighbour(w, h, c, d) >= 0);
        const d = dirs[Math.floor(random() * dirs.length)];
        next[c] = d;
        c = neighbour(w, h, c, d);
      }
      c = start;
      while (!inTree[c]) {
        inTree[c] = 1;
        out.push({ a: c, dir: next[c] });
        c = neighbour(w, h, c, next[c]);
      }
    }
  }
  return out;
}

export function applyCarves(
  w: number,
  h: number,
  steps: readonly Carve[],
  upto = steps.length,
): Maze {
  const cells = new Uint8Array(w * h);
  for (let k = 0; k < upto; k++) {
    const { a, dir } = steps[k];
    const b = neighbour(w, h, a, dir);
    cells[a] |= dir;
    cells[b] |= OPP[dir];
  }
  return { width: w, height: h, cells };
}
export function generateMaze(alg: Algorithm, size: MazeSize, seed: number) {
  const { width, height } = MAZE_SIZES[size];
  const steps = carveSteps(alg, width, height, mulberry32(seed));
  return { steps, maze: applyCarves(width, height, steps) };
}
export function dailyMaze(t: Today) {
  const seed = dailySeed('maze', t);
  const algs = Object.keys(ALGORITHMS) as Algorithm[];
  const alg = algs[seed % algs.length];
  return {
    alg,
    seed,
    ...generateMaze(alg, 'medium', seed),
    id: `daily-${dailyKey(t)}`,
  };
}

export const canMove = (m: Maze, i: number, d: number) =>
  (m.cells[i] & d) !== 0;
export function move(m: Maze, i: number, d: number) {
  return canMove(m, i, d) ? neighbour(m.width, m.height, i, d) : i;
}
/** Follow a corridor from `d`, stopping at a junction, dead end or the goal. */
export function run(m: Maze, i: number, d: number) {
  let cur = move(m, i, d);
  if (cur === i) return i;
  let dir = d;
  for (let guard = 0; guard < m.cells.length; guard++) {
    if (cur === m.cells.length - 1) break;
    const exits = DIRS.filter((x) => x !== OPP[dir] && canMove(m, cur, x));
    if (exits.length !== 1) break;
    dir = exits[0];
    cur = move(m, cur, dir);
  }
  return cur;
}
/** Shortest path from a to b (BFS), as cell indices including both ends. */
export function solve(m: Maze, a: number, b: number): number[] {
  const prev = new Int32Array(m.cells.length).fill(-1);
  prev[a] = a;
  const q = [a];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === b) break;
    for (const d of DIRS) {
      if (!canMove(m, c, d)) continue;
      const n2 = neighbour(m.width, m.height, c, d);
      if (prev[n2] < 0) {
        prev[n2] = c;
        q.push(n2);
      }
    }
  }
  if (prev[b] < 0) return [];
  const path = [b];
  while (path[path.length - 1] !== a) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

// ---- records: best seconds per size, daily best by date.
export const MAZE_RECORDS_KEY = 'tscjj:maze:v1';
export type MazeRecords = {
  best: Record<string, number>;
  daily: Record<string, number>;
};
export const emptyMazeRecords = (): MazeRecords => ({ best: {}, daily: {} });
const okTime = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 86_400;
export function validateMazeRecords(v: unknown): MazeRecords | null {
  if (!isPlainObject(v) || !isPlainObject(v.best) || !isPlainObject(v.daily))
    return null;
  const out = emptyMazeRecords();
  for (const [k, n] of Object.entries(v.best)) {
    if (!(k in MAZE_SIZES) || !okTime(n)) return null;
    out.best[k] = n as number;
  }
  const days = Object.entries(v.daily);
  if (days.length > 400) return null;
  for (const [d, n] of days) {
    if (!isDateKey(d) || !okTime(n)) return null;
    out.daily[d] = n as number;
  }
  return out;
}
export function mergeMazeRecord(
  r: MazeRecords,
  size: MazeSize,
  seconds: number,
  daily?: string,
): MazeRecords {
  const s = Math.round(seconds * 10) / 10;
  const out: MazeRecords = {
    best: { ...r.best, [size]: Math.min(r.best[size] ?? Infinity, s) },
    daily: { ...r.daily },
  };
  if (daily) {
    out.daily[daily] = Math.min(r.daily[daily] ?? Infinity, s);
    const keys = Object.keys(out.daily).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 400)))
      delete out.daily[k];
  }
  return out;
}
export const loadMazeRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(MAZE_RECORDS_KEY, validateMazeRecords, emptyMazeRecords, s);
export const saveMazeRecords = (
  r: MazeRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(MAZE_RECORDS_KEY, r, s);
