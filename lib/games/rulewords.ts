/**
 * 规则改写解谜：推动字块组成「名词 是 属性/名词」规则。原创名字与美术，
 * 纯逻辑实现，可在 node 与浏览器中运行，也供测试做解法回放。
 */
import { loadJson, saveJson, isPlainObject } from './kit.ts';

export const NOUNS = [
  'bot',
  'wall',
  'rock',
  'flag',
  'water',
  'lava',
  'gear',
] as const;
export const PROPS = ['you', 'win', 'stop', 'push', 'sink', 'hot'] as const;
export type Noun = (typeof NOUNS)[number];
export type Prop = (typeof PROPS)[number];
export type Word = Noun | Prop | 'is';

export const NOUN_NAMES: Record<Noun, string> = {
  bot: '机甲',
  wall: '墙',
  rock: '石',
  flag: '旗',
  water: '水',
  lava: '岩浆',
  gear: '齿轮',
};
export const WORD_NAMES: Record<Word, string> = {
  ...NOUN_NAMES,
  is: '是',
  you: '你',
  win: '赢',
  stop: '挡',
  push: '推',
  sink: '沉',
  hot: '烫',
};

/** An object on the board: either a thing (noun) or a word block (text). */
export type Obj = {
  id: number;
  x: number;
  y: number;
  thing?: Noun;
  word?: Word;
};
export type Board = { w: number; h: number; objs: Obj[] };
export type Dir = 'U' | 'D' | 'L' | 'R';
export const DELTA: Record<Dir, [number, number]> = {
  U: [0, -1],
  D: [0, 1],
  L: [-1, 0],
  R: [1, 0],
};

const THING_CHARS: Record<string, Noun> = {
  b: 'bot',
  w: 'wall',
  r: 'rock',
  f: 'flag',
  a: 'water',
  l: 'lava',
  g: 'gear',
};
const WORD_CHARS: Record<string, Word> = {
  B: 'bot',
  W: 'wall',
  R: 'rock',
  F: 'flag',
  A: 'water',
  L: 'lava',
  G: 'gear',
  '=': 'is',
  Y: 'you',
  V: 'win',
  S: 'stop',
  P: 'push',
  K: 'sink',
  H: 'hot',
};

export function parseBoard(rows: string[]): Board {
  const objs: Obj[] = [];
  rows.forEach((row, y) =>
    Array.from(row).forEach((ch, x) => {
      if (THING_CHARS[ch])
        objs.push({ id: objs.length, x, y, thing: THING_CHARS[ch] });
      else if (WORD_CHARS[ch])
        objs.push({ id: objs.length, x, y, word: WORD_CHARS[ch] });
    }),
  );
  return { w: Math.max(...rows.map((r) => r.length)), h: rows.length, objs };
}

export type Rules = {
  props: Map<Noun, Set<Prop>>;
  transforms: [Noun, Noun][];
  /** Text lines, e.g. "机甲 是 你", for display. */
  lines: string[];
};

const isNoun = (w: Word | undefined): w is Noun =>
  !!w && (NOUNS as readonly string[]).includes(w);
const isProp = (w: Word | undefined): w is Prop =>
  !!w && (PROPS as readonly string[]).includes(w);

export function readRules(b: Board): Rules {
  const at = new Map<string, Word[]>();
  for (const o of b.objs)
    if (o.word) {
      const k = `${o.x},${o.y}`;
      at.set(k, [...(at.get(k) ?? []), o.word]);
    }
  const words = (x: number, y: number) => at.get(`${x},${y}`) ?? [];
  const props = new Map<Noun, Set<Prop>>();
  const transforms: [Noun, Noun][] = [];
  const lines: string[] = [];
  for (const o of b.objs) {
    if (o.word !== 'is') continue;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      for (const subj of words(o.x - dx, o.y - dy)) {
        if (!isNoun(subj)) continue;
        for (const obj of words(o.x + dx, o.y + dy)) {
          if (isProp(obj)) {
            if (!props.has(subj)) props.set(subj, new Set());
            props.get(subj)!.add(obj);
          } else if (isNoun(obj)) transforms.push([subj, obj]);
          else continue;
          lines.push(`${WORD_NAMES[subj]} 是 ${WORD_NAMES[obj]}`);
        }
      }
    }
  }
  return { props, transforms, lines: [...new Set(lines)] };
}

export function has(r: Rules, o: Obj, p: Prop) {
  if (o.word) return p === 'push';
  return !!r.props.get(o.thing!)?.has(p);
}

export type Outcome = {
  board: Board;
  won: boolean;
  moved: boolean;
  lost: boolean;
};

function inBounds(b: Board, x: number, y: number) {
  return x >= 0 && y >= 0 && x < b.w && y < b.h;
}

/** Try to move object i one step; pushes chains. Returns false if blocked. */
function tryMove(
  b: Board,
  r: Rules,
  i: number,
  d: Dir,
  done: Set<number>,
): boolean {
  const [dx, dy] = DELTA[d];
  const o = b.objs[i];
  const nx = o.x + dx;
  const ny = o.y + dy;
  if (!inBounds(b, nx, ny)) return false;
  const here = b.objs
    .map((p, k) => [p, k] as const)
    .filter(([p, k]) => k !== i && p.x === nx && p.y === ny);
  for (const [p, k] of here) {
    if (has(r, p, 'push')) {
      if (!done.has(k) && !tryMove(b, r, k, d, done)) return false;
    } else if (has(r, p, 'stop')) return false;
  }
  o.x = nx;
  o.y = ny;
  done.add(i);
  return true;
}

function applyTransforms(b: Board, r: Rules) {
  if (!r.transforms.length) return;
  const map = new Map<Noun, Noun>();
  for (const [a, c] of r.transforms) {
    // "X is X" freezes X; otherwise first transform wins.
    if (r.transforms.some(([s, t]) => s === a && t === a)) continue;
    if (!map.has(a)) map.set(a, c);
  }
  for (const o of b.objs)
    if (o.thing && map.has(o.thing)) o.thing = map.get(o.thing);
}

function resolve(b: Board): { board: Board; won: boolean } {
  let r = readRules(b);
  applyTransforms(b, r);
  r = readRules(b);
  const dead = new Set<number>();
  const cells = new Map<string, number[]>();
  b.objs.forEach((o, k) => {
    const key = `${o.x},${o.y}`;
    cells.set(key, [...(cells.get(key) ?? []), k]);
  });
  for (const ks of cells.values()) {
    if (ks.length < 2) continue;
    if (ks.some((k) => has(r, b.objs[k], 'sink')))
      ks.forEach((k) => dead.add(k));
    if (ks.some((k) => has(r, b.objs[k], 'hot')))
      ks.forEach((k) => has(r, b.objs[k], 'you') && dead.add(k));
  }
  if (dead.size) b.objs = b.objs.filter((_, k) => !dead.has(k));
  r = readRules(b);
  let won = false;
  for (const o of b.objs) {
    if (!has(r, o, 'you')) continue;
    if (b.objs.some((p) => p.x === o.x && p.y === o.y && has(r, p, 'win')))
      won = true;
  }
  return { board: b, won };
}

export function cloneBoard(b: Board): Board {
  return { w: b.w, h: b.h, objs: b.objs.map((o) => ({ ...o })) };
}

/** One turn: every YOU object tries to move in direction d. */
export function step(src: Board, d: Dir): Outcome {
  const b = cloneBoard(src);
  const r = readRules(b);
  const yous = b.objs
    .map((o, k) => [o, k] as const)
    .filter(([o]) => has(r, o, 'you'));
  const done = new Set<number>();
  let moved = false;
  // Move objects furthest along the direction first so a group of YOUs advances together.
  const [dx, dy] = DELTA[d];
  yous.sort(([a], [c]) => (c.x - a.x) * dx + (c.y - a.y) * dy);
  for (const [, k] of yous) {
    if (done.has(k)) continue;
    if (tryMove(b, r, k, d, done)) moved = true;
  }
  const res = resolve(b);
  const r2 = readRules(res.board);
  const lost = !res.board.objs.some((o) => has(r2, o, 'you'));
  return { board: res.board, won: res.won, moved, lost };
}

/** Initial resolve (e.g. a level that starts with a transform rule). */
export function start(rows: string[]): Board {
  return resolve(parseBoard(rows)).board;
}

export function boardKey(b: Board) {
  return b.objs
    .map((o) => `${o.x},${o.y},${o.thing ?? ''}${o.word ? `#${o.word}` : ''}`)
    .sort()
    .join('|');
}

export function replay(
  rows: string[],
  moves: string,
): { won: boolean; at: number } {
  let b = start(rows);
  for (let i = 0; i < moves.length; i++) {
    const o = step(b, moves[i] as Dir);
    b = o.board;
    if (o.won) return { won: true, at: i + 1 };
  }
  return { won: false, at: moves.length };
}

/** Breadth-first solver; used by tests and level design (bounded). */
export function solve(rows: string[], limit = 400000): string | null {
  const s0 = start(rows);
  const seen = new Set([boardKey(s0)]);
  let frontier: [Board, string][] = [[s0, '']];
  while (frontier.length && seen.size < limit) {
    const next: [Board, string][] = [];
    for (const [b, path] of frontier)
      for (const d of ['U', 'D', 'L', 'R'] as Dir[]) {
        const o = step(b, d);
        if (o.won) return path + d;
        if (!o.moved || o.lost) continue;
        const k = boardKey(o.board);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push([o.board, path + d]);
      }
    frontier = next;
  }
  return null;
}

export type Level = {
  id: string;
  name: string;
  tip: string;
  rows: string[];
  solution: string;
};
export { LEVELS } from './rulewords-levels.ts';

// Records: solved level ids → fewest moves.
export const RULEWORDS_RECORDS_KEY = 'tscjj:rulewords:v1';
export type RulewordsRecords = { best: Record<string, number> };
export const emptyRulewordsRecords = (): RulewordsRecords => ({ best: {} });
export function validateRulewordsRecords(v: unknown): RulewordsRecords | null {
  if (!isPlainObject(v) || !isPlainObject(v.best)) return null;
  const best: Record<string, number> = {};
  for (const [k, n] of Object.entries(v.best))
    if (typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 100000)
      best[k] = n;
  return { best };
}
export function mergeRulewordsRecord(
  r: RulewordsRecords,
  id: string,
  moves: number,
) {
  const prev = r.best[id];
  return { best: { ...r.best, [id]: prev ? Math.min(prev, moves) : moves } };
}
export const loadRulewordsRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(
    RULEWORDS_RECORDS_KEY,
    validateRulewordsRecords,
    emptyRulewordsRecords,
    s,
  );
export const saveRulewordsRecords = (
  r: RulewordsRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(RULEWORDS_RECORDS_KEY, r, s);
