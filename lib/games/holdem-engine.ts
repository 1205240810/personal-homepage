import { rankHand } from './holdem-cards.ts';
import {
  copyBotDecisionTrace,
  sameReplayAction,
  validateBotDecisionTrace,
  type BotDecisionTrace,
} from './holdem-replay.ts';

export type Seat = number;
export type SeatValues<T> = T[];
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
  /** Recorded only when this actual AI action is applied, for completed-hand replay. */
  botTrace?: BotDecisionTrace;
  board: number[];
  pot: number;
  call: number;
  stack: number;
  effectiveRisk: number;
  button: Seat;
  tableSize: number;
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
  tableSize: number;
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

export type TableConfig = {
  tableSize: number;
  smallBlind: number;
  bigBlind: number;
  initialStack: number;
};
export const DEFAULT_TABLE_CONFIG: Readonly<TableConfig> = Object.freeze({
  tableSize: 5,
  smallBlind: 5,
  bigBlind: 10,
  initialStack: 1000,
});
export function validateTableConfig(config: TableConfig): string | null {
  if (
    !config ||
    !Number.isSafeInteger(config.tableSize) ||
    config.tableSize < 2 ||
    config.tableSize > 9
  )
    return '人数必须是 2–9 之间的整数';
  if (
    !Number.isSafeInteger(config.smallBlind) ||
    !Number.isSafeInteger(config.bigBlind) ||
    config.smallBlind < 1 ||
    config.smallBlind >= config.bigBlind ||
    config.bigBlind > 100000
  )
    return '盲注必须是整数，满足 1 ≤ 小盲 < 大盲 ≤ 100000';
  if (
    !Number.isSafeInteger(config.initialStack) ||
    config.initialStack < config.bigBlind ||
    config.initialStack > 10000000
  )
    return '初始筹码必须是整数，不少于大盲且不超过 10000000';
  return null;
}
export function tableSeats(
  stateOrCount: Pick<HoldemState, 'tableSize'> | number,
): Seat[] {
  const count =
    typeof stateOrCount === 'number' ? stateOrCount : stateOrCount.tableSize;
  if (!Number.isSafeInteger(count) || count < 2 || count > 9)
    throw new Error('人数必须是 2–9 之间的整数');
  return Array.from({ length: count }, (_, seat) => seat);
}
export const nextSeat = (seat: Seat, offset = 1, tableSize = 5): Seat =>
  (((seat + offset) % tableSize) + tableSize) % tableSize;
/** Compatibility alias; pass the current table size when outside the default table. */
export const otherSeat = nextSeat;
export const seatsAfter = (seat: Seat, tableSize = 5): Seat[] =>
  tableSeats(tableSize).map((_, index) => nextSeat(seat, index + 1, tableSize));
export function blindSeats(state: Pick<HoldemState, 'button' | 'tableSize'>) {
  return {
    small:
      state.tableSize === 2
        ? state.button
        : nextSeat(state.button, 1, state.tableSize),
    big: nextSeat(state.button, state.tableSize === 2 ? 1 : 2, state.tableSize),
  };
}
export const potSize = (state: HoldemState) =>
  state.committed.reduce((sum, chips) => sum + chips, 0);
export const STREET_LABELS: Record<Street, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  complete: '本手结束',
};
const tuple = <T>(value: T, tableSize: number): SeatValues<T> =>
  Array.from({ length: tableSize }, () => value);
const copy = <T>(values: SeatValues<T>): SeatValues<T> => [...values];
const liveSeats = (state: HoldemState) =>
  tableSeats(state).filter((seat) => !state.folded[seat]);
const currentWager = (state: HoldemState) => {
  const canBet = tableSeats(state).filter(
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

export function startHand(
  options: Partial<TableConfig> & {
    hand?: number;
    button?: Seat;
    stacks?: SeatValues<number>;
    deck?: number[];
  } = {},
): HoldemState {
  const hand = options.hand ?? 1;
  const button = options.button ?? 0;
  const deck = options.deck ?? shuffledDeck();
  if (options.stacks !== undefined && !Array.isArray(options.stacks))
    throw new Error('筹码必须是按座位排列的数组');
  const tableSize =
    options.tableSize ??
    options.stacks?.length ??
    DEFAULT_TABLE_CONFIG.tableSize;
  if (
    options.tableSize !== undefined &&
    options.stacks &&
    options.stacks.length !== tableSize
  )
    throw new Error('筹码数组长度与人数不一致');
  const smallBlind = options.smallBlind ?? DEFAULT_TABLE_CONFIG.smallBlind;
  const bigBlind = options.bigBlind ?? DEFAULT_TABLE_CONFIG.bigBlind;
  const initialStack =
    options.initialStack ?? DEFAULT_TABLE_CONFIG.initialStack;
  // Continuing hands may carry short stacks or a winner's accumulated stack. The
  // UI's initial buy-in limits do not cap chips already won at the table.
  const validation = validateTableConfig({
    tableSize,
    smallBlind,
    bigBlind,
    initialStack:
      options.stacks && options.initialStack === undefined
        ? Math.max(initialStack, bigBlind)
        : initialStack,
  });
  if (validation) throw new Error(validation);
  if (
    deck.length !== 52 ||
    new Set(deck).size !== 52 ||
    deck.some((c) => !Number.isInteger(c) || c < 0 || c > 51)
  )
    throw new Error('无效牌组');
  const stacks = options.stacks ?? tuple(initialStack, tableSize);
  if (
    stacks.some((stack) => !Number.isSafeInteger(stack) || stack <= 0) ||
    !Number.isSafeInteger(stacks.reduce((a, b) => a + b, 0))
  )
    throw new Error('各座位筹码必须为正整数且总额安全');
  if (
    !Number.isSafeInteger(button) ||
    button < 0 ||
    button >= tableSize ||
    !Number.isSafeInteger(hand) ||
    hand < 1
  )
    throw new Error('无效座位或手牌编号');
  const holes = tuple<number[]>([], tableSize);
  for (const [index, seat] of seatsAfter(button, tableSize).entries())
    holes[seat] = [deck[index], deck[index + tableSize]];
  const state: HoldemState = {
    hand,
    button,
    tableSize,
    smallBlind,
    bigBlind,
    deck: [...deck],
    cursor: tableSize * 2,
    holes,
    board: [],
    stacks: copy(stacks),
    startingStacks: copy(stacks),
    committed: tuple(0, tableSize),
    streetBets: tuple(0, tableSize),
    folded: tuple(false, tableSize),
    acted: tuple(false, tableSize),
    raiseOpen: tuple(true, tableSize),
    lastActedBet: tuple(0, tableSize),
    lastRaise: bigBlind,
    street: 'preflop',
    toAct: null,
    actions: [],
    result: null,
  };
  const blinds = blindSeats(state);
  pay(state, blinds.small, Math.min(smallBlind, state.stacks[blinds.small]));
  pay(state, blinds.big, Math.min(bigBlind, state.stacks[blinds.big]));
  refreshRaises(state);
  continueAction(state, blinds.big);
  return state;
}

function pay(state: HoldemState, seat: Seat, amount: number) {
  state.stacks[seat] -= amount;
  state.committed[seat] += amount;
  state.streetBets[seat] += amount;
}

function refreshRaises(state: HoldemState) {
  const wager = currentWager(state);
  for (const seat of tableSeats(state)) {
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
      tableSeats(state).some(
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

export function act(
  previous: HoldemState,
  action: PokerAction,
  botTrace?: BotDecisionTrace,
): HoldemState {
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
  if (
    botTrace !== undefined &&
    (!validateBotDecisionTrace(botTrace) ||
      botTrace.seat !== seat ||
      botTrace.tableSize !== previous.tableSize ||
      botTrace.street !== previous.street ||
      botTrace.bigBlind !== previous.bigBlind ||
      botTrace.pot !== legal.pot ||
      botTrace.call !== legal.call ||
      botTrace.opponents !== liveSeats(previous).length - 1 ||
      botTrace.hole.length !== previous.holes[seat].length ||
      botTrace.hole.some(
        (card, index) => card !== previous.holes[seat][index],
      ) ||
      botTrace.board.length !== previous.board.length ||
      botTrace.board.some((card, index) => card !== previous.board[index]) ||
      !sameReplayAction(botTrace.selectedAction, action))
  )
    throw new Error('AI 决策诊断与本次实际行动不一致');
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
    ...(botTrace ? { botTrace: copyBotDecisionTrace(botTrace) } : {}),
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
    tableSize: state.tableSize,
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
      ...tableSeats(state)
        .filter((opponent) => opponent !== seat && !state.folded[opponent])
        .map((opponent) => state.streetBets[opponent] + state.stacks[opponent]),
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
  const pending = seatsAfter(after, state.tableSize).find((seat) =>
    needsAction(state, seat),
  );
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
  state.streetBets = tuple(0, state.tableSize);
  state.acted = tuple(false, state.tableSize);
  state.raiseOpen = tuple(true, state.tableSize);
  state.lastActedBet = tuple(0, state.tableSize);
  state.lastRaise = state.bigBlind;
  refreshRaises(state);
  state.toAct =
    seatsAfter(state.button, state.tableSize).find((seat) =>
      needsAction(state, seat),
    ) ?? null;
  if (state.toAct === null) runOut(state);
}

function runOut(state: HoldemState) {
  while (state.board.length < 5) dealBoard(state);
  settle(state, 'showdown');
}

function settle(state: HoldemState, reason: 'fold' | 'showdown') {
  const live = liveSeats(state);
  const ranks = tableSeats(state).map((seat) =>
    reason === 'showdown' && !state.folded[seat]
      ? rankHand([...state.holes[seat], ...state.board])
      : null,
  );
  const labels = ranks.map((rank) => rank?.label ?? '') as SeatValues<string>;
  const payouts = tuple(0, state.tableSize);
  const returned = tuple(0, state.tableSize);
  const pots: SettledPot[] = [];
  const levels = [
    ...new Set(state.committed.filter((chips) => chips > 0)),
  ].sort((a, b) => a - b);
  let lower = 0;
  for (const level of levels) {
    const contributors = tableSeats(state).filter(
      (seat) => state.committed[seat] >= level,
    );
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
    for (const seat of seatsAfter(state.button, state.tableSize))
      if (odd > 0 && pot.winners.includes(seat)) {
        payouts[seat]++;
        odd--;
      }
  }
  for (const seat of tableSeats(state)) {
    state.stacks[seat] += returned[seat] + payouts[seat];
    state.committed[seat] -= returned[seat];
  }
  const winners = tableSeats(state).filter((seat) => payouts[seat] > 0);
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
