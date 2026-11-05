// 刺桐市集（Jaipur 机制）：两位商人在泉州港轮流进货、换货、出货。
// 六种货：明珠、金锭、银锭、丝绸、香料、茶叶；另有骆驼（驼队）。
// 纯规则引擎，前后端共用。三局两胜，每局赢下得一枚「市舶印」。

export type Good = 0 | 1 | 2 | 3 | 4 | 5;
export const CAMEL = 6;
export type Card = Good | typeof CAMEL;
export type Side = 0 | 1;
export const GOODS = [
  { name: '明珠', glyph: '珠', count: 6, tokens: [7, 7, 5, 5, 5], min: 2 },
  { name: '金锭', glyph: '金', count: 6, tokens: [6, 6, 5, 5, 5], min: 2 },
  { name: '银锭', glyph: '银', count: 6, tokens: [5, 5, 5, 5, 5], min: 2 },
  {
    name: '丝绸',
    glyph: '绸',
    count: 8,
    tokens: [5, 3, 3, 2, 2, 1, 1],
    min: 1,
  },
  {
    name: '香料',
    glyph: '香',
    count: 8,
    tokens: [5, 3, 3, 2, 2, 1, 1],
    min: 1,
  },
  {
    name: '茶叶',
    glyph: '茶',
    count: 10,
    tokens: [4, 3, 2, 1, 1, 1, 1, 1, 1],
    min: 1,
  },
] as const;
export const CAMELS = 11;
export const HAND_LIMIT = 7;
export const BONUS = {
  3: [1, 1, 2, 2, 2, 3, 3],
  4: [4, 4, 5, 5, 6, 6],
  5: [8, 8, 9, 10, 10],
} as const;
export const CAMEL_BONUS = 5;

export type Move =
  | { t: 'take'; i: number }
  | { t: 'camels' }
  | { t: 'swap'; take: number[]; give: Card[] }
  | { t: 'sell'; good: Good; n: number };

export type BazaarState = {
  deck: Card[];
  market: Card[];
  hands: [Good[], Good[]];
  camels: [number, number];
  /** Remaining goods tokens per good, top first. */
  tokens: number[][];
  bonus: { 3: number[]; 4: number[]; 5: number[] };
  /** Goods cards sold so far this round, per good (public). */
  sold: number[];
  /** Tokens won this round. */
  won: [number[], number[]];
  bonusWon: [number[], number[]];
  toPlay: Side;
  phase: 'play' | 'round-end' | 'over';
  round: number;
  seals: [number, number];
  opener: Side;
  roundResult: {
    winner: Side;
    points: [number, number];
    camelBonus: Side | null;
  } | null;
  winner: Side | null;
  last: { side: Side; move: Move } | null;
};

function shuffled<T>(a: T[], rng: () => number): T[] {
  const d = a.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const sortHand = (h: Good[]) => h.sort((a, b) => a - b);

function deal(
  rng: () => number,
  opener: Side,
  base: Pick<BazaarState, 'round' | 'seals'>,
): BazaarState {
  const cards: Card[] = [];
  GOODS.forEach((g, i) => {
    for (let k = 0; k < g.count; k++) cards.push(i as Good);
  });
  for (let k = 0; k < CAMELS - 3; k++) cards.push(CAMEL);
  const deck = shuffled(cards, rng);
  const market: Card[] = [CAMEL, CAMEL, CAMEL, deck.shift()!, deck.shift()!];
  const hands: [Good[], Good[]] = [[], []];
  const camels: [number, number] = [0, 0];
  for (const p of [0, 1] as Side[])
    for (let k = 0; k < 5; k++) {
      const c = deck.shift()!;
      if (c === CAMEL) camels[p]++;
      else hands[p].push(c);
    }
  sortHand(hands[0]);
  sortHand(hands[1]);
  return {
    ...base,
    deck,
    market,
    hands,
    camels,
    tokens: GOODS.map((g) => [...g.tokens]),
    sold: GOODS.map(() => 0),
    bonus: {
      3: shuffled([...BONUS[3]], rng),
      4: shuffled([...BONUS[4]], rng),
      5: shuffled([...BONUS[5]], rng),
    },
    won: [[], []],
    bonusWon: [[], []],
    toPlay: opener,
    phase: 'play',
    opener,
    roundResult: null,
    winner: null,
    last: null,
  };
}

export function newGame(rng: () => number, opener: Side = 0): BazaarState {
  return deal(rng, opener, { round: 1, seals: [0, 0] });
}

export function nextRound(s: BazaarState, rng: () => number): BazaarState {
  if (s.phase !== 'round-end' || !s.roundResult)
    throw new Error('这一局还没结束');
  // The loser of the previous round opens the next one.
  return deal(rng, (1 - s.roundResult.winner) as Side, {
    round: s.round + 1,
    seals: s.seals,
  });
}

const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);

function refill(s: BazaarState): {
  deck: Card[];
  market: Card[];
  short: boolean;
} {
  const deck = s.deck.slice();
  const market = s.market.slice();
  while (market.length < 5 && deck.length) market.push(deck.shift()!);
  return { deck, market, short: market.length < 5 };
}

function endRound(s: BazaarState): BazaarState {
  const pts: [number, number] = [
    sum(s.won[0]) + sum(s.bonusWon[0]),
    sum(s.won[1]) + sum(s.bonusWon[1]),
  ];
  const camelBonus: Side | null =
    s.camels[0] === s.camels[1] ? null : s.camels[0] > s.camels[1] ? 0 : 1;
  if (camelBonus !== null) pts[camelBonus] += CAMEL_BONUS;
  let winner: Side;
  if (pts[0] !== pts[1]) winner = pts[0] > pts[1] ? 0 : 1;
  else if (s.bonusWon[0].length !== s.bonusWon[1].length)
    winner = s.bonusWon[0].length > s.bonusWon[1].length ? 0 : 1;
  else if (s.won[0].length !== s.won[1].length)
    winner = s.won[0].length > s.won[1].length ? 0 : 1;
  else winner = (1 - s.toPlay) as Side; // whoever moved last
  const seals: [number, number] = [...s.seals];
  seals[winner]++;
  const over = seals[winner] >= 2;
  return {
    ...s,
    seals,
    phase: over ? 'over' : 'round-end',
    roundResult: { winner, points: pts, camelBonus },
    winner: over ? winner : null,
  };
}

function checkEnd(s: BazaarState, short: boolean): BazaarState {
  const empty = s.tokens.filter((t) => t.length === 0).length;
  return short || empty >= 3 ? endRound(s) : s;
}

/** Validate and apply; throws with a Chinese message when illegal. */
export function apply(s: BazaarState, side: Side, m: Move): BazaarState {
  if (s.phase !== 'play') throw new Error('现在不能行动');
  if (side !== s.toPlay) throw new Error('还没轮到你');
  if (!m || typeof m !== 'object') throw new Error('操作无效');
  const hand = s.hands[side];
  const next = { ...s, toPlay: (1 - side) as Side, last: { side, move: m } };
  const setHand = (h: Good[]) => {
    const hands: [Good[], Good[]] = [...s.hands];
    hands[side] = sortHand(h);
    return hands;
  };
  if (m.t === 'take') {
    const c = s.market[m.i];
    if (!Number.isInteger(m.i) || c === undefined)
      throw new Error('市集里没有这张');
    if (c === CAMEL) throw new Error('骆驼要整群牵走');
    if (hand.length >= HAND_LIMIT) throw new Error('手里最多 7 件货');
    const r = refill({ ...s, market: s.market.filter((_, i) => i !== m.i) });
    return checkEnd(
      { ...next, hands: setHand([...hand, c]), market: r.market, deck: r.deck },
      r.short,
    );
  }
  if (m.t === 'camels') {
    const n = s.market.filter((c) => c === CAMEL).length;
    if (!n) throw new Error('市集里没有骆驼');
    const camels: [number, number] = [...s.camels];
    camels[side] += n;
    const r = refill({ ...s, market: s.market.filter((c) => c !== CAMEL) });
    return checkEnd(
      { ...next, camels, market: r.market, deck: r.deck },
      r.short,
    );
  }
  if (m.t === 'swap') {
    if (!Array.isArray(m.take) || !Array.isArray(m.give))
      throw new Error('换货无效');
    const take = [...new Set(m.take)];
    if (take.length !== m.take.length || take.length < 2)
      throw new Error('换货至少换 2 件');
    if (m.give.length !== take.length) throw new Error('换入换出的件数要相等');
    const got: Good[] = [];
    for (const i of take) {
      const c = s.market[i];
      if (!Number.isInteger(i) || c === undefined)
        throw new Error('市集里没有这张');
      if (c === CAMEL) throw new Error('换货不能换走骆驼');
      got.push(c);
    }
    const h = hand.slice();
    let camelsOut = 0;
    for (const c of m.give) {
      if (c === CAMEL) {
        camelsOut++;
        continue;
      }
      const k = h.indexOf(c as Good);
      if (k < 0) throw new Error('手里没有要换出的货');
      h.splice(k, 1);
    }
    if (camelsOut > s.camels[side]) throw new Error('驼队里骆驼不够');
    if (m.give.some((c) => got.includes(c as Good)))
      throw new Error('不能换入换出同一种货');
    const newHand = [...h, ...got];
    if (newHand.length > HAND_LIMIT) throw new Error('手里最多 7 件货');
    const market = s.market.filter((_, i) => !take.includes(i));
    market.push(...m.give);
    const camels: [number, number] = [...s.camels];
    camels[side] -= camelsOut;
    return { ...next, hands: setHand(newHand), market, camels };
  }
  if (m.t === 'sell') {
    const g = m.good;
    if (!Number.isInteger(g) || g < 0 || g > 5) throw new Error('货物无效');
    const have = hand.filter((c) => c === g).length;
    if (!Number.isInteger(m.n) || m.n < 1 || m.n > have)
      throw new Error('手里没有这么多');
    if (m.n < GOODS[g].min) throw new Error(`${GOODS[g].name}至少一次卖 2 件`);
    const tokens = s.tokens.map((t) => t.slice());
    const got = tokens[g].splice(0, m.n);
    const won: [number[], number[]] = [s.won[0], s.won[1]];
    won[side] = [...won[side], ...got];
    const bonus = { 3: s.bonus[3], 4: s.bonus[4], 5: s.bonus[5] };
    const bonusWon: [number[], number[]] = [s.bonusWon[0], s.bonusWon[1]];
    const tier = (m.n >= 5 ? 5 : m.n) as 3 | 4 | 5;
    if (m.n >= 3 && bonus[tier].length) {
      bonusWon[side] = [...bonusWon[side], bonus[tier][0]];
      bonus[tier] = bonus[tier].slice(1);
    }
    const soldN = s.sold.slice();
    soldN[g] += m.n;
    let left = m.n;
    const h = hand.filter((c) => c !== g || left-- <= 0);
    return checkEnd(
      { ...next, hands: setHand(h), tokens, sold: soldN, won, bonus, bonusWon },
      false,
    );
  }
  throw new Error('操作无效');
}

/** Enumerate legal moves; swaps give the cheapest cards (AI use). */
export function legalMoves(s: BazaarState, full = false): Move[] {
  if (s.phase !== 'play') return [];
  const side = s.toPlay;
  const hand = s.hands[side];
  const out: Move[] = [];
  if (s.market.includes(CAMEL)) out.push({ t: 'camels' });
  if (hand.length < HAND_LIMIT) {
    const seen = new Set<Card>();
    s.market.forEach((c, i) => {
      if (c !== CAMEL && !seen.has(c)) {
        seen.add(c);
        out.push({ t: 'take', i });
      }
    });
  }
  for (let g = 0 as Good; g < 6; g++) {
    const have = hand.filter((c) => c === g).length;
    for (let n = GOODS[g].min; n <= have; n++)
      if (full || n === have || n >= 3)
        out.push({ t: 'sell', good: g as Good, n });
  }
  // Swaps: subsets of market goods (size ≥ 2), paid with camels first then cheapest hand cards.
  const idx = s.market
    .map((c, i) => (c === CAMEL ? -1 : i))
    .filter((i) => i >= 0);
  for (let mask = 1; mask < 1 << idx.length; mask++) {
    const take = idx.filter((_, k) => mask & (1 << k));
    if (take.length < 2) continue;
    const types = new Set(take.map((i) => s.market[i]));
    const pool: Card[] = [
      ...Array.from({ length: s.camels[side] }, () => CAMEL as Card),
      ...hand.filter((c) => !types.has(c)).sort((a, b) => b - a),
    ];
    for (
      let camels = Math.min(s.camels[side], take.length);
      camels >= 0;
      camels--
    ) {
      const goods = pool
        .filter((c) => c !== CAMEL)
        .slice(0, take.length - camels);
      if (goods.length + camels !== take.length) continue;
      const give: Card[] = [
        ...Array.from({ length: camels }, () => CAMEL as Card),
        ...goods,
      ];
      if (hand.length - goods.length + take.length > HAND_LIMIT) continue;
      out.push({ t: 'swap', take, give });
      if (!full) break;
    }
  }
  return out;
}

export type BazaarView = Omit<
  BazaarState,
  'deck' | 'hands' | 'bonus' | 'bonusWon'
> & {
  you: Side | null;
  hand: Good[];
  handCounts: [number, number];
  deckCount: number;
  bonusLeft: { 3: number; 4: number; 5: number };
  /** Your own bonus tokens; the opponent's are face down until the round ends. */
  bonusWon: [number[] | number, number[] | number];
};

export function viewFor(s: BazaarState, side: Side | null): BazaarView {
  const { deck, hands, bonus, bonusWon, ...rest } = s;
  const reveal = s.phase !== 'play';
  return {
    ...rest,
    you: side,
    hand: side === null ? [] : hands[side],
    handCounts: [hands[0].length, hands[1].length],
    deckCount: deck.length,
    bonusLeft: { 3: bonus[3].length, 4: bonus[4].length, 5: bonus[5].length },
    bonusWon: [
      reveal || side === 0 ? bonusWon[0] : bonusWon[0].length,
      reveal || side === 1 ? bonusWon[1] : bonusWon[1].length,
    ],
  };
}

export function parseMove(raw: unknown): Move | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  const ints = (a: unknown, max: number) =>
    Array.isArray(a) && a.length <= max && a.every((x) => Number.isInteger(x));
  if (m.t === 'take' && Number.isInteger(m.i))
    return { t: 'take', i: m.i as number };
  if (m.t === 'camels') return { t: 'camels' };
  if (m.t === 'sell' && Number.isInteger(m.good) && Number.isInteger(m.n))
    return { t: 'sell', good: m.good as Good, n: m.n as number };
  if (m.t === 'swap' && ints(m.take, 5) && ints(m.give, 5))
    return { t: 'swap', take: m.take as number[], give: m.give as Card[] };
  return null;
}

export const cardLabel = (c: Card) => (c === CAMEL ? '骆驼' : GOODS[c].name);
