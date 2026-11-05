// 丝路远行（Lost Cities 机制）：五条商路，每路 2–10 九张驿站牌 + 3 张「投契」。
// 开辟一条路先付 20 的盘缠，投契把这条路的得失翻倍；走满 8 站额外 +20。
// 纯规则引擎，前后端共用。牌编号 0..59：路 = ⌊id / 12⌋，id % 12 < 3 为投契，
// 其余面值 = id % 12 − 1（2..10）。

export const ROUTES = 5;
export const HAND = 8;
export const ROUNDS_DEFAULT = 3;
export type Side = 0 | 1;
export const routeOf = (c: number) => Math.floor(c / 12);
export const valueOf = (c: number) => (c % 12 < 3 ? 0 : (c % 12) - 1);
export const isWager = (c: number) => c % 12 < 3;

export const ROUTE_INFO = [
  { name: '长安', pigment: '朱砂', glyph: '安' },
  { name: '敦煌', pigment: '藤黄', glyph: '煌' },
  { name: '天山', pigment: '石青', glyph: '山' },
  { name: '于阗', pigment: '玉绿', glyph: '阗' },
  { name: '波斯', pigment: '黛紫', glyph: '斯' },
] as const;

export type Move =
  | { t: 'play'; card: number }
  | { t: 'discard'; card: number }
  | { t: 'draw'; from: 'deck' | number };

export type ExpeditionState = {
  deck: number[];
  hands: [number[], number[]];
  routes: [number[][], number[][]];
  discard: number[][];
  toPlay: Side;
  phase: 'play' | 'draw' | 'round-end' | 'over';
  /** Route discarded to this turn; cannot be drawn back the same turn. */
  justDiscarded: number | null;
  round: number;
  rounds: number;
  /** Who opened this round (alternates). */
  opener: Side;
  totals: [number, number];
  roundScores: [number, number][];
  winner: Side | null | 'draw';
  last: { side: Side; move: Move } | null;
};

export function shuffle(rng: () => number): number[] {
  const d = Array.from({ length: ROUTES * 12 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const sortHand = (h: number[]) => h.sort((a, b) => a - b);

function deal(
  rng: () => number,
  opener: Side,
  base: Pick<ExpeditionState, 'round' | 'rounds' | 'totals' | 'roundScores'>,
): ExpeditionState {
  const deck = shuffle(rng);
  const hands: [number[], number[]] = [
    sortHand(deck.splice(0, HAND)),
    sortHand(deck.splice(0, HAND)),
  ];
  return {
    ...base,
    deck,
    hands,
    routes: [
      Array.from({ length: ROUTES }, () => []),
      Array.from({ length: ROUTES }, () => []),
    ],
    discard: Array.from({ length: ROUTES }, () => []),
    toPlay: opener,
    phase: 'play',
    justDiscarded: null,
    opener,
    winner: null,
    last: null,
  };
}

export function newGame(
  rng: () => number,
  opener: Side = 0,
  rounds = ROUNDS_DEFAULT,
): ExpeditionState {
  return deal(rng, opener, {
    round: 1,
    rounds,
    totals: [0, 0],
    roundScores: [],
  });
}

export function nextRound(
  s: ExpeditionState,
  rng: () => number,
): ExpeditionState {
  if (s.phase !== 'round-end') throw new Error('这一轮还没结束');
  return deal(rng, (1 - s.opener) as Side, {
    round: s.round + 1,
    rounds: s.rounds,
    totals: s.totals,
    roundScores: s.roundScores,
  });
}

export function routeScore(cards: readonly number[]): number {
  if (!cards.length) return 0;
  let sum = 0;
  let wagers = 0;
  for (const c of cards) {
    const v = valueOf(c);
    if (v) sum += v;
    else wagers++;
  }
  return (sum - 20) * (1 + wagers) + (cards.length >= 8 ? 20 : 0);
}
export const sideScore = (routes: readonly (readonly number[])[]) =>
  routes.reduce((a, r) => a + routeScore(r), 0);

/** Highest numbered value on a route (0 = none yet). */
export const topValue = (route: readonly number[]) =>
  route.reduce((m, c) => Math.max(m, valueOf(c)), 0);

export function canPlay(route: readonly number[], card: number): boolean {
  const top = topValue(route);
  return isWager(card) ? top === 0 : valueOf(card) > top;
}

export function legalMoves(s: ExpeditionState): Move[] {
  const side = s.toPlay;
  if (s.phase === 'play') {
    const out: Move[] = [];
    for (const c of s.hands[side]) {
      if (canPlay(s.routes[side][routeOf(c)], c))
        out.push({ t: 'play', card: c });
      out.push({ t: 'discard', card: c });
    }
    return out;
  }
  if (s.phase === 'draw') {
    const out: Move[] = [];
    if (s.deck.length) out.push({ t: 'draw', from: 'deck' });
    for (let r = 0; r < ROUTES; r++)
      if (s.discard[r].length && r !== s.justDiscarded)
        out.push({ t: 'draw', from: r });
    return out;
  }
  return [];
}

function endRound(s: ExpeditionState): ExpeditionState {
  const sc: [number, number] = [sideScore(s.routes[0]), sideScore(s.routes[1])];
  const totals: [number, number] = [s.totals[0] + sc[0], s.totals[1] + sc[1]];
  const done = s.round >= s.rounds;
  return {
    ...s,
    totals,
    roundScores: [...s.roundScores, sc],
    phase: done ? 'over' : 'round-end',
    winner: done
      ? totals[0] === totals[1]
        ? 'draw'
        : totals[0] > totals[1]
          ? 0
          : 1
      : null,
  };
}

/** Apply a move for `side`; throws on anything illegal. */
export function apply(
  s: ExpeditionState,
  side: Side,
  m: Move,
): ExpeditionState {
  if (s.phase !== 'play' && s.phase !== 'draw') throw new Error('现在不能行动');
  if (side !== s.toPlay) throw new Error('还没轮到你');
  if (!m || typeof m !== 'object') throw new Error('操作无效');
  if (s.phase === 'play') {
    if (m.t !== 'play' && m.t !== 'discard')
      throw new Error('先出一张牌或弃一张牌');
    const hand = s.hands[side];
    if (!hand.includes(m.card)) throw new Error('手里没有这张牌');
    const r = routeOf(m.card);
    const hands: [number[], number[]] = [...s.hands];
    hands[side] = hand.filter((c) => c !== m.card);
    if (m.t === 'play') {
      if (!canPlay(s.routes[side][r], m.card))
        throw new Error(
          '同一条路只能越走越远：面值必须高于已出的牌，投契只能在开路前出',
        );
      const routes: [number[][], number[][]] = [s.routes[0], s.routes[1]];
      routes[side] = routes[side].map((x, i) => (i === r ? [...x, m.card] : x));
      return {
        ...s,
        hands,
        routes,
        phase: 'draw',
        justDiscarded: null,
        last: { side, move: m },
      };
    }
    const discard = s.discard.map((x, i) => (i === r ? [...x, m.card] : x));
    return {
      ...s,
      hands,
      discard,
      phase: 'draw',
      justDiscarded: r,
      last: { side, move: m },
    };
  }
  if (m.t !== 'draw') throw new Error('请摸一张牌');
  let card: number;
  let deck = s.deck;
  let discard = s.discard;
  if (m.from === 'deck') {
    if (!deck.length) throw new Error('牌堆已空');
    card = deck[0];
    deck = deck.slice(1);
  } else {
    const r = m.from;
    if (!Number.isInteger(r) || r < 0 || r >= ROUTES)
      throw new Error('摸牌位置无效');
    if (r === s.justDiscarded) throw new Error('不能摸回刚弃掉的牌');
    if (!discard[r].length) throw new Error('这一摞是空的');
    card = discard[r][discard[r].length - 1];
    discard = discard.map((x, i) => (i === r ? x.slice(0, -1) : x));
  }
  const hands: [number[], number[]] = [...s.hands];
  hands[side] = sortHand([...s.hands[side], card]);
  const next: ExpeditionState = {
    ...s,
    deck,
    discard,
    hands,
    toPlay: (1 - side) as Side,
    phase: 'play',
    justDiscarded: null,
    last: s.last,
  };
  return deck.length === 0 ? endRound(next) : next;
}

export type ExpeditionView = Omit<ExpeditionState, 'deck' | 'hands'> & {
  you: Side | null;
  hand: number[];
  handCounts: [number, number];
  deckCount: number;
};

/** Everything one seat may see: the opponent's hand and deck order stay hidden. */
export function viewFor(s: ExpeditionState, side: Side | null): ExpeditionView {
  const { deck, hands, ...rest } = s;
  return {
    ...rest,
    you: side,
    hand: side === null ? [] : hands[side],
    handCounts: [hands[0].length, hands[1].length],
    deckCount: deck.length,
  };
}

export function parseMove(raw: unknown): Move | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  if ((m.t === 'play' || m.t === 'discard') && Number.isInteger(m.card))
    return { t: m.t, card: m.card as number };
  if (m.t === 'draw' && (m.from === 'deck' || Number.isInteger(m.from)))
    return { t: 'draw', from: m.from as 'deck' | number };
  return null;
}

export const cardName = (c: number) =>
  `${ROUTE_INFO[routeOf(c)].name}${isWager(c) ? '投契' : valueOf(c)}`;
