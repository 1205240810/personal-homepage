import { rankHand } from './holdem-cards.ts';

export type Seat = 0 | 1 | 2 | 3 | 4;
export type SeatValues<T> = [T, T, T, T, T];
export const SEATS = [0, 1, 2, 3, 4] as const;
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';
export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number };
export type PublicAction = {
  seat: Seat;
  street: Exclude<Street, 'complete'>;
  action: PokerAction;
  paid: number;
  streetBet: number;
};
/** Everything known before this choice, without another seat's cards or future board. */
export type Decision = PublicAction & {
  board: number[];
  pot: number;
  call: number;
  stack: number;
  effectiveRisk: number;
  button: Seat;
  activeSeats: Seat[];
  stacks: SeatValues<number>;
  committed: SeatValues<number>;
  streetBets: SeatValues<number>;
  folded: SeatValues<boolean>;
  lastRaise: number;
  raiseOpen: boolean;
  minTo: number;
  maxTo: number;
  history: PublicAction[];
};
export type SettledPot = {
  amount: number;
  eligible: Seat[];
  winners: Seat[];
};
export type HoldemState = {
  hand: number;
  button: Seat;
  smallBlind: number;
  bigBlind: number;
  deck: number[];
  cursor: number;
  holes: SeatValues<number[]>;
  board: number[];
  stacks: SeatValues<number>;
  startingStacks: SeatValues<number>;
  committed: SeatValues<number>;
  streetBets: SeatValues<number>;
  folded: SeatValues<boolean>;
  acted: SeatValues<boolean>;
  /** Raise permission, refreshed after every action (including cumulative short raises). */
  raiseOpen: SeatValues<boolean>;
  /** Total live street wager when this seat last acted. */
  lastActedBet: SeatValues<number>;
  lastRaise: number;
  street: Street;
  toAct: Seat | null;
  actions: Decision[];
  result: null | {
    winner: Seat | 'tie';
    winners: Seat[];
    reason: 'fold' | 'showdown';
    pot: number;
    returned: SeatValues<number>;
    payouts: SeatValues<number>;
    labels: SeatValues<string>;
    pots: SettledPot[];
  };
};

export const nextSeat = (seat: Seat, offset = 1): Seat =>
  ((((seat + offset) % 5) + 5) % 5) as Seat;
/** Kept for older consumers; on a five-seat table this means the next seat. */
export const otherSeat = nextSeat;
export const seatsAfter = (seat: Seat): Seat[] =>
  Array.from({ length: 5 }, (_, index) => nextSeat(seat, index + 1));
export const potSize = (state: HoldemState) =>
  state.committed.reduce((sum, chips) => sum + chips, 0);
export const STREET_LABELS: Record<Street, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  complete: '本手结束',
};
const tuple = <T>(value: T): SeatValues<T> => [
  value,
  value,
  value,
  value,
  value,
];
const copy = <T>(values: SeatValues<T>): SeatValues<T> => [...values];
const liveSeats = (state: HoldemState) =>
  SEATS.filter((seat) => !state.folded[seat]);
const currentWager = (state: HoldemState) => {
  const canBet = SEATS.filter(
    (seat) => !state.folded[seat] && state.stacks[seat] > 0,
  ).length;
  return Math.max(
    state.street === 'preflop' && canBet > 1 ? state.bigBlind : 0,
    ...state.streetBets,
  );
};

export function shuffledDeck(random = Math.random) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error('随机数必须位于 [0, 1)');
    const j = Math.floor(value * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function startHand({
  hand = 1,
  button = 0,
  stacks = [1000, 1000, 1000, 1000, 1000],
  deck = shuffledDeck(),
}: {
  hand?: number;
  button?: Seat;
  stacks?: SeatValues<number>;
  deck?: number[];
} = {}): HoldemState {
  if (
    deck.length !== 52 ||
    new Set(deck).size !== 52 ||
    deck.some((c) => !Number.isInteger(c) || c < 0 || c > 51)
  )
    throw new Error('无效牌组');
  if (
    stacks.length !== 5 ||
    stacks.some((s) => !Number.isSafeInteger(s) || s <= 0) ||
    !Number.isSafeInteger(stacks.reduce((a, b) => a + b, 0))
  )
    throw new Error('五个座位的筹码必须为正整数');
  if (!SEATS.includes(button) || !Number.isSafeInteger(hand) || hand < 1)
    throw new Error('无效座位或手牌编号');
  const holes: SeatValues<number[]> = [[], [], [], [], []];
  for (const [index, seat] of seatsAfter(button).entries()) {
    holes[seat] = [deck[index], deck[index + 5]];
  }
  const state: HoldemState = {
    hand,
    button,
    smallBlind: 5,
    bigBlind: 10,
    deck: [...deck],
    cursor: 10,
    holes,
    board: [],
    stacks: copy(stacks),
    startingStacks: copy(stacks),
    committed: tuple(0),
    streetBets: tuple(0),
    folded: tuple(false),
    acted: tuple(false),
    raiseOpen: tuple(true),
    lastActedBet: tuple(0),
    lastRaise: 10,
    street: 'preflop',
    toAct: nextSeat(button, 3),
    actions: [],
    result: null,
  };
  pay(state, nextSeat(button), Math.min(5, state.stacks[nextSeat(button)]));
  pay(
    state,
    nextSeat(button, 2),
    Math.min(10, state.stacks[nextSeat(button, 2)]),
  );
  refreshRaises(state);
  continueAction(state, nextSeat(button, 2));
  return state;
}

function pay(state: HoldemState, seat: Seat, amount: number) {
  state.stacks[seat] -= amount;
  state.committed[seat] += amount;
  state.streetBets[seat] += amount;
}

function refreshRaises(state: HoldemState) {
  const wager = currentWager(state);
  for (const seat of SEATS) {
    state.raiseOpen[seat] =
      !state.folded[seat] &&
      state.stacks[seat] > 0 &&
      (!state.acted[seat] ||
        wager - state.lastActedBet[seat] >= state.lastRaise);
  }
}

export function legalActions(state: HoldemState) {
  const seat = state.toAct;
  if (
    seat === null ||
    state.street === 'complete' ||
    state.folded[seat] ||
    state.stacks[seat] <= 0
  )
    return null;
  const currentBet = currentWager(state);
  const owed = Math.max(0, currentBet - state.streetBets[seat]);
  const call = Math.min(owed, state.stacks[seat]);
  const reachable = state.committed[seat] + call;
  // Existing contributions beyond the caller's all-in layer belong to other side pots.
  const pot = state.committed.reduce(
    (sum, contribution) => sum + Math.min(contribution, reachable),
    0,
  );
  const maxTo = state.streetBets[seat] + state.stacks[seat];
  const minTo =
    currentBet === 0 ? state.bigBlind : currentBet + state.lastRaise;
  return {
    seat,
    call,
    owed,
    pot,
    potOdds: call ? call / (pot + call) : 0,
    canCheck: owed === 0,
    canRaise:
      state.raiseOpen[seat] &&
      maxTo > currentBet &&
      SEATS.some(
        (opponent) =>
          opponent !== seat &&
          !state.folded[opponent] &&
          state.stacks[opponent] > 0 &&
          state.streetBets[opponent] + state.stacks[opponent] > currentBet,
      ),
    minTo,
    maxTo,
  };
}

export function act(previous: HoldemState, action: PokerAction): HoldemState {
  const legal = legalActions(previous);
  if (!legal) throw new Error('现在不能行动');
  if (!action || !['fold', 'check', 'call', 'raise'].includes(action.type))
    throw new Error('无效行动');
  if (action.type === 'check' && !legal.canCheck)
    throw new Error('面临下注时不能过牌');
  if (action.type === 'call' && legal.call === 0) throw new Error('无需跟注');
  if (
    action.type === 'raise' &&
    (!legal.canRaise ||
      !Number.isSafeInteger(action.to) ||
      action.to > legal.maxTo ||
      action.to <= currentWager(previous) ||
      (action.to < legal.minTo && action.to !== legal.maxTo))
  )
    throw new Error('加注额度不符合规则');
  const seat = legal.seat;
  const state: HoldemState = {
    ...previous,
    board: [...previous.board],
    stacks: copy(previous.stacks),
    committed: copy(previous.committed),
    streetBets: copy(previous.streetBets),
    folded: copy(previous.folded),
    acted: copy(previous.acted),
    raiseOpen: copy(previous.raiseOpen),
    lastActedBet: copy(previous.lastActedBet),
    actions: [...previous.actions],
  };
  const record: Decision = {
    seat,
    street: state.street as Decision['street'],
    board: [...state.board],
    pot: legal.pot,
    call: legal.call,
    stack: state.stacks[seat],
    streetBet: state.streetBets[seat],
    action: { ...action },
    paid: 0,
    effectiveRisk: 0,
    button: state.button,
    activeSeats: liveSeats(state),
    stacks: copy(state.stacks),
    committed: copy(state.committed),
    streetBets: copy(state.streetBets),
    folded: copy(state.folded),
    lastRaise: state.lastRaise,
    raiseOpen: legal.canRaise,
    minTo: legal.minTo,
    maxTo: legal.maxTo,
    history: previous.actions.map(
      ({ seat: actor, street, action: move, paid, streetBet }) => ({
        seat: actor,
        street,
        action: { ...move },
        paid,
        streetBet,
      }),
    ),
  };
  if (action.type === 'fold') state.folded[seat] = true;
  else if (action.type === 'raise') {
    const before = currentWager(state);
    const increase = action.to - before;
    record.paid = action.to - state.streetBets[seat];
    const maxOpponent = Math.max(
      ...SEATS.filter(
        (opponent) => opponent !== seat && !state.folded[opponent],
      ).map((opponent) => state.streetBets[opponent] + state.stacks[opponent]),
    );
    record.effectiveRisk = Math.min(
      record.paid,
      Math.max(0, maxOpponent - state.streetBets[seat]),
    );
    pay(state, seat, record.paid);
    if (increase >= state.lastRaise) state.lastRaise = increase;
  } else if (action.type === 'call') {
    record.paid = legal.call;
    record.effectiveRisk = legal.call;
    pay(state, seat, legal.call);
  }
  state.acted[seat] = true;
  state.lastActedBet[seat] = currentWager(state);
  state.actions.push(record);
  refreshRaises(state);
  continueAction(state, seat);
  return state;
}

function needsAction(state: HoldemState, seat: Seat) {
  if (state.folded[seat] || state.stacks[seat] === 0) return false;
  const owing = state.streetBets[seat] < currentWager(state);
  // With only one seat holding chips there is no dry-side-pot betting. It still
  // must call/fold an existing live wager before the remaining board is run out.
  const withChips = liveSeats(state).filter(
    (active) => state.stacks[active] > 0,
  );
  if (withChips.length === 1) {
    const otherHighest = Math.max(
      0,
      ...liveSeats(state)
        .filter((active) => active !== seat)
        .map((active) => state.streetBets[active]),
    );
    return state.streetBets[seat] < otherHighest;
  }
  return !state.acted[seat] || owing;
}

function continueAction(state: HoldemState, after: Seat) {
  const live = liveSeats(state);
  if (live.length === 1) {
    settle(state, 'fold');
    return;
  }
  const pending = seatsAfter(after).find((seat) => needsAction(state, seat));
  if (pending !== undefined) {
    state.toAct = pending;
    return;
  }
  if (live.filter((seat) => state.stacks[seat] > 0).length <= 1) runOut(state);
  else advanceStreet(state);
}

function dealBoard(state: HoldemState) {
  state.cursor++;
  const count = state.board.length === 0 ? 3 : 1;
  state.board.push(...state.deck.slice(state.cursor, state.cursor + count));
  state.cursor += count;
}

function advanceStreet(state: HoldemState) {
  if (state.street === 'river') {
    settle(state, 'showdown');
    return;
  }
  dealBoard(state);
  state.street =
    state.board.length === 3
      ? 'flop'
      : state.board.length === 4
        ? 'turn'
        : 'river';
  state.streetBets = tuple(0);
  state.acted = tuple(false);
  state.raiseOpen = tuple(true);
  state.lastActedBet = tuple(0);
  state.lastRaise = state.bigBlind;
  refreshRaises(state);
  state.toAct =
    seatsAfter(state.button).find((seat) => needsAction(state, seat)) ?? null;
  if (state.toAct === null) runOut(state);
}

function runOut(state: HoldemState) {
  while (state.board.length < 5) dealBoard(state);
  settle(state, 'showdown');
}

function settle(state: HoldemState, reason: 'fold' | 'showdown') {
  const live = liveSeats(state);
  const ranks = SEATS.map((seat) =>
    reason === 'showdown' && !state.folded[seat]
      ? rankHand([...state.holes[seat], ...state.board])
      : null,
  );
  const labels = ranks.map((rank) => rank?.label ?? '') as SeatValues<string>;
  const payouts = tuple(0);
  const returned = tuple(0);
  const pots: SettledPot[] = [];
  const levels = [
    ...new Set(state.committed.filter((chips) => chips > 0)),
  ].sort((a, b) => a - b);
  let lower = 0;
  for (const level of levels) {
    const contributors = SEATS.filter((seat) => state.committed[seat] >= level);
    const amount = (level - lower) * contributors.length;
    lower = level;
    if (contributors.length === 1) {
      returned[contributors[0]] += amount;
      continue;
    }
    const eligible = contributors.filter((seat) => !state.folded[seat]);
    const claimants = eligible.length ? eligible : live;
    const previousPot = pots.at(-1);
    // A folded player's contribution boundary does not create a new side pot.
    // Combine such layers before splitting so artificial boundaries cannot skew odd chips.
    if (previousPot && previousPot.eligible.join(',') === claimants.join(','))
      previousPot.amount += amount;
    else pots.push({ amount, eligible: [...claimants], winners: [] });
  }
  for (const pot of pots) {
    const best =
      reason === 'fold'
        ? 0
        : Math.max(...pot.eligible.map((seat) => ranks[seat]!.value));
    pot.winners = pot.eligible.filter(
      (seat) => reason === 'fold' || ranks[seat]!.value === best,
    );
    const perSeat = Math.floor(pot.amount / pot.winners.length);
    let odd = pot.amount % pot.winners.length;
    for (const seat of pot.winners) payouts[seat] += perSeat;
    // TDA: each actual pot is split separately; odd chips start left of button.
    for (const seat of seatsAfter(state.button))
      if (odd > 0 && pot.winners.includes(seat)) {
        payouts[seat]++;
        odd--;
      }
  }
  for (const seat of SEATS) {
    state.stacks[seat] += returned[seat] + payouts[seat];
    state.committed[seat] -= returned[seat];
  }
  const winners = SEATS.filter((seat) => payouts[seat] > 0);
  state.result = {
    winner: winners.length === 1 ? winners[0] : 'tie',
    winners,
    reason,
    pot: pots.reduce((sum, pot) => sum + pot.amount, 0),
    returned,
    payouts,
    labels,
    pots,
  };
  state.street = 'complete';
  state.toAct = null;
}

export function actionLabel(decision: PublicAction) {
  if (decision.action.type === 'fold') return '弃牌';
  if (decision.action.type === 'check') return '过牌';
  if (decision.action.type === 'call') return `跟注 ${decision.paid}`;
  return `${decision.streetBet === 0 && 'call' in decision && decision.call === 0 ? '下注' : '加注到'} ${decision.action.to}`;
}
