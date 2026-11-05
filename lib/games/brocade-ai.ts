// 锦绣织造 AI：估值 = 分数 + 色彩加成 + 丝线 + 离心仪作品与贵客的距离；
// 把看不见的牌（牌堆、对手暗订）随机重发后做 alpha-beta 搜索，多次取平均（PIMC）。
import {
  CARDS,
  GOLD,
  NOBLES,
  WIN_POINTS,
  apply,
  bonuses,
  legalMoves,
  points,
  type BrocadeState,
  type BrocadeView,
  type Move,
  type Player,
  type Side,
} from './brocade.ts';

export type BrocadeLevel = 1 | 2 | 3 | 4 | 5;
export const BROCADE_LEVELS: Record<
  BrocadeLevel,
  {
    name: string;
    note: string;
    depth: number;
    samples: number;
    noise: number;
    ms: number;
  }
> = {
  1: { name: '学徒', note: '凭眼缘', depth: 1, samples: 1, noise: 0.45, ms: 0 },
  2: {
    name: '织工',
    note: '算眼前一步',
    depth: 1,
    samples: 1,
    noise: 0,
    ms: 0,
  },
  3: {
    name: '绣娘',
    note: '限时最多看两步',
    depth: 2,
    samples: 3,
    noise: 0,
    ms: 900,
  },
  4: {
    name: '掌柜',
    note: '限时最多看三步',
    depth: 3,
    samples: 3,
    noise: 0,
    ms: 1600,
  },
  5: {
    name: '织造',
    note: '限时最多三步、多牌局抽样',
    depth: 3,
    samples: 8,
    noise: 0,
    ms: 2600,
  },
};
export type BrocadeAiResult = { move: Move; score: number };

function playerValue(s: BrocadeState, p: Player): number {
  const b = bonuses(p);
  const pts = points(p);
  let v = pts * 10;
  if (pts >= WIN_POINTS) v += 40;
  v += b.reduce(
    (a, n) => a + Math.min(n, 5) * 3.2 + Math.max(0, n - 5) * 0.8,
    0,
  );
  v +=
    p.tokens.slice(0, 5).reduce((a, n) => a + n, 0) * 0.5 +
    p.tokens[GOLD] * 0.9;
  // Closeness to the best few cards.
  const targets: number[] = [];
  for (const id of [...s.market.flat(), ...p.reserved]) {
    if (id === null || id < 0) continue;
    const c = CARDS[id];
    let miss = 0;
    c.cost.forEach((n, g) => (miss += Math.max(0, n - b[g] - p.tokens[g])));
    miss = Math.max(0, miss - p.tokens[GOLD]);
    targets.push((c.points * 3 + 2) / (1 + miss));
  }
  targets.sort((a, b2) => b2 - a);
  v += targets.slice(0, 3).reduce((a, x) => a + x, 0) * 0.8;
  for (const id of s.nobles) {
    const need = NOBLES[id].need.reduce(
      (a, n, g) => a + Math.max(0, n - b[g]),
      0,
    );
    v += 6 / (1 + need);
  }
  return v;
}

export function evaluate(s: BrocadeState, side: Side): number {
  const o = (1 - side) as Side;
  if (s.phase === 'over')
    return s.winner === side ? 10000 : s.winner === o ? -10000 : 0;
  return playerValue(s, s.players[side]) - playerValue(s, s.players[o]);
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  const d = a.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function determinize(
  v: BrocadeView,
  side: Side,
  rng: () => number,
): BrocadeState {
  const seen = new Set<number>();
  for (const id of v.market.flat()) if (id !== null) seen.add(id);
  for (const p of v.players) {
    p.cards.forEach((id) => seen.add(id));
    p.reserved.forEach((id) => id >= 0 && seen.add(id));
  }
  const pools = [0, 1, 2].map((t) =>
    shuffle(
      CARDS.filter((c) => c.tier === t && !seen.has(c.id)).map((c) => c.id),
      rng,
    ),
  );
  const blind: [number[], number[]] = [[], []];
  const players = v.players.map((p, i) => ({
    tokens: p.tokens.slice(),
    cards: p.cards.slice(),
    nobles: p.nobles.slice(),
    reserved: p.reserved.map((id) => {
      if (id >= 0) return id;
      const real = pools[-1 - id].shift()!;
      blind[i].push(real);
      return real;
    }),
  })) as [Player, Player];
  const decks = pools.map((pool, t) => pool.slice(0, v.deckCounts[t]));
  const { you: _y, deckCounts: _d, players: _p, ...rest } = v;
  void side;
  return {
    ...rest,
    market: v.market.map((r) => r.slice()),
    bank: v.bank.slice(),
    decks,
    players,
    blind,
  };
}

class Timeout extends Error {}

export function chooseBrocadeMove(
  v: BrocadeView,
  side: Side,
  level: BrocadeLevel,
  rng: () => number = Math.random,
): BrocadeAiResult {
  const cfg = BROCADE_LEVELS[level];
  const base = determinize(v, side, rng);
  const moves = legalMoves(base);
  if (!moves.length) throw new Error('没有合法着法');
  const first = moves
    .map((m) => ({ m, v: evaluate(apply(base, side, m), side) }))
    .sort((a, b) => b.v - a.v);
  if (cfg.noise && rng() < cfg.noise) {
    const k = Math.floor(rng() * Math.min(6, first.length));
    return { move: first[k].m, score: first[k].v };
  }
  if (cfg.depth <= 1) return { move: first[0].m, score: first[0].v };
  const BEAM = 10;
  const deadline = Date.now() + cfg.ms;
  let nodes = 0;
  const search = (
    g: BrocadeState,
    depth: number,
    alpha: number,
    beta: number,
  ): number => {
    if ((++nodes & 63) === 0 && Date.now() > deadline) throw new Timeout();
    const me = g.toPlay;
    if (depth === 0 || g.phase === 'over') return evaluate(g, me);
    const kids = legalMoves(g)
      .map((m) => apply(g, me, m))
      .map((n) => ({ n, v: evaluate(n, me) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, BEAM);
    let best = -Infinity;
    for (const { n } of kids) {
      const val =
        n.phase === 'over'
          ? evaluate(n, me)
          : -search(n, depth - 1, -beta, -alpha);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return best;
  };
  const cands = first.slice(0, 12);
  const totals = cands.map(() => 0);
  let done = 0;
  try {
    for (let k = 0; k < cfg.samples; k++) {
      const world = k === 0 ? base : determinize(v, side, rng);
      const vals = cands.map(({ m }) => {
        const n = apply(world, side, m);
        return n.phase === 'over'
          ? evaluate(n, side)
          : -search(n, cfg.depth - 1, -Infinity, Infinity);
      });
      vals.forEach((x, i) => (totals[i] += x));
      done++;
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  }
  if (!done) return { move: first[0].m, score: first[0].v };
  let bi = 0;
  for (let i = 1; i < cands.length; i++) if (totals[i] > totals[bi]) bi = i;
  return { move: cands[bi].m, score: totals[bi] / done };
}
