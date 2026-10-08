/** A standard deck: rank = floor(card / 4) + 2, suit = card % 4. */
export type Card = number;

export interface HandRank {
  value: number;
  category: number;
  label: string;
  kickers: number[];
}

export interface EquityEstimate {
  /** Expected fraction of the pot, including half of a tied heads-up pot. */
  equity: number;
  /** Fraction of samples won outright. */
  win: number;
  /** Fraction of samples tied. */
  tie: number;
  samples: number;
}

export const CARD_SUITS = ['♠', '♥', '♣', '♦'] as const;
const RANK_LABELS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
const HAND_LABELS = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
];

function requireCard(card: number): void {
  if (!Number.isInteger(card) || card < 0 || card >= 52) {
    throw new RangeError('扑克牌必须是 0–51 之间的整数。');
  }
}

function requireUnique(cards: readonly number[]): void {
  const seen = new Set<number>();
  for (const card of cards) {
    requireCard(card);
    if (seen.has(card)) throw new RangeError('同一张扑克牌不能重复出现。');
    seen.add(card);
  }
}

export function cardRank(card: number): number {
  requireCard(card);
  return Math.floor(card / 4) + 2;
}

/** Suits 0–3 are spades, hearts, clubs, diamonds. Suits never break ties. */
export function cardSuit(card: number): number {
  requireCard(card);
  return card % 4;
}

export function cardLabel(card: number): string {
  requireCard(card);
  return `${RANK_LABELS[Math.floor(card / 4)]}${CARD_SUITS[card % 4]}`;
}

function result(category: number, kickers: number[]): HandRank {
  // The category is the most significant digit; missing kicker slots are zero.
  let value = category;
  for (let i = 0; i < 5; i++) value = value * 15 + (kickers[i] ?? 0);
  return { value, category, label: HAND_LABELS[category], kickers };
}

function straightHigh(ranks: readonly number[]): number {
  const present = new Set(ranks);
  if (present.has(14)) present.add(1);
  for (let high = 14; high >= 5; high--) {
    let complete = true;
    for (let offset = 0; offset < 5; offset++) {
      if (!present.has(high - offset)) {
        complete = false;
        break;
      }
    }
    if (complete) return high;
  }
  return 0;
}

/** Input is already validated by rankHand or the sampler. */
function rankKnownCards(cards: readonly number[]): HandRank {
  const counts = Array.from({ length: 15 }, () => 0);
  const suits: number[][] = [[], [], [], []];
  for (const card of cards) {
    const rank = Math.floor(card / 4) + 2;
    counts[rank]++;
    suits[card % 4].push(rank);
  }
  const ranks: number[] = [];
  const pairs: number[] = [];
  const trips: number[] = [];
  let quad = 0;
  for (let rank = 14; rank >= 2; rank--) {
    if (counts[rank]) ranks.push(rank);
    if (counts[rank] >= 2) pairs.push(rank);
    if (counts[rank] >= 3) trips.push(rank);
    if (counts[rank] === 4) quad = rank;
  }
  const flush = suits.find((suit) => suit.length >= 5);
  if (flush) {
    const high = straightHigh(flush);
    if (high) return result(8, [high]);
  }
  if (quad) return result(7, [quad, ranks.find((rank) => rank !== quad)!]);
  if (trips.length) {
    const pair = pairs.find((rank) => rank !== trips[0]);
    if (pair) return result(6, [trips[0], pair]);
  }
  if (flush) return result(5, flush.sort((a, b) => b - a).slice(0, 5));
  const high = straightHigh(ranks);
  if (high) return result(4, [high]);
  if (trips.length)
    return result(3, [
      trips[0],
      ...ranks.filter((rank) => rank !== trips[0]).slice(0, 2),
    ]);
  if (pairs.length >= 2)
    return result(2, [
      pairs[0],
      pairs[1],
      ranks.find((rank) => rank !== pairs[0] && rank !== pairs[1])!,
    ]);
  if (pairs.length)
    return result(1, [
      pairs[0],
      ...ranks.filter((rank) => rank !== pairs[0]).slice(0, 3),
    ]);
  return result(0, ranks.slice(0, 5));
}

/** Compare value: greater means stronger; equal values split the pot. */
export function rankHand(cards: readonly number[]): HandRank {
  if (cards.length < 5 || cards.length > 7) {
    throw new RangeError('手牌评估需要 5–7 张牌。');
  }
  requireUnique(cards);
  return rankKnownCards(cards);
}

/**
 * Showdown equity against a uniformly random legal unknown opponent hand.
 * This is a Monte Carlo estimate, not a range-aware strategy or GTO solver.
 * Draws are without replacement; only own cards and current board are known.
 */
export function estimateEquity(
  hole: readonly number[],
  board: readonly number[],
  samples = 240,
  random: () => number = Math.random,
): EquityEstimate {
  if (hole.length !== 2 || board.length > 5) {
    throw new RangeError('胜率估算需要两张底牌和不超过五张公共牌。');
  }
  if (!Number.isSafeInteger(samples) || samples <= 0) {
    throw new RangeError('抽样次数必须是正整数。');
  }
  requireUnique([...hole, ...board]);
  const known = new Set([...hole, ...board]);
  const remaining = Array.from({ length: 52 }, (_, card) => card).filter(
    (card) => !known.has(card),
  );
  const draws = 2 + 5 - board.length;
  let wins = 0;
  let ties = 0;
  for (let sample = 0; sample < samples; sample++) {
    const deck = [...remaining];
    for (let i = 0; i < draws; i++) {
      const roll = random();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
        throw new RangeError('随机函数必须返回 [0, 1) 内的数。');
      }
      const next = i + Math.floor(roll * (deck.length - i));
      [deck[i], deck[next]] = [deck[next], deck[i]];
    }
    const fullBoard = [...board, ...deck.slice(2, draws)];
    const hero = rankKnownCards([...hole, ...fullBoard]).value;
    const villain = rankKnownCards([deck[0], deck[1], ...fullBoard]).value;
    if (hero > villain) wins++;
    else if (hero === villain) ties++;
  }
  return {
    equity: (wins + ties / 2) / samples,
    win: wins / samples,
    tie: ties / samples,
    samples,
  };
}
