// 步步为营 AI：最短路差估值 + 候选墙剪枝的 alpha-beta 搜索（迭代加深）。
import {
  A,
  N,
  applyUnchecked,
  distance,
  pawnMoves,
  shortestPath,
  wallLegal,
  withWall,
  type Move,
  type QuoridorState,
  type Side,
} from './quoridor.ts';

export type QuoridorLevel = 1 | 2 | 3 | 4 | 5 | 6;
export const QUORIDOR_LEVELS: Record<
  QuoridorLevel,
  { name: string; note: string; depth: number; ms: number; noise: number }
> = {
  1: { name: '新手', note: '只顾往前走', depth: 0, ms: 0, noise: 0.45 },
  2: { name: '入门', note: '看一步', depth: 1, ms: 300, noise: 0.15 },
  3: { name: '进阶', note: '看两步', depth: 2, ms: 600, noise: 0 },
  4: { name: '熟练', note: '看三步', depth: 3, ms: 1200, noise: 0 },
  5: { name: '高手', note: '看四步', depth: 4, ms: 1800, noise: 0 },
  6: { name: '大师', note: '深算 + 守墙', depth: 6, ms: 2800, noise: 0 },
};
export type QuoridorAiResult = { move: Move; score: number; depth: number };

const WIN = 100000;
class Timeout extends Error {}

function evaluate(s: QuoridorState, side: Side): number {
  if (s.winner !== null) return s.winner === side ? WIN : -WIN;
  const o = (1 - side) as Side;
  const dm = distance(s, s.pawns[side], side);
  const dop = distance(s, s.pawns[o], o);
  // When nobody has walls left the race is decided by tempo.
  if (s.left[0] === 0 && s.left[1] === 0) {
    const mine = s.toPlay === side ? dm : dm + 1;
    return mine <= dop ? WIN / 2 - dm : -WIN / 2 + dop;
  }
  return (
    (dop - dm) * 10 +
    (s.left[side] - s.left[o]) * 3 +
    (s.toPlay === side ? 4 : -4)
  );
}

/** Walls that touch the opponent's shortest path (plus a few near pawns). */
function candidateWalls(s: QuoridorState, wide: boolean): Move[] {
  const side = s.toPlay;
  if (s.left[side] <= 0) return [];
  const opp = (1 - side) as Side;
  const keys = new Set<string>();
  const add = (o: 'h' | 'v', x: number, y: number) => {
    if (x >= 0 && x < A && y >= 0 && y < A) keys.add(`${o}${x},${y}`);
  };
  const edges = (from: number, path: number[]) => {
    let a = from;
    for (const b of path) {
      const x = a % N;
      const y = Math.floor(a / N);
      if (b - a === N || a - b === N) {
        const r = Math.min(y, Math.floor(b / N));
        add('h', x - 1, r);
        add('h', x, r);
      } else {
        const c = Math.min(x, b % N);
        add('v', c, y - 1);
        add('v', c, y);
      }
      a = b;
    }
  };
  const oppPath = shortestPath(s, s.pawns[opp], opp);
  edges(s.pawns[opp], wide ? oppPath : oppPath.slice(0, 5));
  if (wide) {
    const p = s.pawns[side];
    const px = p % N;
    const py = Math.floor(p / N);
    for (let dy = -2; dy <= 1; dy++)
      for (let dx = -2; dx <= 1; dx++) {
        add('h', px + dx, py + dy);
        add('v', px + dx, py + dy);
      }
  }
  const before = distance(s, s.pawns[opp], opp);
  const out: { m: Move; gain: number }[] = [];
  for (const k of keys) {
    const o = k[0] as 'h' | 'v';
    const [x, y] = k.slice(1).split(',').map(Number);
    if (!wallLegal(s, o, x, y)) continue;
    const b = withWall(s, o, x, y);
    const gain =
      distance(b, s.pawns[opp], opp) -
      before -
      (distance(b, s.pawns[side], side) - distance(s, s.pawns[side], side));
    if (gain > 0 || (wide && gain === 0))
      out.push({ m: { t: 'w', o, x, y }, gain });
  }
  out.sort((a, b) => b.gain - a.gain);
  return out.slice(0, wide ? 24 : 14).map((e) => e.m);
}

function orderedMoves(s: QuoridorState, wide: boolean): Move[] {
  const side = s.toPlay;
  const pawn = pawnMoves(s)
    .map((to) => ({ to, d: distance(s, to, side) }))
    .sort((a, b) => a.d - b.d)
    .map(({ to }): Move => ({ t: 'm', to }));
  return [...pawn, ...candidateWalls(s, wide)];
}

export function chooseQuoridorMove(
  s: QuoridorState,
  level: QuoridorLevel,
  rng: () => number = Math.random,
): QuoridorAiResult {
  const cfg = QUORIDOR_LEVELS[level];
  const side = s.toPlay;
  const pawns = pawnMoves(s)
    .map((to) => ({ to, d: distance(s, to, side) }))
    .sort((a, b) => a.d - b.d);
  if (cfg.depth === 0) {
    // Mostly walk the shortest path, sometimes drop a wall in the way.
    const walls = candidateWalls(s, false);
    if (walls.length && rng() < 0.2)
      return {
        move: walls[Math.floor(rng() * Math.min(3, walls.length))],
        score: 0,
        depth: 0,
      };
    const pick = rng() < cfg.noise && pawns.length > 1 ? pawns[1] : pawns[0];
    return { move: { t: 'm', to: pick.to }, score: 0, depth: 0 };
  }
  const wide = level >= 6;
  const deadline = Date.now() + cfg.ms;
  let nodes = 0;
  const search = (
    g: QuoridorState,
    depth: number,
    alpha: number,
    beta: number,
  ): number => {
    if ((++nodes & 255) === 0 && Date.now() > deadline) throw new Timeout();
    if (g.winner !== null || depth === 0) return evaluate(g, g.toPlay);
    let best = -Infinity;
    for (const m of orderedMoves(g, wide)) {
      const v = -search(applyUnchecked(g, m), depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  };
  const root = orderedMoves(s, wide);
  // Immediate win.
  for (const m of root)
    if (m.t === 'm' && Math.floor(m.to / N) === (side === 0 ? 0 : N - 1))
      return { move: m, score: WIN, depth: 1 };
  let best: QuoridorAiResult = { move: root[0], score: -Infinity, depth: 0 };
  for (let depth = 1; depth <= cfg.depth; depth++) {
    try {
      let alpha = -Infinity;
      let cur: QuoridorAiResult | null = null;
      // Search the previous best first.
      const order = [best.move, ...root.filter((m) => m !== best.move)];
      for (const m of order) {
        const v = -search(applyUnchecked(s, m), depth - 1, -Infinity, -alpha);
        if (!cur || v > cur.score) cur = { move: m, score: v, depth };
        if (v > alpha) alpha = v;
      }
      best = cur!;
      if (best.score >= WIN / 2) break;
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  if (cfg.noise && rng() < cfg.noise && pawns.length)
    return {
      move: { t: 'm', to: pawns[0].to },
      score: best.score,
      depth: best.depth,
    };
  return best;
}
