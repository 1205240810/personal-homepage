// 丝路远行 AI：启发式策略 + 确定化蒙特卡洛（PIMC）。
// AI 只拿到自己的视图：把看不见的牌（对手手牌 + 牌堆）随机重发若干次，
// 每种可能都用启发式策略把这一轮下完，取平均分差最高的着法。
import {
  HAND,
  ROUTES,
  apply,
  canPlay,
  isWager,
  legalMoves,
  routeOf,
  routeScore,
  topValue,
  valueOf,
  type ExpeditionState,
  type ExpeditionView,
  type Move,
  type Side,
} from './expedition.ts';

export type ExpeditionLevel = 1 | 2 | 3 | 4 | 5;
export const EXPEDITION_LEVELS: Record<
  ExpeditionLevel,
  { name: string; note: string; samples: number; noise: number; ms: number }
> = {
  1: { name: '学徒', note: '随性出牌', samples: 0, noise: 0.5, ms: 0 },
  2: { name: '行脚', note: '会算账', samples: 0, noise: 0, ms: 0 },
  3: { name: '驼队', note: '推演 20 种牌局', samples: 20, noise: 0, ms: 900 },
  4: { name: '商首', note: '推演 60 种牌局', samples: 60, noise: 0, ms: 1600 },
  5: {
    name: '大贾',
    note: '推演 150 种牌局',
    samples: 150,
    noise: 0,
    ms: 2600,
  },
};
export type ExpeditionAiResult = { move: Move; score: number };

/** Projected score of one route if the cards held for it get played. */
function projected(
  route: readonly number[],
  hand: readonly number[],
  r: number,
  turnsLeft: number,
) {
  const top = topValue(route);
  const mine = hand.filter(
    (c) => routeOf(c) === r && (isWager(c) ? top === 0 : valueOf(c) > top),
  );
  if (!route.length) {
    const sum = mine.reduce((a, c) => a + valueOf(c), 0);
    const wagers = mine.filter(isWager).length;
    // Only worth opening with enough points and time.
    if (sum < 18 || turnsLeft < mine.length + 2) return 0;
    return (sum + Math.min(turnsLeft, 6) * 1.2 - 20) * (1 + wagers) * 0.6;
  }
  const playable = mine.slice(0, Math.max(0, turnsLeft));
  return (
    routeScore([...route, ...playable]) +
    Math.min(turnsLeft, 4) * 0.8 * (1 + route.filter(isWager).length)
  );
}

function evaluate(
  routes: readonly (readonly number[])[],
  hand: readonly number[],
  turnsLeft: number,
): number {
  let v = 0;
  for (let r = 0; r < ROUTES; r++)
    v += projected(routes[r], hand, r, turnsLeft);
  return v;
}

/** Greedy play choice for the side to move (full-information state). */
function greedyPlay(s: ExpeditionState): Move {
  const side = s.toPlay;
  const opp = (1 - side) as Side;
  const turns = Math.ceil(s.deck.length / 2);
  const hand = s.hands[side];
  let best: Move = { t: 'discard', card: hand[0] };
  let bestV = -Infinity;
  for (const c of hand) {
    const rest = hand.filter((x) => x !== c);
    const r = routeOf(c);
    if (canPlay(s.routes[side][r], c)) {
      const routes = s.routes[side].map((x, i) => (i === r ? [...x, c] : x));
      // Prefer playing low cards first: skipped lower cards are lost.
      const v = evaluate(routes, rest, turns) + 0.4;
      if (v > bestV) {
        bestV = v;
        best = { t: 'play', card: c };
      }
    }
    // Discarding hands the card to the opponent if they can use it.
    const gift =
      canPlay(s.routes[opp][r], c) && s.routes[opp][r].length
        ? valueOf(c) || 4
        : 0;
    const v =
      evaluate(s.routes[side], rest, turns) -
      gift * 0.9 -
      (valueOf(c) ? 0 : 0.5);
    if (v > bestV) {
      bestV = v;
      best = { t: 'discard', card: c };
    }
  }
  return best;
}

function greedyDraw(s: ExpeditionState): Move {
  const side = s.toPlay;
  const turns = Math.ceil(s.deck.length / 2);
  let best: Move = { t: 'draw', from: 'deck' };
  // Drawing from the deck also advances the clock; a mild bonus when ahead.
  let bestV = s.deck.length ? 2.5 : -Infinity;
  const base = evaluate(s.routes[side], s.hands[side], turns);
  for (let r = 0; r < ROUTES; r++) {
    const pile = s.discard[r];
    if (!pile.length || r === s.justDiscarded) continue;
    const c = pile[pile.length - 1];
    const v = evaluate(s.routes[side], [...s.hands[side], c], turns) - base;
    if (v > bestV) {
      bestV = v;
      best = { t: 'draw', from: r };
    }
  }
  return best;
}

function greedy(s: ExpeditionState): Move {
  return s.phase === 'play' ? greedyPlay(s) : greedyDraw(s);
}

function rolloutRound(s: ExpeditionState, side: Side): number {
  let g = s;
  for (let i = 0; i < 400 && (g.phase === 'play' || g.phase === 'draw'); i++)
    g = apply(g, g.toPlay, greedy(g));
  const r = g.roundScores[g.roundScores.length - 1];
  if (!r) return 0;
  return r[side] - r[1 - side];
}

/** Rebuild a full state from the AI's view, dealing unseen cards at random. */
export function determinize(
  v: ExpeditionView,
  side: Side,
  rng: () => number,
): ExpeditionState {
  const seen = new Set<number>([
    ...v.hand,
    ...v.routes[0].flat(),
    ...v.routes[1].flat(),
    ...v.discard.flat(),
  ]);
  const unseen: number[] = [];
  for (let c = 0; c < ROUTES * 12; c++) if (!seen.has(c)) unseen.push(c);
  for (let i = unseen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
  }
  const opp = (1 - side) as Side;
  const oppHand = unseen.slice(0, v.handCounts[opp]).sort((a, b) => a - b);
  const deck = unseen.slice(v.handCounts[opp]);
  const hands: [number[], number[]] =
    side === 0 ? [v.hand.slice(), oppHand] : [oppHand, v.hand.slice()];
  const { you: _y, hand: _h, handCounts: _c, deckCount: _d, ...rest } = v;
  return { ...rest, deck, hands };
}

/** Root candidates: whole turns (play/discard then draw) when in play phase. */
function candidates(s: ExpeditionState): Move[] {
  return legalMoves(s);
}

export function chooseExpeditionMove(
  v: ExpeditionView,
  side: Side,
  level: ExpeditionLevel,
  rng: () => number = Math.random,
): ExpeditionAiResult {
  const cfg = EXPEDITION_LEVELS[level];
  const base = determinize(v, side, rng);
  const legal = candidates(base);
  if (!legal.length) throw new Error('没有合法着法');
  if (cfg.samples === 0) {
    if (cfg.noise && rng() < cfg.noise) {
      const m = legal[Math.floor(rng() * legal.length)];
      return { move: m, score: 0 };
    }
    return { move: greedy(base), score: 0 };
  }
  // Prune to the most promising few by the heuristic, always keeping greedy.
  const g = greedy(base);
  let pool = legal;
  if (base.phase === 'play' && legal.length > 10) {
    const turns = Math.ceil(base.deck.length / 2);
    const scoreOf = (m: Move) => {
      const c = (m as { card: number }).card;
      const rest = base.hands[side].filter((x) => x !== c);
      const routes =
        m.t === 'play'
          ? base.routes[side].map((x, i) => (i === routeOf(c) ? [...x, c] : x))
          : base.routes[side];
      return (
        evaluate(routes, rest, turns) -
        (m.t === 'discard' ? valueOf(c) * 0.3 : 0)
      );
    };
    pool = [...legal].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 8);
    if (!pool.some((m) => JSON.stringify(m) === JSON.stringify(g)))
      pool.push(g);
  }
  const totals = pool.map(() => 0);
  let n = 0;
  const deadline = Date.now() + cfg.ms;
  for (; n < cfg.samples && (n < 6 || Date.now() < deadline); n++) {
    const world = determinize(v, side, rng);
    pool.forEach((m, i) => {
      totals[i] += rolloutRound(apply(world, side, m), side);
    });
  }
  let bi = 0;
  for (let i = 1; i < pool.length; i++) if (totals[i] > totals[bi]) bi = i;
  return { move: pool[bi], score: totals[bi] / Math.max(1, n) };
}

export { HAND };
