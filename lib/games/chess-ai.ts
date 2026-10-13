/**
 * 国际象棋 AI：自带 0x88 走法生成（chess-engine.ts）上的 alpha-beta + 迭代加深，
 * 估值为子力 + 位置表（PST），带静态吃子搜索、MVV-LVA 与杀手着法排序。运行在 Web Worker 中。
 * 走法最终用 chess.js（BSD-2-Clause）换算成标准记谱。
 * 低难度通过限制深度与给分数加随机扰动来“放水”。
 */
import { Chess } from 'chess.js';
import { Engine, MATE } from './chess-engine.ts';

export type ChessLevel = 1 | 2 | 3 | 4 | 5;
export const CHESS_LEVELS: Record<
  ChessLevel,
  {
    name: string;
    maxDepth: number;
    timeMs: number;
    noise: number;
    note: string;
  }
> = {
  1: {
    name: '入门',
    maxDepth: 1,
    timeMs: 200,
    noise: 220,
    note: '只看一步，还常常看走眼',
  },
  2: {
    name: '初级',
    maxDepth: 2,
    timeMs: 400,
    noise: 80,
    note: '看两步，偶尔失误',
  },
  3: {
    name: '中级',
    maxDepth: 3,
    timeMs: 800,
    noise: 20,
    note: '三步内的战术基本能看到',
  },
  4: {
    name: '高级',
    maxDepth: 6,
    timeMs: 1500,
    noise: 0,
    note: '迭代加深，最多 6 层 / 1.5 秒',
  },
  5: {
    name: '最强',
    maxDepth: 30,
    timeMs: 3000,
    noise: 0,
    note: '迭代加深约 3 秒（常见局面 6–7 层）',
  },
};

type Ctx = {
  e: Engine;
  deadline: number;
  stop: boolean;
  now: () => number;
  killers: number[][];
};

function quiesce(ctx: Ctx, alpha: number, beta: number, depth: number): number {
  const e = ctx.e;
  if ((++e.nodes & 1023) === 0 && ctx.now() > ctx.deadline) ctx.stop = true;
  if (ctx.stop) return 0;
  const stand = e.evaluate();
  if (stand >= beta) return stand;
  if (alpha < stand) alpha = stand;
  if (depth <= 0) return stand;
  const moves = e.gen(true);
  const scores = moves.map((m) => e.captureScore(m));
  for (let i = 0; i < moves.length; i++) {
    let bi = i;
    for (let j = i + 1; j < moves.length; j++)
      if (scores[j] > scores[bi]) bi = j;
    [moves[i], moves[bi]] = [moves[bi], moves[i]];
    [scores[i], scores[bi]] = [scores[bi], scores[i]];
    if (!e.make(moves[i])) continue;
    const v = -quiesce(ctx, -beta, -alpha, depth - 1);
    e.unmake();
    if (ctx.stop) return 0;
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(
  ctx: Ctx,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  const e = ctx.e;
  if ((++e.nodes & 1023) === 0 && ctx.now() > ctx.deadline) ctx.stop = true;
  if (ctx.stop) return 0;
  if (ply > 0 && e.half >= 100) return 0;
  const check = e.inCheck();
  if (check && ply < 12) depth++;
  if (depth <= 0) return quiesce(ctx, alpha, beta, 6);
  const moves = e.gen();
  const k = ctx.killers[ply] ?? [];
  const scores = moves.map(
    (m) => e.captureScore(m) || (m === k[0] ? 900 : m === k[1] ? 800 : 0),
  );
  let legal = 0;
  let best = -Infinity;
  for (let i = 0; i < moves.length; i++) {
    let bi = i;
    for (let j = i + 1; j < moves.length; j++)
      if (scores[j] > scores[bi]) bi = j;
    [moves[i], moves[bi]] = [moves[bi], moves[i]];
    [scores[i], scores[bi]] = [scores[bi], scores[i]];
    const m = moves[i];
    if (!e.make(m)) continue;
    legal++;
    const v = -search(ctx, depth - 1, -beta, -alpha, ply + 1);
    e.unmake();
    if (ctx.stop) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!scores[i]) ctx.killers[ply] = [m, k[0] ?? 0];
      break;
    }
  }
  if (!legal) return check ? -MATE + ply : 0;
  return best;
}

export type AiResult = {
  san: string;
  score: number;
  depth: number;
  nodes: number;
};

/**
 * Pick a move for the side to move. `rand` and `now` are injectable for tests.
 * Root moves are searched with iterative deepening (best move first next time);
 * lower levels add noise to root scores so they sometimes choose a worse move.
 */
export function chooseMove(
  fen: string,
  level: ChessLevel,
  rand: () => number = Math.random,
  now: () => number = () => Date.now(),
): AiResult | null {
  const c = new Chess(fen);
  const legal = c.moves({ verbose: true });
  if (!legal.length) return null;
  const cfg = CHESS_LEVELS[level];
  const e = new Engine(fen);
  const ctx: Ctx = {
    e,
    deadline: now() + cfg.timeMs,
    stop: false,
    now,
    killers: [],
  };
  const sanOf = new Map(legal.map((m) => [m.lan, m.san]));
  let scored = e
    .gen()
    .filter((m) => {
      const ok = e.make(m);
      if (ok) e.unmake();
      return ok;
    })
    .map((m) => ({ m, v: 0 }))
    .sort((a, b) => e.captureScore(b.m) - e.captureScore(a.m));
  let doneDepth = 0;
  for (let d = 1; d <= cfg.maxDepth; d++) {
    const next: { m: number; v: number }[] = [];
    let alpha = -Infinity;
    for (const { m } of scored) {
      e.make(m);
      // With noise every root move needs an exact score, so use a full window.
      const lo = cfg.noise ? -Infinity : alpha;
      const v = -search(ctx, d - 1, -Infinity, -lo, 1);
      e.unmake();
      if (ctx.stop) break;
      next.push({ m, v });
      if (v > alpha) alpha = v;
    }
    if (ctx.stop) {
      // A partial iteration is only trusted if its best move beats the previous best.
      if (doneDepth === 0 && next.length)
        scored = next.sort((a, b) => b.v - a.v);
      else if (next.length && Math.max(...next.map((x) => x.v)) > scored[0].v) {
        const top = next.sort((a, b) => b.v - a.v)[0];
        scored = [top, ...scored.filter((x) => x.m !== top.m)];
      }
      break;
    }
    scored = next.sort((a, b) => b.v - a.v);
    doneDepth = d;
    if (Math.abs(scored[0].v) > MATE - 100) break;
  }
  let pick = scored[0];
  if (cfg.noise && scored[0].v < MATE - 100)
    pick = scored
      .map((x) => ({ ...x, n: x.v + (rand() * 2 - 1) * cfg.noise }))
      .sort((a, b) => b.n - a.n)[0];
  const san = sanOf.get(e.moveKey(pick.m)) ?? legal[0].san;
  return { san, score: pick.v, depth: doneDepth, nodes: e.nodes };
}

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
