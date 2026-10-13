/**
 * 围棋规则：提子、禁止自杀、劫（禁止立即回提，即局面单劫）、虚手、认输、
 * 中国规则数子（子 + 只与一方相邻的空），贴目，让子与死子标记。纯逻辑，供界面、AI 与测试共用。
 */
import { isPlainObject, loadJson, saveJson } from './kit.ts';

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export type Stone = 0 | 1 | 2;
export type Player = 1 | 2;
export const other = (c: Player): Player => (c === BLACK ? WHITE : BLACK);
export const GO_SIZES = [9, 13, 19] as const;
export type GoSize = (typeof GO_SIZES)[number];

export type GoState = {
  size: number;
  board: Uint8Array;
  toPlay: Player;
  /** Point forbidden by ko for the player to move, or -1. */
  ko: number;
  captures: [number, number, number]; // index by colour (0 unused)
  passes: number;
  moves: number[]; // -1 for pass
};

export function newGame(size: number, handicap = 0): GoState {
  const s: GoState = {
    size,
    board: new Uint8Array(size * size),
    toPlay: BLACK,
    ko: -1,
    captures: [0, 0, 0],
    passes: 0,
    moves: [],
  };
  if (handicap >= 2) {
    for (const p of handicapPoints(size, handicap)) s.board[p] = BLACK;
    s.toPlay = WHITE;
  }
  return s;
}

/** Standard star-point handicap placement (9×9 allows up to 5 stones, larger boards 9). */
export function handicapPoints(size: number, n: number): number[] {
  const e = size >= 13 ? 3 : 2;
  const lo = e;
  const hi = size - 1 - e;
  const mid = (size - 1) >> 1;
  const at = (x: number, y: number) => y * size + x;
  const corners = [at(hi, lo), at(lo, hi), at(hi, hi), at(lo, lo)];
  const leftRight = [at(lo, mid), at(hi, mid)];
  const topBottom = [at(mid, lo), at(mid, hi)];
  const centre = at(mid, mid);
  const k = Math.max(0, Math.min(n, size === 9 ? 5 : 9));
  if (k <= 4) return corners.slice(0, k);
  if (k === 5) return [...corners, centre];
  if (k === 6) return [...corners, ...leftRight];
  if (k === 7) return [...corners, ...leftRight, centre];
  if (k === 8) return [...corners, ...leftRight, ...topBottom];
  return [...corners, ...leftRight, ...topBottom, centre];
}

export function clone(s: GoState): GoState {
  return {
    ...s,
    board: s.board.slice(),
    captures: [...s.captures] as GoState['captures'],
    moves: s.moves.slice(),
  };
}

export function neighbours(size: number, p: number): number[] {
  const x = p % size;
  const out: number[] = [];
  if (x > 0) out.push(p - 1);
  if (x < size - 1) out.push(p + 1);
  if (p >= size) out.push(p - size);
  if (p < size * (size - 1)) out.push(p + size);
  return out;
}

/** Group containing p and its liberties. */
export function group(board: Uint8Array, size: number, p: number) {
  const c = board[p];
  const stones: number[] = [p];
  const seen = new Uint8Array(board.length);
  seen[p] = 1;
  const libs = new Set<number>();
  for (let i = 0; i < stones.length; i++) {
    for (const n of neighbours(size, stones[i])) {
      if (board[n] === EMPTY) libs.add(n);
      else if (board[n] === c && !seen[n]) {
        seen[n] = 1;
        stones.push(n);
      }
    }
  }
  return { stones, libs };
}

export type PlayResult =
  | { ok: true; state: GoState; captured: number[] }
  | { ok: false; reason: string };

export function play(s: GoState, p: number): PlayResult {
  if (p < 0) return { ok: true, state: pass(s), captured: [] };
  if (s.board[p] !== EMPTY) return { ok: false, reason: '这里已经有子了' };
  if (p === s.ko)
    return { ok: false, reason: '打劫：不能立即提回，先在别处走一手' };
  const me = s.toPlay;
  const opp = other(me);
  const n = clone(s);
  n.board[p] = me;
  const captured: number[] = [];
  for (const q of neighbours(s.size, p)) {
    if (n.board[q] !== opp) continue;
    const g = group(n.board, s.size, q);
    if (g.libs.size === 0)
      for (const st of g.stones) {
        n.board[st] = EMPTY;
        captured.push(st);
      }
  }
  const mine = group(n.board, s.size, p);
  if (mine.libs.size === 0)
    return { ok: false, reason: '禁止自杀：这手没有气' };
  // Simple ko: a single stone captured a single stone and now has exactly one liberty.
  n.ko =
    captured.length === 1 && mine.stones.length === 1 && mine.libs.size === 1
      ? captured[0]
      : -1;
  n.captures[me] += captured.length;
  n.toPlay = opp;
  n.passes = 0;
  n.moves.push(p);
  return { ok: true, state: n, captured };
}

export function pass(s: GoState): GoState {
  const n = clone(s);
  n.toPlay = other(s.toPlay);
  n.ko = -1;
  n.passes = s.passes + 1;
  n.moves.push(-1);
  return n;
}

export function isLegal(s: GoState, p: number) {
  return play(s, p).ok;
}

/** True if p is an eye-like point for colour c (all neighbours c, and diagonals mostly c). */
export function isEyeish(
  board: Uint8Array,
  size: number,
  p: number,
  c: number,
) {
  if (board[p] !== EMPTY) return false;
  for (const n of neighbours(size, p)) if (board[n] !== c) return false;
  const x = p % size;
  const y = (p / size) | 0;
  let bad = 0;
  let edge = 0;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) edge = 1;
    else if (board[ny * size + nx] !== c && board[ny * size + nx] !== EMPTY)
      bad++;
  }
  return bad + edge < 2;
}

export type Score = {
  black: number;
  white: number;
  komi: number;
  territory: Int8Array; // owner per point: 1 black, 2 white, 0 neutral
  winner: Player;
  margin: number;
};

/** Area scoring after removing `dead` stones. */
export function score(
  s: GoState,
  komi: number,
  dead: Set<number> = new Set(),
): Score {
  const size = s.size;
  const b = s.board.slice();
  for (const p of dead) b[p] = EMPTY;
  const owner = new Int8Array(b.length);
  const seen = new Uint8Array(b.length);
  for (let p = 0; p < b.length; p++) {
    if (b[p] !== EMPTY) {
      owner[p] = b[p];
      continue;
    }
    if (seen[p]) continue;
    const region = [p];
    seen[p] = 1;
    let touch = 0;
    for (let i = 0; i < region.length; i++)
      for (const n of neighbours(size, region[i])) {
        if (b[n] === EMPTY) {
          if (!seen[n]) {
            seen[n] = 1;
            region.push(n);
          }
        } else touch |= b[n];
      }
    const who = touch === 1 ? 1 : touch === 2 ? 2 : 0;
    for (const q of region) owner[q] = who;
  }
  let black = 0;
  let white = 0;
  for (const o of owner) {
    if (o === 1) black++;
    else if (o === 2) white++;
  }
  const w = white + komi;
  return {
    black,
    white: w,
    komi,
    territory: owner,
    winner: black > w ? BLACK : WHITE,
    margin: Math.abs(black - w),
  };
}

/** Toggle a whole group as dead/alive for scoring. */
export function toggleDead(s: GoState, dead: Set<number>, p: number) {
  if (s.board[p] === EMPTY) return dead;
  const g = group(s.board, s.size, p).stones;
  const next = new Set(dead);
  const isDead = dead.has(p);
  for (const q of g) {
    if (isDead) next.delete(q);
    else next.add(q);
  }
  return next;
}

export const komiFor = (handicap: number) => (handicap >= 2 ? 0.5 : 7.5);

export function coordName(size: number, p: number) {
  if (p < 0) return '虚手';
  const letters = 'ABCDEFGHJKLMNOPQRST';
  return `${letters[p % size]}${size - Math.floor(p / size)}`;
}

/** Parse a diagram: X black, O white, anything else empty. */
export function fromRows(rows: string[], toPlay: Player = BLACK): GoState {
  const size = rows.length;
  const s = newGame(size);
  rows.forEach((r, y) =>
    Array.from(r).forEach((ch, x) => {
      if (ch === 'X') s.board[y * size + x] = BLACK;
      else if (ch === 'O') s.board[y * size + x] = WHITE;
    }),
  );
  s.toPlay = toPlay;
  return s;
}

export const GO_RECORDS_KEY = 'tscjj:go:v1';
export type GoRecords = {
  games: Record<string, { played: number; won: number }>;
  problems: string[];
};
export const emptyGoRecords = (): GoRecords => ({ games: {}, problems: [] });
const nat = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0;
export function validateGoRecords(v: unknown): GoRecords | null {
  if (
    !isPlainObject(v) ||
    !isPlainObject(v.games) ||
    !Array.isArray(v.problems)
  )
    return null;
  const games: GoRecords['games'] = {};
  for (const [k, g] of Object.entries(v.games))
    if (
      /^(9|13|19)-([1-9]|10)$/.test(k) &&
      isPlainObject(g) &&
      nat(g.played) &&
      nat(g.won)
    )
      games[k] = { played: g.played, won: g.won };
  return {
    games,
    problems: v.problems
      .filter((p): p is string => typeof p === 'string')
      .slice(0, 100),
  };
}
export function recordGoGame(
  r: GoRecords,
  key: string,
  won: boolean,
): GoRecords {
  const g = r.games[key] ?? { played: 0, won: 0 };
  return {
    ...r,
    games: {
      ...r.games,
      [key]: { played: g.played + 1, won: g.won + (won ? 1 : 0) },
    },
  };
}
export function recordProblem(r: GoRecords, id: string): GoRecords {
  return r.problems.includes(id) ? r : { ...r, problems: [...r.problems, id] };
}
export const loadGoRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(GO_RECORDS_KEY, validateGoRecords, emptyGoRecords, s);
export const saveGoRecords = (
  r: GoRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(GO_RECORDS_KEY, r, s);
