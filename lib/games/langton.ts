// 朗顿蚂蚁：turmites on a toroidal grid. Each cell holds a state 0..n-1; an ant
// on state s turns by rule[s], bumps the cell to s+1 (mod n) and moves forward.
// Pure logic only; the screen is components/games/langton-ant.tsx.
import { isPlainObject, loadJson, saveJson } from './kit.ts';

export type Turn = 'L' | 'R' | 'N' | 'U';
export type Ant = { x: number; y: number; dir: number };
export type World = {
  width: number;
  height: number;
  cells: Uint8Array;
  rule: Turn[];
  ants: Ant[];
  steps: number;
  /** Unwrapped position of ant 0, for highway detection. */
  track: { x: number; y: number };
  history: Int32Array;
};
// dir: 0 up, 1 right, 2 down, 3 left.
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const TURN: Record<Turn, number> = { N: 0, R: 1, U: 2, L: 3 };
export const MAX_ANTS = 8;
export const HISTORY = 8192;

export type RuleResult =
  | { ok: true; rule: Turn[] }
  | { ok: false; reason: string };
export function parseRule(text: string): RuleResult {
  const t = text.trim().toUpperCase();
  if (t.length < 2) return { ok: false, reason: '规则至少两个字母，例如 RL' };
  if (t.length > 16) return { ok: false, reason: '规则最多 16 个字母' };
  if (!/^[LRNU]+$/.test(t))
    return { ok: false, reason: '只能用 L、R、N（直行）、U（掉头）' };
  if (!/[LRU]/.test(t)) return { ok: false, reason: '至少要有一次转向' };
  return { ok: true, rule: t.split('') as Turn[] };
}

export function createWorld(
  width: number,
  height: number,
  rule: Turn[],
): World {
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    rule,
    ants: [],
    steps: 0,
    track: { x: 0, y: 0 },
    history: new Int32Array(HISTORY * 2),
  };
}
export function addAnt(w: World, x: number, y: number, dir = 0): boolean {
  if (w.ants.length >= MAX_ANTS) return false;
  w.ants.push({
    x: ((x % w.width) + w.width) % w.width,
    y: ((y % w.height) + w.height) % w.height,
    dir: ((dir % 4) + 4) % 4,
  });
  return true;
}

/** Advance every ant `n` times (ants move in order each step). */
export function stepWorld(w: World, n = 1) {
  const { width, height, cells, rule, ants } = w;
  const states = rule.length;
  const turns = rule.map((r) => TURN[r]);
  for (let k = 0; k < n; k++) {
    for (let a = 0; a < ants.length; a++) {
      const ant = ants[a];
      const i = ant.y * width + ant.x;
      const s = cells[i];
      ant.dir = (ant.dir + turns[s]) & 3;
      cells[i] = s + 1 === states ? 0 : s + 1;
      ant.x += DX[ant.dir];
      ant.y += DY[ant.dir];
      if (ant.x < 0) ant.x = width - 1;
      else if (ant.x >= width) ant.x = 0;
      if (ant.y < 0) ant.y = height - 1;
      else if (ant.y >= height) ant.y = 0;
      if (a === 0) {
        w.track.x += DX[ant.dir];
        w.track.y += DY[ant.dir];
      }
    }
    if (ants.length) {
      const h = (w.steps % HISTORY) * 2;
      w.history[h] = w.track.x;
      w.history[h + 1] = w.track.y;
    }
    w.steps++;
  }
}

export type Highway = { period: number; dx: number; dy: number };
/**
 * Looks for a "highway": ant 0's unwrapped path repeating with the same
 * displacement every `period` steps for `repeats` periods in a row. Only
 * meaningful while the highway has not wrapped into its own trail.
 */
export function detectHighway(
  w: World,
  maxPeriod = 512,
  repeats = 6,
): Highway | null {
  const available = Math.min(w.steps, HISTORY);
  const at = (back: number) => {
    const idx = (((w.steps - 1 - back) % HISTORY) + HISTORY) % HISTORY;
    return [w.history[idx * 2], w.history[idx * 2 + 1]];
  };
  for (let p = 1; p <= maxPeriod; p++) {
    const span = p * repeats;
    if (span >= available) break;
    const [x0, y0] = at(0);
    const [xp, yp] = at(p);
    const dx = x0 - xp,
      dy = y0 - yp;
    if (!dx && !dy) continue;
    let ok = true;
    for (let i = 0; i + p <= span && ok; i++) {
      const [a, b] = at(i);
      const [c, d] = at(i + p);
      if (a - c !== dx || b - d !== dy) ok = false;
    }
    if (ok) return { period: p, dx, dy };
  }
  return null;
}

export type Preset = { id: string; rule: string; name: string; note: string };
export const PRESETS: readonly Preset[] = [
  {
    id: 'rl',
    rule: 'RL',
    name: '经典蚂蚁',
    note: '约 1 万步混沌后修出周期 104 的高速路',
  },
  { id: 'rlr', rule: 'RLR', name: '混沌三色', note: '一直混沌，长不出高速路' },
  { id: 'llrr', rule: 'LLRR', name: '对称生长', note: '图案左右对称地长大' },
  {
    id: 'lrrrrrllr',
    rule: 'LRRRRRLLR',
    name: '方块填充',
    note: '填出越来越大的方块',
  },
  {
    id: 'llrrrlrlrllr',
    rule: 'LLRRRLRLRLLR',
    name: '卷心',
    note: '复杂的螺旋花纹',
  },
  {
    id: 'rrlllrlllrrr',
    rule: 'RRLLLRLLLRRR',
    name: '三角',
    note: '长出不断扩大的三角形',
  },
  { id: 'rlr-n', rule: 'RNL', name: '直行一格', note: 'N 表示不转向' },
];

// ---- records: per rule, the earliest step a highway was spotted and the
// longest run watched.
export const LANGTON_RECORDS_KEY = 'tscjj:langton:v1';
export type LangtonRecords = {
  rules: Record<string, { maxSteps: number; highway?: number }>;
};
export const emptyLangtonRecords = (): LangtonRecords => ({ rules: {} });
export function validateLangtonRecords(v: unknown): LangtonRecords | null {
  if (!isPlainObject(v) || !isPlainObject(v.rules)) return null;
  const out = emptyLangtonRecords();
  const entries = Object.entries(v.rules);
  if (entries.length > 200) return null;
  for (const [rule, r] of entries) {
    if (!parseRule(rule).ok || !isPlainObject(r)) return null;
    const { maxSteps, highway } = r;
    if (!Number.isSafeInteger(maxSteps) || (maxSteps as number) < 0)
      return null;
    if (
      highway !== undefined &&
      (!Number.isSafeInteger(highway) || (highway as number) < 0)
    )
      return null;
    out.rules[rule] = {
      maxSteps: maxSteps as number,
      ...(highway !== undefined ? { highway: highway as number } : {}),
    };
  }
  return out;
}
export function mergeLangtonRecord(
  r: LangtonRecords,
  rule: string,
  steps: number,
  highway?: number,
): LangtonRecords {
  const prev = r.rules[rule];
  const next = {
    maxSteps: Math.max(prev?.maxSteps ?? 0, steps),
    ...(prev?.highway !== undefined || highway !== undefined
      ? { highway: Math.min(prev?.highway ?? Infinity, highway ?? Infinity) }
      : {}),
  };
  return { rules: { ...r.rules, [rule]: next } };
}
export const loadLangtonRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(LANGTON_RECORDS_KEY, validateLangtonRecords, emptyLangtonRecords, s);
export const saveLangtonRecords = (
  r: LangtonRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(LANGTON_RECORDS_KEY, r, s);
