// 刺桐市集 AI：估值 = 已得分 + 手牌变现潜力 + 骆驼优势 − 留给对手的好货；
// 高档把看不见的牌（对手手牌、牌堆）随机重发若干次，考虑对手的最佳回应（PIMC）。
import {
  CAMEL,
  CAMELS,
  GOODS,
  apply,
  legalMoves,
  type BazaarState,
  type BazaarView,
  type Card,
  type Good,
  type Move,
  type Side,
} from './bazaar.ts';

export type BazaarLevel = 1 | 2 | 3 | 4 | 5;
export const BAZAAR_LEVELS: Record<
  BazaarLevel,
  { name: string; note: string; samples: number; reply: boolean; noise: number }
> = {
  1: {
    name: '摊贩',
    note: '看到什么拿什么',
    samples: 1,
    reply: false,
    noise: 0.5,
  },
  2: { name: '牙人', note: '会算眼前账', samples: 1, reply: false, noise: 0 },
  3: { name: '行商', note: '防对手一手', samples: 6, reply: true, noise: 0 },
  4: {
    name: '坐贾',
    note: '推演 16 种牌局',
    samples: 16,
    reply: true,
    noise: 0,
  },
  5: {
    name: '海商',
    note: '推演 40 种牌局',
    samples: 40,
    reply: true,
    noise: 0,
  },
};
export type BazaarAiResult = { move: Move; score: number };

const AVG_BONUS = { 3: 2, 4: 5, 5: 9 } as const;
const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);

function potential(s: BazaarState, hand: readonly Good[]): number {
  let v = 0;
  for (let g = 0; g < 6; g++) {
    const n = hand.filter((c) => c === g).length;
    if (!n) continue;
    const t = s.tokens[g];
    const sellable = Math.min(n, t.length);
    const value = sum(t.slice(0, sellable));
    const bonus = n >= 5 ? AVG_BONUS[5] : n >= 3 ? AVG_BONUS[n as 3 | 4] : 0;
    const ok = n >= GOODS[g].min ? 1 : 0.55;
    v += (value + bonus) * 0.62 * ok;
  }
  // A full hand is clumsy.
  if (hand.length >= 7) v -= 3;
  return v;
}

export function evaluate(s: BazaarState, side: Side): number {
  const o = (1 - side) as Side;
  if (s.phase !== 'play' && s.roundResult) {
    const p = s.roundResult.points;
    return (s.roundResult.winner === side ? 30 : -30) + (p[side] - p[o]);
  }
  const pts = (p: Side) => sum(s.won[p]) + sum(s.bonusWon[p]);
  const camelEdge = Math.max(
    -5,
    Math.min(5, (s.camels[side] - s.camels[o]) * 1.6),
  );
  return (
    pts(side) -
    pts(o) +
    potential(s, s.hands[side]) -
    potential(s, s.hands[o]) +
    camelEdge +
    // Camels are also swap currency.
    Math.min(s.camels[side], 4) * 0.5 -
    Math.min(s.camels[o], 4) * 0.5
  );
}

/** Rebuild a full state from a view, dealing unseen cards at random. */
export function determinize(
  v: BazaarView,
  side: Side,
  rng: () => number,
): BazaarState {
  const pool: Card[] = [];
  GOODS.forEach((g, i) => {
    for (let k = 0; k < g.count; k++) pool.push(i as Good);
  });
  for (let k = 0; k < CAMELS; k++) pool.push(CAMEL);
  const remove = (c: Card) => {
    const k = pool.indexOf(c);
    if (k >= 0) pool.splice(k, 1);
  };
  v.hand.forEach(remove);
  v.market.forEach(remove);
  for (let k = 0; k < v.camels[0] + v.camels[1]; k++) remove(CAMEL);
  // Goods already sold: one card per goods token taken.
  v.sold.forEach((n, i) => {
    for (let k = 0; k < n; k++) remove(i as Good);
  });
  // Swapped-out goods are in the market, already removed. Shuffle the rest.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const o = (1 - side) as Side;
  // Opponent hand must be goods only.
  const oppHand: Good[] = [];
  const rest: Card[] = [];
  for (const c of pool) {
    if (c !== CAMEL && oppHand.length < v.handCounts[o]) oppHand.push(c);
    else rest.push(c);
  }
  const deck = rest.slice(0, v.deckCount);
  while (deck.length < v.deckCount) deck.push(CAMEL);
  const hands: [Good[], Good[]] =
    side === 0 ? [v.hand.slice(), oppHand] : [oppHand, v.hand.slice()];
  const bw = (x: number[] | number) =>
    Array.isArray(x) ? x : Array.from({ length: x }, () => 3);
  const {
    you: _y,
    hand: _h,
    handCounts: _hc,
    deckCount: _d,
    bonusLeft,
    bonusWon,
    ...rest2
  } = v;
  return {
    ...rest2,
    deck,
    hands,
    bonus: {
      3: Array.from({ length: bonusLeft[3] }, () => AVG_BONUS[3]),
      4: Array.from({ length: bonusLeft[4] }, () => AVG_BONUS[4]),
      5: Array.from({ length: bonusLeft[5] }, () => AVG_BONUS[5]),
    },
    bonusWon: [bw(bonusWon[0]), bw(bonusWon[1])],
  };
}

function bestReply(s: BazaarState, side: Side): number {
  // Opponent's best greedy reply, scored from `side`'s view.
  if (s.phase !== 'play') return evaluate(s, side);
  let worst = Infinity;
  for (const m of legalMoves(s)) {
    const v = evaluate(apply(s, s.toPlay, m), side);
    if (v < worst) worst = v;
  }
  return worst === Infinity ? evaluate(s, side) : worst;
}

export function chooseBazaarMove(
  v: BazaarView,
  side: Side,
  level: BazaarLevel,
  rng: () => number = Math.random,
): BazaarAiResult {
  const cfg = BAZAAR_LEVELS[level];
  const base = determinize(v, side, rng);
  const moves = legalMoves(base);
  if (!moves.length) throw new Error('没有合法着法');
  if (cfg.noise && rng() < cfg.noise)
    return { move: moves[Math.floor(rng() * moves.length)], score: 0 };
  const totals = moves.map(() => 0);
  for (let n = 0; n < cfg.samples; n++) {
    const world = n === 0 ? base : determinize(v, side, rng);
    moves.forEach((m, i) => {
      const after = apply(world, side, m);
      totals[i] += cfg.reply ? bestReply(after, side) : evaluate(after, side);
    });
  }
  let bi = 0;
  for (let i = 1; i < moves.length; i++) if (totals[i] > totals[bi]) bi = i;
  return { move: moves[bi], score: totals[bi] / cfg.samples };
}
