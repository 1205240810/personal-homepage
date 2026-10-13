/**
 * 时间回溯解谜：每一轮的操作都会被录下来，回溯后过去的自己按录像重演。
 * 站在压力板上的人（任何一轮的自己）会让同字母的门打开。
 * 纯逻辑，便于测试回放。
 */
import { isPlainObject, loadJson, saveJson } from './kit.ts';

export type Move = 'U' | 'D' | 'L' | 'R' | 'W';
export const MOVE_DELTA: Record<Move, [number, number]> = {
  U: [0, -1],
  D: [0, 1],
  L: [-1, 0],
  R: [1, 0],
  W: [0, 0],
};
export type Level = {
  id: string;
  name: string;
  tip: string;
  rows: string[];
  /** Max moves per loop. */
  loopLen: number;
  /** Max number of loops including the final one. */
  maxLoops: number;
  /** Reference solution: every loop's moves; the last loop reaches the exit. */
  solution: string[];
};
export type Pos = { x: number; y: number };
export type Map2 = {
  w: number;
  h: number;
  start: Pos;
  exit: Pos;
  walls: Set<string>;
  plates: Map<string, string>;
  doors: Map<string, string>;
};

/** X/Y/Z are doors that are open only while plate a/b/c is NOT pressed. */
const INVERTED: Record<string, string> = { X: 'a', Y: 'b', Z: 'c' };
export const key = (x: number, y: number) => `${x},${y}`;

export function parseMap(rows: string[]): Map2 {
  const m: Map2 = {
    w: Math.max(...rows.map((r) => r.length)),
    h: rows.length,
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    walls: new Set(),
    plates: new Map(),
    doors: new Map(),
  };
  rows.forEach((row, y) =>
    Array.from(row).forEach((ch, x) => {
      if (ch === '#') m.walls.add(key(x, y));
      else if (ch === 'S') m.start = { x, y };
      else if (ch === 'E') m.exit = { x, y };
      else if (/[a-z]/.test(ch)) m.plates.set(key(x, y), ch);
      else if (INVERTED[ch]) m.doors.set(key(x, y), `!${INVERTED[ch]}`);
      else if (/[A-Z]/.test(ch)) m.doors.set(key(x, y), ch.toLowerCase());
    }),
  );
  return m;
}

/** Plate letters that are currently held down by anyone. */
export function pressed(m: Map2, bodies: Pos[]) {
  const s = new Set<string>();
  for (const b of bodies) {
    const p = m.plates.get(key(b.x, b.y));
    if (p) s.add(p);
  }
  return s;
}

export function blocked(m: Map2, open: Set<string>, x: number, y: number) {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
  if (m.walls.has(key(x, y))) return true;
  const d = m.doors.get(key(x, y));
  if (!d) return false;
  return d.startsWith('!') ? open.has(d.slice(1)) : !open.has(d);
}

export type Sim = {
  /** Ticks elapsed in the current loop. */
  t: number;
  past: Pos[];
  me: Pos;
  open: Set<string>;
  won: boolean;
  /** Indexes of past selves whose recorded move was blocked (a "paradox" hint). */
  stuck: number[];
};

/**
 * Simulate the current loop: past loops replay their recordings while the
 * present self plays `current`. Each tick selves move from oldest to newest,
 * updating doors after each one.
 * A recording therefore keeps the same door timing when it becomes a past self.
 */
export function simulate(m: Map2, loops: string[], current: string): Sim {
  const past = loops.map(() => ({ ...m.start }));
  const me = { ...m.start };
  let open = pressed(m, [...past, me]);
  const stuck = new Set<number>();
  let won = false;
  for (let t = 0; t < current.length && !won; t++) {
    loops.forEach((rec, i) => {
      if (t >= rec.length) return;
      const [dx, dy] = MOVE_DELTA[rec[t] as Move];
      const p = past[i];
      if (dx || dy) {
        if (blocked(m, open, p.x + dx, p.y + dy)) stuck.add(i);
        else {
          p.x += dx;
          p.y += dy;
        }
      }
      open = pressed(m, [...past, me]);
    });
    open = pressed(m, [...past, me]);
    const [dx, dy] = MOVE_DELTA[current[t] as Move];
    if ((dx || dy) && !blocked(m, open, me.x + dx, me.y + dy)) {
      me.x += dx;
      me.y += dy;
    }
    open = pressed(m, [...past, me]);
    if (me.x === m.exit.x && me.y === m.exit.y) won = true;
  }
  return { t: current.length, past, me, open, won, stuck: [...stuck] };
}

/** Whether moving `mv` now would change the present self's position. */
export function canStep(m: Map2, loops: string[], current: string, mv: Move) {
  if (mv === 'W') return true;
  const before = simulate(m, loops, current).me;
  const after = simulate(m, loops, current + mv).me;
  return before.x !== after.x || before.y !== after.y;
}

export function replaySolution(l: Level) {
  const m = parseMap(l.rows);
  const loops = l.solution.slice(0, -1);
  const last = l.solution[l.solution.length - 1];
  return simulate(m, loops, last);
}

/** Can the exit be reached in a single loop given fixed past loops? (BFS over time × position.) */
export function reachableAlone(l: Level, loops: string[] = []) {
  const m = parseMap(l.rows);
  let frontier = new Map<string, string>([[key(m.start.x, m.start.y), '']]);
  for (let t = 0; t < l.loopLen; t++) {
    const next = new Map<string, string>();
    for (const path of frontier.values())
      for (const mv of ['U', 'D', 'L', 'R', 'W'] as Move[]) {
        const s = simulate(m, loops, path + mv);
        if (s.won) return path + mv;
        const k = key(s.me.x, s.me.y);
        if (!next.has(k)) next.set(k, path + mv);
      }
    frontier = next;
  }
  return null;
}

export { LEVELS } from './timeloop-levels.ts';

export const TIMELOOP_RECORDS_KEY = 'tscjj:timeloop:v1';
/** Per level: fewest loops used, then fewest total moves. */
export type TimeloopRecords = {
  best: Record<string, { loops: number; moves: number }>;
};
export const emptyTimeloopRecords = (): TimeloopRecords => ({ best: {} });
const okInt = (n: unknown, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= max;
export function validateTimeloopRecords(v: unknown): TimeloopRecords | null {
  if (!isPlainObject(v) || !isPlainObject(v.best)) return null;
  const best: TimeloopRecords['best'] = {};
  for (const [k, r] of Object.entries(v.best))
    if (isPlainObject(r) && okInt(r.loops, 50) && okInt(r.moves, 5000))
      best[k] = { loops: r.loops, moves: r.moves };
  return { best };
}
export function mergeTimeloopRecord(
  r: TimeloopRecords,
  id: string,
  loops: number,
  moves: number,
) {
  const prev = r.best[id];
  const better =
    !prev || loops < prev.loops || (loops === prev.loops && moves < prev.moves);
  return better ? { best: { ...r.best, [id]: { loops, moves } } } : r;
}
export const loadTimeloopRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(
    TIMELOOP_RECORDS_KEY,
    validateTimeloopRecords,
    emptyTimeloopRecords,
    s,
  );
export const saveTimeloopRecords = (
  r: TimeloopRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(TIMELOOP_RECORDS_KEY, r, s);
