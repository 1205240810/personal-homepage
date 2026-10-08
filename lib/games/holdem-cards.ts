/** A standard deck: rank = floor(card / 4) + 2, suit = card % 4. */
export type Card = number;

export interface HandRank {
  value: number;
  category: number;
  label: string;
  kickers: number[];
}

export interface EquityEstimate {
  /** Expected fraction of the pot, including each seat's share when tied. */
  equity: number;
  /** Fraction of samples won outright. */
  win: number;
  /** Fraction of samples tied. */
  tie: number;
  samples: number;
  standardError?: number;
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

export type WeightedCombo = { cards: [number, number]; weight: number };
export type OpponentRange = { seat: number; combos: readonly WeightedCombo[] };
export type EquityWorld = {
  /** Hero first, then opponents in the supplied order; no real hidden cards. */
  holes: number[][];
  ranks: number[];
  responseRolls: number[];
};

/** Joint, card-removal-aware sampling of independent weighted ranges. Conflicting
 * combinations are rejected together, rather than silently becoming legal. */
export function sampleRangeWorlds(
  hole: readonly number[],
  board: readonly number[],
  opponents: readonly OpponentRange[],
  samples = 600,
  random: () => number = Math.random,
): EquityWorld[] {
  if (hole.length !== 2 || board.length > 5 || opponents.length > 4)
    throw new RangeError('权益模型需要两张底牌、至多五张公共牌及四个对手。');
  if (!Number.isSafeInteger(samples) || samples < 1)
    throw new RangeError('抽样次数必须是正整数。');
  requireUnique([...hole, ...board]);
  const known = new Set([...hole, ...board]);
  const roll = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new RangeError('随机函数必须返回 [0, 1) 内的数。');
    return value;
  };
  const ranges = opponents.map((opponent) => {
    let total = 0;
    const entries = opponent.combos.flatMap((combo) => {
      requireUnique(combo.cards);
      if (!Number.isFinite(combo.weight) || combo.weight < 0)
        throw new RangeError('范围权重必须为非负有限数。');
      if (!combo.weight || combo.cards.some((card) => known.has(card)))
        return [];
      total += combo.weight;
      return [{ cards: combo.cards, cumulative: total }];
    });
    if (!total) throw new RangeError('对手范围没有合法组合。');
    return { entries, total };
  });
  const pick = (range: (typeof ranges)[number]) => {
    const value = roll() * range.total;
    let low = 0;
    let high = range.entries.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (range.entries[middle].cumulative > value) high = middle;
      else low = middle + 1;
    }
    return range.entries[low].cards;
  };
  const worlds: EquityWorld[] = [];
  for (let sample = 0; sample < samples; sample++) {
    let chosen: number[][] | null = null;
    for (let retry = 0; retry < 4096; retry++) {
      const candidates = ranges.map((range) => [...pick(range)]);
      const all = candidates.flat();
      if (new Set(all).size === all.length) {
        chosen = candidates;
        break;
      }
    }
    if (!chosen) throw new RangeError('对手范围无法共同发出合法底牌。');
    const removed = new Set([...known, ...chosen.flat()]);
    const remaining = Array.from({ length: 52 }, (_, card) => card).filter(
      (card) => !removed.has(card),
    );
    const needed = 5 - board.length;
    for (let i = 0; i < needed; i++) {
      const next = i + Math.floor(roll() * (remaining.length - i));
      [remaining[i], remaining[next]] = [remaining[next], remaining[i]];
    }
    const fullBoard = [...board, ...remaining.slice(0, needed)];
    const holes = [[...hole], ...chosen];
    worlds.push({
      holes,
      ranks: holes.map(
        (cards) => rankKnownCards([...cards, ...fullBoard]).value,
      ),
      responseRolls: opponents.map(() => roll()),
    });
  }
  return worlds;
}

export function equityFromWorlds(
  worlds: readonly EquityWorld[],
): EquityEstimate {
  if (!worlds.length) throw new RangeError('权益样本不能为空。');
  let share = 0;
  let square = 0;
  let wins = 0;
  let ties = 0;
  for (const world of worlds) {
    const highest = Math.max(...world.ranks);
    const winners = world.ranks.filter((rank) => rank === highest).length;
    const value = world.ranks[0] === highest ? 1 / winners : 0;
    share += value;
    square += value * value;
    if (value === 1) wins++;
    else if (value > 0) ties++;
  }
  const equity = share / worlds.length;
  return {
    equity,
    win: wins / worlds.length,
    tie: ties / worlds.length,
    samples: worlds.length,
    standardError: Math.sqrt(
      Math.max(0, square / worlds.length - equity * equity) / worlds.length,
    ),
  };
}
