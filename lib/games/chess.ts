/**
 * 国际象棋：规则由 chess.js（BSD-2-Clause）负责；这里是对局重放、终局判定文案、
 * 残局题库与本机记录。
 */
import { Chess } from 'chess.js';
import { isPlainObject, loadJson, saveJson } from './kit.ts';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export type Color = 'w' | 'b';

/** Rebuild a game from a start position and a SAN move list. */
export function replay(fen: string, sans: string[]) {
  const c = new Chess(fen);
  for (const s of sans) c.move(s);
  return c;
}

export type GameEnd =
  | { over: false; check: boolean }
  | { over: true; winner: Color | null; reason: string };

export function gameEnd(c: Chess): GameEnd {
  if (c.isCheckmate()) {
    const winner: Color = c.turn() === 'w' ? 'b' : 'w';
    return { over: true, winner, reason: '将死' };
  }
  if (c.isStalemate())
    return { over: true, winner: null, reason: '逼和（无子可动）' };
  if (c.isInsufficientMaterial())
    return { over: true, winner: null, reason: '子力不足，和棋' };
  if (c.isThreefoldRepetition())
    return { over: true, winner: null, reason: '三次重复局面，和棋' };
  if (c.isDrawByFiftyMoves())
    return { over: true, winner: null, reason: '五十回合规则，和棋' };
  return { over: false, check: c.inCheck() };
}

export const PIECE_NAMES: Record<string, string> = {
  k: '王',
  q: '后',
  r: '车',
  b: '象',
  n: '马',
  p: '兵',
};

export type ChessPuzzle = {
  id: string;
  name: string;
  fen: string;
  /** Mate in n moves (for `mate` puzzles). */
  n: number;
  kind: 'mate' | 'play';
  /** Main line in SAN, attacker and defender alternating. */
  line: string[];
  /** All first moves that also force mate in n (verified by tests). */
  keys: string[];
  note: string;
};

export const CHESS_PUZZLES: ChessPuzzle[] = [
  {
    id: 'back-rank',
    name: '底线杀',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    n: 1,
    kind: 'mate',
    line: ['Rd8#'],
    keys: ['Rd8#'],
    note: '黑王被自己的兵堵在底线。',
  },
  {
    id: 'scholar',
    name: '学者杀',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3',
    n: 1,
    kind: 'mate',
    line: ['Qxf7#'],
    keys: ['Qxf7#'],
    note: 'f7 只有王在保护。',
  },
  {
    id: 'smothered',
    name: '闷杀',
    fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    n: 1,
    kind: 'mate',
    line: ['Nf7#'],
    keys: ['Nf7#'],
    note: '王被自己的子围死，马来收尾。',
  },
  {
    id: 'arabian',
    name: '阿拉伯杀',
    fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1',
    n: 1,
    kind: 'mate',
    line: ['Rh7#'],
    keys: ['Rh7#'],
    note: '车与马配合的最古老杀法之一。',
  },
  {
    id: 'queen-king',
    name: '后王杀',
    fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
    n: 1,
    kind: 'mate',
    line: ['Qg7#'],
    keys: ['Qg7#'],
    note: '王护着后贴上去。',
  },
  {
    id: 'ladder',
    name: '双车楼梯',
    fen: '6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1',
    n: 2,
    kind: 'mate',
    line: ['Ra7', 'Kf8', 'Rb8#'],
    keys: ['Ra7', 'Rb7'],
    note: '一车封线，一车将军。',
  },
  {
    id: 'legal',
    name: '列加尔杀',
    fen: 'r2qkbnr/ppp2ppp/2np4/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6',
    n: 2,
    kind: 'mate',
    line: ['Bxf7+', 'Ke7', 'Nd5#'],
    keys: ['Bxf7+'],
    note: '黑方刚吃了后——代价是王。',
  },
  {
    id: 'opera',
    name: '歌剧院之局',
    fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 1',
    n: 2,
    kind: 'mate',
    line: ['Qb8+', 'Nxb8', 'Rd8#'],
    keys: ['Qb8+'],
    note: '莫菲 1858 年在巴黎歌剧院包厢里下出的终局。',
  },
  {
    id: 'queen-sac',
    name: '弃后底线杀',
    fen: 'r1b2k1r/ppp1bppp/8/1B1Q4/5q2/2P5/PPP2PPP/R3R1K1 w - - 1 1',
    n: 2,
    kind: 'mate',
    line: ['Qd8+', 'Bxd8', 'Re8#'],
    keys: ['Qd8+'],
    note: '把守底线的象被引走。',
  },
  {
    id: 'kq-vs-k',
    name: '练习：王后杀单王',
    fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1',
    n: 0,
    kind: 'play',
    line: [],
    keys: [],
    note: '对手（AI）会尽力逃跑。把它逼到边线再将死；小心别逼和。',
  },
  {
    id: 'kr-vs-k',
    name: '练习：单车杀单王',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    n: 0,
    kind: 'play',
    line: [],
    keys: [],
    note: '车切断王的退路，自己的王上前帮忙。注意五十回合规则。',
  },
];

export const CHESS_RECORDS_KEY = 'tscjj:chess:v1';
export type ChessRecords = {
  games: Record<string, { played: number; won: number; drawn: number }>;
  puzzles: string[];
};
export const emptyChessRecords = (): ChessRecords => ({
  games: {},
  puzzles: [],
});
const nat = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0;
export function validateChessRecords(v: unknown): ChessRecords | null {
  if (!isPlainObject(v) || !isPlainObject(v.games) || !Array.isArray(v.puzzles))
    return null;
  const games: ChessRecords['games'] = {};
  for (const [k, g] of Object.entries(v.games))
    if (
      /^[1-5]$/.test(k) &&
      isPlainObject(g) &&
      nat(g.played) &&
      nat(g.won) &&
      nat(g.drawn)
    )
      games[k] = { played: g.played, won: g.won, drawn: g.drawn };
  const ids = new Set(CHESS_PUZZLES.map((p) => p.id));
  return {
    games,
    puzzles: v.puzzles.filter(
      (p): p is string => typeof p === 'string' && ids.has(p),
    ),
  };
}
export function recordGame(
  r: ChessRecords,
  level: number,
  result: 'won' | 'lost' | 'drawn',
) {
  const g = r.games[level] ?? { played: 0, won: 0, drawn: 0 };
  return {
    ...r,
    games: {
      ...r.games,
      [level]: {
        played: g.played + 1,
        won: g.won + (result === 'won' ? 1 : 0),
        drawn: g.drawn + (result === 'drawn' ? 1 : 0),
      },
    },
  };
}
export function recordPuzzle(r: ChessRecords, id: string) {
  return r.puzzles.includes(id) ? r : { ...r, puzzles: [...r.puzzles, id] };
}
export const loadChessRecords = (s?: Pick<Storage, 'getItem'> | null) =>
  loadJson(CHESS_RECORDS_KEY, validateChessRecords, emptyChessRecords, s);
export const saveChessRecords = (
  r: ChessRecords,
  s?: Pick<Storage, 'setItem'> | null,
) => saveJson(CHESS_RECORDS_KEY, r, s);
