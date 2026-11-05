// 琉璃坊 AI：按「本轮结束时的预计得分差」估值，束搜索（每层只展开最好的几步）+ alpha-beta。
// 唯一隐藏信息是袋中顺序，搜索不跨轮，因此 AI 不需要知道它。
import {
  COLORS,
  apply,
  floorPenalty,
  legalMoves,
  placeScore,
  wallCol,
  type Board,
  type Color,
  type GlazeState,
  type GlazeView,
  type Move,
  type Side,
} from './glaze.ts';

export type GlazeLevel = 1 | 2 | 3 | 4 | 5;
export const GLAZE_LEVELS: Record<
  GlazeLevel,
  {
    name: string;
    note: string;
    depth: number;
    beam: number;
    noise: number;
    ms: number;
  }
> = {
  1: { name: '学徒', note: '凭手感', depth: 1, beam: 99, noise: 0.45, ms: 0 },
  2: {
    name: '窑工',
    note: '算眼前一步',
    depth: 1,
    beam: 99,
    noise: 0,
    ms: 400,
  },
  3: {
    name: '把桩',
    note: '限时最多看两步',
    depth: 2,
    beam: 14,
    noise: 0,
    ms: 900,
  },
  4: {
    name: '窑主',
    note: '限时最多看三步',
    depth: 3,
    beam: 16,
    noise: 0,
    ms: 1600,
  },
  5: {
    name: '御窑',
    note: '限时最多看五步',
    depth: 5,
    beam: 10,
    noise: 0,
    ms: 2600,
  },
};
export type GlazeAiResult = { move: Move; score: number };

function project(b: Board, round: number): number {
  const wall = b.wall.map((r) => r.slice());
  let v = b.score;
  b.lines.forEach((l, r) => {
    if (l.color === null) return;
    if (l.n === r + 1) {
      const c = wallCol(r, l.color);
      wall[r][c] = true;
      v += placeScore(wall, r, c);
    } else {
      // Partial lines are worth something, less so late in the game.
      v += (l.n / (r + 1)) * (round >= 5 ? 0.8 : 1.6) - (r >= 3 ? 0.3 : 0);
    }
  });
  v += floorPenalty(b.floor.length);
  // Progress toward end bonuses.
  for (let r = 0; r < 5; r++) {
    const k = wall[r].filter(Boolean).length;
    v += k >= 4 ? 1.2 : 0;
  }
  for (let c = 0; c < 5; c++) {
    const k = wall.filter((row) => row[c]).length;
    v += k * k * 0.12;
  }
  for (let k = 0; k < 5; k++) {
    const n = [0, 1, 2, 3, 4].filter(
      (r) => wall[r][wallCol(r, k as Color)],
    ).length;
    v += n * n * 0.15;
  }
  return Math.max(0, v);
}

export function evaluate(s: GlazeState, side: Side): number {
  const o = (1 - side) as Side;
  if (s.phase === 'over') {
    const d = s.boards[side].score - s.boards[o].score;
    return d + (s.winner === side ? 1000 : s.winner === o ? -1000 : 0);
  }
  return project(s.boards[side], s.round) - project(s.boards[o], s.round);
}

class Timeout extends Error {}

export function fromView(v: GlazeView): GlazeState {
  const { you: _y, bagCount, lidCount, ...rest } = v;
  // Bag contents only matter after the round ends, which the search never crosses.
  const bag = Array.from({ length: bagCount }, (_, i) => (i % 5) as Color);
  const lid = Array.from({ length: lidCount }, (_, i) => (i % 5) as Color);
  return { ...rest, bag, lid };
}

export function chooseGlazeMove(
  v: GlazeView,
  side: Side,
  level: GlazeLevel,
  rng: () => number = Math.random,
): GlazeAiResult {
  const cfg = GLAZE_LEVELS[level];
  const s = fromView(v);
  const moves = legalMoves(s);
  if (!moves.length) throw new Error('没有合法着法');
  const scored = moves.map((m) => {
    const n = apply(s, side, m, rng);
    return {
      m,
      n,
      v:
        n.round !== s.round || n.phase === 'over'
          ? evaluate(n, side) + 0
          : evaluate(n, side),
    };
  });
  scored.sort((a, b) => b.v - a.v);
  if (cfg.noise && rng() < cfg.noise) {
    const k = Math.floor(rng() * Math.min(8, scored.length));
    return { move: scored[k].m, score: scored[k].v };
  }
  if (cfg.depth <= 1) return { move: scored[0].m, score: scored[0].v };
  const deadline = Date.now() + cfg.ms;
  let nodes = 0;
  const search = (
    g: GlazeState,
    depth: number,
    alpha: number,
    beta: number,
    round: number,
  ): number => {
    if ((++nodes & 127) === 0 && Date.now() > deadline) throw new Timeout();
    const me = g.toPlay;
    if (depth === 0 || g.phase === 'over' || g.round !== round)
      return evaluate(g, me);
    const children = legalMoves(g)
      .map((m) => apply(g, me, m, rng))
      .map((n) => ({ n, v: evaluate(n, me) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, cfg.beam);
    let best = -Infinity;
    for (const { n } of children) {
      // Turn passes to the opponent unless the round ended (new round: first player varies).
      const val =
        n.toPlay === me && (n.round !== round || n.phase === 'over')
          ? evaluate(n, me)
          : -search(n, depth - 1, -beta, -alpha, round);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return best;
  };
  let best = scored[0];
  let bestV = -Infinity;
  try {
    for (const c of scored.slice(0, Math.max(cfg.beam, 6))) {
      const ended = c.n.round !== s.round || c.n.phase === 'over';
      const val = ended
        ? evaluate(c.n, side)
        : -search(c.n, cfg.depth - 1, -Infinity, -bestV, s.round);
      if (val > bestV) {
        bestV = val;
        best = c;
      }
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  }
  return { move: best.m, score: Number.isFinite(bestV) ? bestV : best.v };
}

export { COLORS };
