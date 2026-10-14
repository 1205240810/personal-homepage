/**
 * 国际象棋 AI：自带 0x88 走法生成（chess-engine.ts）上的 PVS alpha-beta：
 * 迭代加深 + 渴望窗口、Zobrist 置换表、走法排序（置换表着法 / MVV-LVA / 杀手 / 历史）、
 * 静态吃子搜索、空着裁剪、后期着法减枝（LMR）、将军延伸、重复局面判和；
 * 渐进式估值（见 chess-engine.ts）与小型开局库。运行在 Web Worker 中。
 * 低难度通过限制深度、给根节点分数加扰动和按概率“随手一步”来放水。
 * 走法最终用 chess.js（BSD-2-Clause）换算成标准记谱。
 */
import { Chess } from 'chess.js';
import { Engine, MATE } from './chess-engine.ts';

export type ChessLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type LevelCfg = {
  name: string;
  maxDepth: number;
  timeMs: number;
  /** ± centipawns of noise on root scores. */
  noise: number;
  /** Probability of a random legal move. */
  blunder: number;
  book: boolean;
  note: string;
};
export const CHESS_LEVELS: Record<ChessLevel, LevelCfg> = {
  1: {
    name: '1 · 刚学走子',
    maxDepth: 1,
    timeMs: 100,
    noise: 400,
    blunder: 0.35,
    book: false,
    note: '经常白送子，粗估 <600 等级分',
  },
  2: {
    name: '2 · 入门',
    maxDepth: 1,
    timeMs: 100,
    noise: 220,
    blunder: 0.2,
    book: false,
    note: '只看一步，常看漏，粗估 ~800',
  },
  3: {
    name: '3 · 初学',
    maxDepth: 2,
    timeMs: 150,
    noise: 140,
    blunder: 0.1,
    book: false,
    note: '会吃送上门的子，粗估 ~1000',
  },
  4: {
    name: '4 · 业余新手',
    maxDepth: 2,
    timeMs: 200,
    noise: 70,
    blunder: 0.05,
    book: true,
    note: '偶尔失误，粗估 ~1200',
  },
  5: {
    name: '5 · 业余',
    maxDepth: 3,
    timeMs: 300,
    noise: 35,
    blunder: 0.02,
    book: true,
    note: '三步内战术基本不漏，粗估 ~1400',
  },
  6: {
    name: '6 · 业余进阶',
    maxDepth: 4,
    timeMs: 400,
    noise: 15,
    blunder: 0,
    book: true,
    note: '约 4 层，粗估 ~1600',
  },
  7: {
    name: '7 · 俱乐部',
    maxDepth: 6,
    timeMs: 700,
    noise: 0,
    blunder: 0,
    book: true,
    note: '约 6 层 / 0.7 秒，粗估 ~1800',
  },
  8: {
    name: '8 · 俱乐部强手',
    maxDepth: 64,
    timeMs: 1200,
    noise: 0,
    blunder: 0,
    book: true,
    note: '思考约 1.2 秒，粗估 ~1900',
  },
  9: {
    name: '9 · 强',
    maxDepth: 64,
    timeMs: 2500,
    noise: 0,
    blunder: 0,
    book: true,
    note: '思考约 2.5 秒，粗估 ~2000',
  },
  10: {
    name: '10 · 最强',
    maxDepth: 64,
    timeMs: 5000,
    noise: 0,
    blunder: 0,
    book: true,
    note: '思考约 5 秒，粗估 ~2100',
  },
};

// ---------- Transposition table ----------
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const EXACT = 1,
  LOWER = 2,
  UPPER = 3;
class TT {
  hi = new Int32Array(TT_SIZE);
  lo = new Int32Array(TT_SIZE);
  move = new Int32Array(TT_SIZE);
  score = new Int32Array(TT_SIZE);
  depth = new Int8Array(TT_SIZE);
  flag = new Uint8Array(TT_SIZE);
  clear() {
    this.flag.fill(0);
  }
}
let sharedTT: TT | null = null;
const tt = () => (sharedTT ??= new TT());

type Ctx = {
  e: Engine;
  t: TT;
  deadline: number;
  stop: boolean;
  now: () => number;
  killers: Int32Array; // 2 per ply
  history: Int32Array; // [side][from][to] flattened: 2*128*128
};

const hidx = (side: number, m: number) =>
  (side === 1 ? 0 : 16384) + (m & 127) * 128 + ((m >> 7) & 127);

function pickNext(moves: number[], scores: number[], i: number) {
  let bi = i;
  for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[bi]) bi = j;
  if (bi !== i) {
    const m = moves[i];
    moves[i] = moves[bi];
    moves[bi] = m;
    const s = scores[i];
    scores[i] = scores[bi];
    scores[bi] = s;
  }
}

function hasLegalMove(e: Engine) {
  return e.gen().some((m) => {
    if (!e.make(m)) return false;
    e.unmake();
    return true;
  });
}

function quiesce(ctx: Ctx, alpha: number, beta: number, ply: number): number {
  const e = ctx.e;
  if ((++e.nodes & 1023) === 0 && ctx.now() > ctx.deadline) ctx.stop = true;
  if (ctx.stop) return 0;
  const inCheck = e.inCheck();
  // Even at the horizon, a checked king must evade and a stalemate is a draw.
  if (e.half >= 100 || e.repeated())
    return inCheck && !hasLegalMove(e) ? -MATE + ply : 0;
  const stand = e.evaluate();
  if (!inCheck) {
    if (stand >= beta) return hasLegalMove(e) ? stand : 0;
    if (alpha < stand) alpha = stand;
  }
  if (ply > 40) return hasLegalMove(e) ? stand : inCheck ? -MATE + ply : 0;
  const moves = e.gen(!inCheck);
  const scores = moves.map((m) => e.captureScore(m));
  let legal = 0;
  for (let i = 0; i < moves.length; i++) {
    pickNext(moves, scores, i);
    if (!e.make(moves[i])) continue;
    legal++;
    // Never prune a check evasion, a checking capture, or a promotion.
    const gain = (scores[i] - 10000) / 10 + 50;
    if (
      !inCheck &&
      !e.inCheck() &&
      !((moves[i] >> 14) & 7) &&
      stand + gain + 200 < alpha
    ) {
      e.unmake();
      continue;
    }
    const v = -quiesce(ctx, -beta, -alpha, ply + 1);
    e.unmake();
    if (ctx.stop) return 0;
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  if (!legal && (inCheck || !hasLegalMove(e))) return inCheck ? -MATE + ply : 0;
  return alpha;
}

function search(
  ctx: Ctx,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  allowNull: boolean,
): number {
  const e = ctx.e;
  if ((++e.nodes & 2047) === 0 && ctx.now() > ctx.deadline) ctx.stop = true;
  if (ctx.stop) return 0;
  if (ply > 0 && (e.half >= 100 || e.repeated())) return 0;
  const inCheck = e.inCheck();
  if (inCheck && ply < 30) depth++;
  if (depth <= 0) return quiesce(ctx, alpha, beta, ply);
  const pv = beta - alpha > 1;
  // Transposition table probe.
  const t = ctx.t;
  const ix = e.hlo & (TT_SIZE - 1);
  let ttMove = 0;
  if (t.flag[ix] && t.hi[ix] === e.hhi && t.lo[ix] === e.hlo) {
    ttMove = t.move[ix];
    if (!pv && t.depth[ix] >= depth && ply > 0) {
      let v = t.score[ix];
      if (v > MATE - 1000) v -= ply;
      else if (v < -MATE + 1000) v += ply;
      const f = t.flag[ix];
      if (
        f === EXACT ||
        (f === LOWER && v >= beta) ||
        (f === UPPER && v <= alpha)
      )
        return v;
    }
  }
  // Null-move pruning.
  if (
    allowNull &&
    !pv &&
    !inCheck &&
    depth >= 3 &&
    e.pieceMaterial(e.side) > 0 &&
    e.evaluate() >= beta
  ) {
    const r = depth >= 6 ? 3 : 2;
    e.makeNull();
    const v = -search(ctx, depth - 1 - r, -beta, -beta + 1, ply + 1, false);
    e.unmakeNull();
    if (ctx.stop) return 0;
    if (v >= beta && v < MATE - 1000) return v;
  }
  const moves = e.gen();
  const k0 = ctx.killers[ply * 2],
    k1 = ctx.killers[ply * 2 + 1];
  const scores = moves.map((m) => {
    if (m === ttMove) return 1 << 30;
    const c = e.captureScore(m);
    if (c) return 1e6 + c;
    if (m === k0) return 9e5;
    if (m === k1) return 8e5;
    return ctx.history[hidx(e.side, m)];
  });
  let legal = 0;
  let best = -Infinity;
  let bestMove = 0;
  const a0 = alpha;
  for (let i = 0; i < moves.length; i++) {
    pickNext(moves, scores, i);
    const m = moves[i];
    if (!e.make(m)) continue;
    legal++;
    const quiet = scores[i] < 8e5 && m !== ttMove;
    const givesCheck = e.inCheck();
    let v: number;
    if (legal === 1) v = -search(ctx, depth - 1, -beta, -alpha, ply + 1, true);
    else {
      // Late move reductions for quiet moves.
      let red = 0;
      if (depth >= 3 && legal > 3 && quiet && !inCheck && !givesCheck)
        red = legal > 10 && depth >= 6 ? 2 : 1;
      v = -search(ctx, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (v > alpha && red)
        v = -search(ctx, depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (v > alpha && v < beta)
        v = -search(ctx, depth - 1, -beta, -alpha, ply + 1, true);
    }
    e.unmake();
    if (ctx.stop) return 0;
    if (v > best) {
      best = v;
      bestMove = m;
    }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (quiet) {
        if (m !== k0) {
          ctx.killers[ply * 2 + 1] = k0;
          ctx.killers[ply * 2] = m;
        }
        ctx.history[hidx(e.side, m)] += depth * depth;
      }
      break;
    }
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  // Store.
  if (t.depth[ix] <= depth || !t.flag[ix] || t.hi[ix] !== e.hhi) {
    t.hi[ix] = e.hhi;
    t.lo[ix] = e.hlo;
    t.move[ix] = bestMove;
    t.depth[ix] = depth;
    let sv = best;
    if (sv > MATE - 1000) sv += ply;
    else if (sv < -MATE + 1000) sv -= ply;
    t.score[ix] = sv;
    t.flag[ix] = best >= beta ? LOWER : best > a0 ? EXACT : UPPER;
  }
  return best;
}

// ---------- Opening book ----------
const BOOK_LINES = [
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7',
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6',
  'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
  'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6',
  'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7',
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5',
  'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O',
  'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4',
  'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7',
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O',
  'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5',
  'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4',
];
let book: Map<string, string[]> | null = null;
const bookKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
function getBook() {
  if (book) return book;
  book = new Map();
  for (const line of BOOK_LINES) {
    const c = new Chess();
    for (const san of line.split(' ')) {
      const k = bookKey(c.fen());
      const list = book.get(k) ?? [];
      if (!list.includes(san)) list.push(san);
      book.set(k, list);
      c.move(san);
    }
  }
  return book;
}
export function bookMoves(fen: string): string[] {
  return getBook().get(bookKey(fen)) ?? [];
}

export type AiResult = {
  san: string;
  score: number;
  depth: number;
  nodes: number;
  book?: boolean;
};

/**
 * Search a position. `history` (earlier FENs of the game) lets the engine see repetitions.
 * Returns the best move with its score (side to move's view).
 */
export function searchBest(
  fen: string,
  opts: {
    maxDepth: number;
    timeMs: number;
    now?: () => number;
    history?: string[];
    rootScores?: boolean;
    /** Clear the transposition table first (deterministic analysis). */
    fresh?: boolean;
  },
): {
  scored: { m: number; v: number }[];
  depth: number;
  nodes: number;
  engine: Engine;
} {
  const now = opts.now ?? (() => Date.now());
  const e = new Engine(fen);
  // Seed repetition keys from the game history.
  if (opts.history)
    for (const h of opts.history) {
      const he = new Engine(h);
      e.keys.push(he.hlo, he.hhi);
    }
  const t = tt();
  if (opts.fresh) t.clear();
  const ctx: Ctx = {
    e,
    t,
    deadline: now() + opts.timeMs,
    stop: false,
    now,
    killers: new Int32Array(256),
    history: new Int32Array(32768),
  };
  let scored = e
    .gen()
    .filter((m) => {
      const ok = e.make(m);
      if (ok) e.unmake();
      return ok;
    })
    .map((m) => ({ m, v: 0 }));
  if (!scored.length) return { scored, depth: 0, nodes: e.nodes, engine: e };
  scored.sort((a, b) => e.captureScore(b.m) - e.captureScore(a.m));
  let doneDepth = 0;
  let prev = 0;
  for (let d = 1; d <= opts.maxDepth; d++) {
    let window = d >= 4 && !opts.rootScores ? 40 : Infinity;
    let lo = prev - window;
    let hi = prev + window;
    let next: { m: number; v: number }[] = [];
    for (;;) {
      next = [];
      let alpha = lo;
      for (const { m } of scored) {
        e.make(m);
        let v: number;
        if (opts.rootScores)
          v = -search(ctx, d - 1, -Infinity, Infinity, 1, true);
        else if (!next.length) v = -search(ctx, d - 1, -hi, -alpha, 1, true);
        else {
          v = -search(ctx, d - 1, -alpha - 1, -alpha, 1, true);
          if (v > alpha && v < hi)
            v = -search(ctx, d - 1, -hi, -alpha, 1, true);
        }
        e.unmake();
        if (ctx.stop) break;
        next.push({ m, v });
        if (v > alpha) alpha = v;
        if (alpha >= hi) break;
      }
      if (ctx.stop) break;
      const best = Math.max(...next.map((x) => x.v));
      if (best <= lo && window !== Infinity) {
        window *= 4;
        lo = best - window;
        if (window > 1000) lo = -Infinity;
        continue;
      }
      if (best >= hi && window !== Infinity) {
        window *= 4;
        hi = best + window;
        if (window > 1000) hi = Infinity;
        continue;
      }
      break;
    }
    if (ctx.stop) {
      if (doneDepth === 0 && next.length)
        scored = next.sort((a, b) => b.v - a.v);
      else if (
        next.length &&
        next[0] &&
        next.reduce((a, b) => (b.v > a.v ? b : a)).v > scored[0].v
      ) {
        const top = next.reduce((a, b) => (b.v > a.v ? b : a));
        scored = [top, ...scored.filter((x) => x.m !== top.m)];
      }
      break;
    }
    const seen = new Set(next.map((x) => x.m));
    scored = [
      ...next.sort((a, b) => b.v - a.v),
      ...scored.filter((x) => !seen.has(x.m)),
    ];
    prev = scored[0].v;
    doneDepth = d;
    if (Math.abs(scored[0].v) > MATE - 200 && d >= 2) break;
  }
  return { scored, depth: doneDepth, nodes: e.nodes, engine: e };
}

/**
 * Pick a move for the side to move. `rand` and `now` are injectable for tests.
 */
export function chooseMove(
  fen: string,
  level: ChessLevel,
  rand: () => number = Math.random,
  now: () => number = () => Date.now(),
  history: string[] = [],
): AiResult | null {
  const c = new Chess(fen);
  const legal = c.moves({ verbose: true });
  if (!legal.length) return null;
  const cfg = CHESS_LEVELS[level];
  if (cfg.blunder && rand() < cfg.blunder) {
    const m = legal[(rand() * legal.length) | 0];
    return { san: m.san, score: 0, depth: 0, nodes: 0 };
  }
  if (cfg.book) {
    const b = bookMoves(fen).filter((s) => legal.some((m) => m.san === s));
    if (b.length)
      return {
        san: b[(rand() * b.length) | 0],
        score: 0,
        depth: 0,
        nodes: 0,
        book: true,
      };
  }
  const r = searchBest(fen, {
    maxDepth: cfg.maxDepth,
    timeMs: cfg.timeMs,
    now,
    history,
    rootScores: cfg.noise > 0,
  });
  const sanOf = new Map(legal.map((m) => [m.lan, m.san]));
  let pick = r.scored[0];
  if (cfg.noise && pick.v < MATE - 1000)
    pick = r.scored
      .map((x) => ({ ...x, n: x.v + (rand() * 2 - 1) * cfg.noise }))
      .sort((a, b) => b.n - a.n)[0];
  const san = sanOf.get(r.engine.moveKey(pick.m)) ?? legal[0].san;
  return { san, score: pick.v, depth: r.depth, nodes: r.nodes };
}

/** Engine analysis for puzzle tooling: best move (SAN) and score for the side to move. */
export function analyse(
  fen: string,
  timeMs = 1000,
  maxDepth = 64,
  fresh = false,
) {
  const c = new Chess(fen);
  const legal = c.moves({ verbose: true });
  if (!legal.length) return null;
  const r = searchBest(fen, { maxDepth, timeMs, fresh });
  const sanOf = new Map(legal.map((m) => [m.lan, m.san]));
  return {
    san: sanOf.get(r.engine.moveKey(r.scored[0].m)) ?? legal[0].san,
    score: r.scored[0].v,
    depth: r.depth,
  };
}

export const isMateScore = (v: number) => Math.abs(v) > MATE - 1000;
/** Moves until mate for a mate score (positive = side to move mates). */
export const mateIn = (v: number) =>
  Math.sign(v) * Math.ceil((MATE - Math.abs(v)) / 2);

/** Static evaluation (centipawns) from the side to move's point of view. */
export const evaluate = (c: Chess) => new Engine(c.fen()).evaluate();

function allRepliesMate(c: Chess, n: number): boolean {
  for (const r of c.moves({ verbose: true })) {
    c.move(r);
    const ok = mateKeys(c.fen(), n).length > 0;
    c.undo();
    if (!ok) return false;
  }
  return true;
}
/** Every move for the side to move that forces checkmate within n moves (exhaustive). */
export function mateKeys(fen: string, n: number): string[] {
  const c = new Chess(fen);
  const keys: string[] = [];
  for (const m of c.moves({ verbose: true })) {
    c.move(m);
    const ok =
      c.isCheckmate() || (n > 1 && !c.isGameOver() && allRepliesMate(c, n - 1));
    c.undo();
    if (ok) keys.push(m.san);
  }
  return keys;
}
