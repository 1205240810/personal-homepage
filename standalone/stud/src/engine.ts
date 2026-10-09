export type Card = number;
export type Seat = 0 | 1;
export type Phase = 'ready' | 'betting' | 'dealing' | 'runout' | 'complete';
export type Action =
  | { type: 'check' | 'call' | 'fold' }
  | { type: 'raise'; to: number };
export interface ReviewAdvice {
  recommended: string;
  rationale: string[];
  alternatives: { label: string; reason: string; ev: number; paid: number }[];
  nextStep: string;
  model: string;
  call: number;
  potAfterCall: number;
  actualEV: number;
  recommendedEV: number;
  estimatedLoss: number;
  samples: number;
  rangeNote: string;
  warnings: string[];
  snapshot: {
    own: Card[];
    exposed: Card[];
    pot: number;
    stack: number;
    opponentStack: number;
  };
}
export interface Review {
  seat: Seat;
  street: number;
  action: string;
  equity: number;
  odds: number;
  reason: string;
  advice?: ReviewAdvice;
}
/** Only actually public observations; never store strategy diagnostics here. */
export interface PublicAction {
  seat: Seat;
  street: number;
  action: Action;
  paid: number;
  potBefore: number;
  call: number;
  exposed: [Card[], Card[]];
}
export interface ObservedAction {
  actor: 'self' | 'opponent';
  street: number;
  action: Action;
  paid: number;
  potBefore: number;
  call: number;
  ownExposed: Card[];
  opponentExposed: Card[];
}
export interface Game {
  revision: number;
  hand: number;
  dealer: Seat;
  stacks: [number, number];
  startStacks: [number, number];
  cards: [Card[], Card[]];
  deck: Card[];
  pot: number;
  paid: [number, number];
  acted: [boolean, boolean];
  minRaise: number;
  turn: Seat;
  phase: Phase;
  street: number;
  message: string;
  winner: Seat | 'tie' | null;
  revealed: boolean;
  logs: string[];
  reviews: Review[];
  lastPot: number;
  history?: PublicAction[];
}
export const SUITS = ['♣', '♦', '♥', '♠'];
export const rank = (c: Card) => (c % 13) + 2;
export const suit = (c: Card) => Math.floor(c / 13);
export const face = (c: Card) =>
  ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[rank(c)] ?? String(rank(c));
export const cardLabel = (c: Card) => SUITS[suit(c)] + face(c);
export const names = [
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
export function compare(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
export function evaluate(cards: Card[], visible = false): number[] {
  const rs = cards.map(rank).sort((a, b) => b - a),
    counts = new Map<number, number>();
  rs.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const full = cards.length === 5 && !visible,
    flush = full && cards.every((c) => suit(c) === suit(cards[0]));
  const uniq = [...new Set(rs)];
  const straight =
    full && uniq.length === 5
      ? uniq[0] - uniq[4] === 4
        ? uniq[0]
        : uniq.join(',') === '14,5,4,3,2'
          ? 5
          : 0
      : 0;
  if (flush && straight) return [8, straight];
  if (groups[0]?.[1] === 4)
    return [7, groups[0][0], ...groups.slice(1).map((x) => x[0])];
  if (full && groups[0][1] === 3 && groups[1][1] === 2)
    return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...rs];
  if (straight) return [4, straight];
  if (groups[0]?.[1] === 3)
    return [3, groups[0][0], ...groups.slice(1).map((x) => x[0])];
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2)
    return [
      2,
      ...groups.filter((x) => x[1] === 2).map((x) => x[0]),
      ...groups.filter((x) => x[1] === 1).map((x) => x[0]),
    ];
  if (groups[0]?.[1] === 2)
    return [1, groups[0][0], ...groups.slice(1).map((x) => x[0])];
  return [0, ...rs];
}
export function random() {
  if (globalThis.crypto?.getRandomValues) {
    const x = new Uint32Array(1);
    globalThis.crypto.getRandomValues(x);
    return x[0] / 4294967296;
  }
  return Math.random();
}
export function shuffle(rng: () => number = random): Card[] {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
export function initial(stacks: [number, number] = [500, 500], hand = 0): Game {
  return {
    revision: 0,
    hand,
    dealer: (hand % 2) as Seat,
    stacks,
    startStacks: [...stacks],
    cards: [[], []],
    deck: [],
    pot: 0,
    paid: [0, 0],
    acted: [false, false],
    minRaise: 10,
    turn: 0,
    phase: 'ready',
    street: 0,
    message: '落座，开启十手牌的较量。',
    winner: null,
    revealed: false,
    logs: [],
    reviews: [],
    lastPot: 0,
    history: [],
  };
}
export const finished = (g: Game) =>
  g.hand >= 10 || g.stacks.some((n) => n === 0);
export function limits(g: Game, seat: Seat = g.turn) {
  const other = (1 - seat) as Seat;
  const current = Math.max(...g.paid);
  return {
    call: Math.max(0, current - g.paid[seat]),
    current,
    max: Math.min(
      g.paid[seat] + g.stacks[seat],
      g.paid[other] + g.stacks[other],
    ),
    min: current + g.minRaise,
  };
}
function first(g: Game): Seat {
  const c = compare(
    evaluate(g.cards[0].slice(1), true),
    evaluate(g.cards[1].slice(1), true),
  );
  return c > 0 ? 0 : c < 0 ? 1 : g.dealer;
}
function draw(g: Game) {
  g.cards[0].push(g.deck.pop()!);
  g.cards[1].push(g.deck.pop()!);
}
function openStreet(g: Game) {
  g.street = g.cards[0].length - 1;
  g.paid = [0, 0];
  g.acted = [false, false];
  g.minRaise = 10;
  g.turn = first(g);
  g.phase = 'betting';
  g.message = `第 ${g.street} 轮 · ${g.turn === 0 ? '你' : '对手'}的明牌领先，先行动`;
}
export function startHand(state: Game, rng: () => number = random): Game {
  if (!['ready', 'complete'].includes(state.phase) || finished(state))
    return state;
  const g = initial([...state.stacks], state.hand + 1);
  g.revision = state.revision + 1;
  g.dealer = (state.hand % 2) as Seat;
  g.startStacks = [...state.stacks];
  g.deck = shuffle(rng);
  const ante = Math.min(5, ...g.stacks);
  g.stacks = g.stacks.map((x) => x - ante) as [number, number];
  g.pot = ante * 2;
  draw(g);
  draw(g);
  g.logs = [`第 ${g.hand} 手 · 双方底注 ${ante}`];
  openStreet(g);
  if (g.stacks.some((x) => x === 0)) g.phase = 'runout';
  return g;
}
function payout(g: Game, winner: Seat | 'tie', reveal: boolean) {
  g.lastPot = g.pot;
  g.winner = winner;
  g.revealed = reveal;
  g.phase = 'complete';
  if (winner === 'tie') {
    const half = Math.floor(g.pot / 2);
    g.stacks[0] += half;
    g.stacks[1] += half;
    g.stacks[g.dealer] += g.pot % 2;
    g.message = `平分底池 ${g.pot}`;
  } else {
    g.stacks[winner] += g.pot;
    g.message = `${winner === 0 ? '你赢得' : '对手赢得'}底池 ${g.pot}`;
  }
  g.pot = 0;
  g.paid = [0, 0];
  g.logs.push(g.message);
}
function showdown(g: Game) {
  const c = compare(evaluate(g.cards[0]), evaluate(g.cards[1]));
  payout(g, c > 0 ? 0 : c < 0 ? 1 : 'tie', true);
}
export function advance(state: Game, revision: number): Game {
  if (
    state.revision !== revision ||
    !['dealing', 'runout'].includes(state.phase)
  )
    return state;
  const g = structuredClone(state);
  g.revision++;
  if (g.cards[0].length < 5) draw(g);
  if (state.phase === 'runout') {
    g.street = g.cards[0].length - 1;
    g.message = '有效筹码已全下 · 逐张发完明牌';
    if (g.cards[0].length === 5) showdown(g);
  } else openStreet(g);
  return g;
}
export function actionLabel(a: Action, call = 0) {
  return a.type === 'raise'
    ? `下注至 ${a.to}`
    : a.type === 'call'
      ? `跟注 ${call}`
      : a.type === 'fold'
        ? '弃牌'
        : '过牌';
}
export function act(
  state: Game,
  seat: Seat,
  a: Action,
  revision = state.revision,
  review?: Review,
): Game {
  if (
    state.phase !== 'betting' ||
    state.turn !== seat ||
    state.revision !== revision
  )
    return state;
  if (!a || !['check', 'call', 'fold', 'raise'].includes(a.type)) return state;
  const l = limits(state, seat);
  if ((a.type === 'check' && l.call > 0) || (a.type === 'call' && l.call === 0))
    return state;
  if (
    a.type === 'raise' &&
    (!Number.isInteger(a.to) ||
      a.to <= l.current ||
      a.to > l.max ||
      (a.to < l.min && a.to !== l.max))
  )
    return state;
  const g = structuredClone(state);
  g.revision++;
  const other = (1 - seat) as Seat;
  g.logs.push(`${seat === 0 ? '你' : '对手'} · ${actionLabel(a, l.call)}`);
  if (review) g.reviews.push(structuredClone(review));
  (g.history ??= []).push({
    seat,
    street: state.street,
    action: { ...a },
    paid:
      a.type === 'raise'
        ? a.to - state.paid[seat]
        : a.type === 'call'
          ? l.call
          : 0,
    potBefore: state.pot,
    call: l.call,
    exposed: [state.cards[0].slice(1), state.cards[1].slice(1)],
  });
  if (a.type === 'fold') {
    payout(g, other, false);
    return g;
  }
  if (a.type === 'raise') {
    const amount = a.to - g.paid[seat];
    g.stacks[seat] -= amount;
    g.pot += amount;
    g.paid[seat] = a.to;
    g.minRaise = Math.max(g.minRaise, a.to - l.current);
    g.acted = [false, false];
  }
  if (a.type === 'call') {
    g.stacks[seat] -= l.call;
    g.pot += l.call;
    g.paid[seat] += l.call;
  }
  g.acted[seat] = true;
  g.turn = other;
  if (g.acted.every(Boolean) && g.paid[0] === g.paid[1]) {
    if (g.cards[0].length === 5) showdown(g);
    else {
      g.phase = g.stacks.some((x) => x === 0) ? 'runout' : 'dealing';
      g.message =
        g.phase === 'runout'
          ? '有效筹码已全下 · 发完剩余明牌'
          : '本轮下注结束 · 发下一张明牌';
    }
  } else
    g.message = `${other === 0 ? '轮到你' : '对手思考中'} · ${limits(g).call > 0 ? `需跟注 ${limits(g).call}` : '可过牌或下注'}`;
  return g;
}
// Public projection is the ONLY AI boundary: no opponent hole card or real deck order.
export interface View {
  own: Card[];
  exposed: Card[];
  street: number;
  pot: number;
  stack: number;
  opponentStack: number;
  paid: number;
  otherPaid: number;
  minRaise: number;
  seat?: Seat;
  history?: ObservedAction[];
}
export function view(g: Game, seat: Seat): View {
  const other = (1 - seat) as Seat;
  return {
    own: [...g.cards[seat]],
    exposed: g.cards[other].slice(1),
    street: g.street,
    pot: g.pot,
    stack: g.stacks[seat],
    opponentStack: g.stacks[other],
    paid: g.paid[seat],
    otherPaid: g.paid[other],
    minRaise: g.minRaise,
    seat,
    history: (g.history ?? []).map((h) => ({
      actor: h.seat === seat ? 'self' : 'opponent',
      street: h.street,
      action: { ...h.action },
      paid: h.paid,
      potBefore: h.potBefore,
      call: h.call,
      ownExposed: [...h.exposed[seat]],
      opponentExposed: [...h.exposed[other]],
    })),
  };
}
export function equity(
  v: View,
  samples = 360,
  rng: () => number = Math.random,
) {
  const known = new Set([...v.own, ...v.exposed]);
  const pool = Array.from({ length: 52 }, (_, i) => i).filter(
    (c) => !known.has(c),
  );
  let wins = 0;
  for (let n = 0; n < samples; n++) {
    const d = [...pool];
    let index = d.length;
    const take = () => {
      const j = Math.floor(rng() * index);
      const c = d[j];
      d[j] = d[--index];
      return c;
    };
    const own = [...v.own],
      opp = [take(), ...v.exposed];
    while (own.length < 5) own.push(take());
    while (opp.length < 5) opp.push(take());
    const c = compare(evaluate(own), evaluate(opp));
    wins += c > 0 ? 1 : c === 0 ? 0.5 : 0;
  }
  return wins / samples;
}
export { decide, analyzeDecision } from './strategy';
