import { rankHand } from './holdem-cards.ts';

export type Seat = 0 | 1;
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';
export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number };
export type Decision = {
  seat: Seat;
  street: Exclude<Street, 'complete'>;
  board: number[];
  pot: number;
  call: number;
  stack: number;
  streetBet: number;
  action: PokerAction;
  paid: number;
  effectiveRisk?: number;
};
export type HoldemState = {
  hand: number;
  button: Seat;
  smallBlind: number;
  bigBlind: number;
  deck: number[];
  cursor: number;
  holes: [number[], number[]];
  board: number[];
  stacks: [number, number];
  startingStacks: [number, number];
  committed: [number, number];
  streetBets: [number, number];
  acted: [boolean, boolean];
  raiseOpen: [boolean, boolean];
  lastRaise: number;
  street: Street;
  toAct: Seat | null;
  actions: Decision[];
  result: null | {
    winner: Seat | 'tie';
    reason: 'fold' | 'showdown';
    pot: number;
    returned: [number, number];
    labels: [string, string];
  };
};
export const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
export const potSize = (state: HoldemState) =>
  state.committed[0] + state.committed[1];
export const STREET_LABELS: Record<Street, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  complete: '本手结束',
};

export function shuffledDeck(random = Math.random) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function startHand({
  hand = 1,
  button = 0,
  stacks = [1000, 1000],
  deck = shuffledDeck(),
}: {
  hand?: number;
  button?: Seat;
  stacks?: [number, number];
  deck?: number[];
} = {}): HoldemState {
  if (
    deck.length !== 52 ||
    new Set(deck).size !== 52 ||
    deck.some((c) => !Number.isInteger(c) || c < 0 || c > 51)
  )
    throw new Error('无效牌组');
  if (stacks.some((s) => !Number.isInteger(s) || s <= 0))
    throw new Error('筹码必须为正整数');
  const holes: [number[], number[]] = [[], []];
  holes[otherSeat(button)] = [deck[0], deck[2]];
  holes[button] = [deck[1], deck[3]];
  const state: HoldemState = {
    hand,
    button,
    smallBlind: 5,
    bigBlind: 10,
    deck: [...deck],
    cursor: 4,
    holes,
    board: [],
    stacks: [...stacks],
    startingStacks: [...stacks],
    committed: [0, 0],
    streetBets: [0, 0],
    acted: [false, false],
    raiseOpen: [true, true],
    lastRaise: 10,
    street: 'preflop',
    toAct: button,
    actions: [],
    result: null,
  };
  pay(state, button, Math.min(5, state.stacks[button]));
  pay(state, otherSeat(button), Math.min(10, state.stacks[otherSeat(button)]));
  if (state.stacks[0] === 0 || state.stacks[1] === 0) {
    // With a short blind, the player owing a call still gets that decision.
    const owing: Seat = state.streetBets[0] < state.streetBets[1] ? 0 : 1;
    if (
      state.stacks[owing] > 0 &&
      state.streetBets[owing] < state.streetBets[otherSeat(owing)]
    )
      state.toAct = owing;
    else runOut(state);
  }
  return state;
}

function pay(state: HoldemState, seat: Seat, amount: number) {
  state.stacks[seat] -= amount;
  state.committed[seat] += amount;
  state.streetBets[seat] += amount;
}

export function legalActions(state: HoldemState) {
  const seat = state.toAct;
  if (seat === null || state.street === 'complete') return null;
  const opponent = otherSeat(seat);
  const currentBet = Math.max(...state.streetBets);
  const owed = Math.max(0, currentBet - state.streetBets[seat]);
  const call = Math.min(owed, state.stacks[seat]);
  // Opponent excess is refunded on a short all-in, and is not part of the contestable pot.
  const excess = Math.max(0, owed - state.stacks[seat]);
  const pot = potSize(state) - excess;
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
      state.raiseOpen[seat] && state.stacks[opponent] > 0 && maxTo > currentBet,
    minTo,
    maxTo,
  };
}

export function act(previous: HoldemState, action: PokerAction): HoldemState {
  const legal = legalActions(previous);
  if (!legal) throw new Error('现在不能行动');
  const seat = legal.seat;
  const opponent = otherSeat(seat);
  const state: HoldemState = {
    ...previous,
    board: [...previous.board],
    stacks: [...previous.stacks],
    committed: [...previous.committed],
    streetBets: [...previous.streetBets],
    acted: [...previous.acted],
    raiseOpen: [...previous.raiseOpen],
    actions: [...previous.actions],
  };
  if (action.type === 'check' && !legal.canCheck)
    throw new Error('面临下注时不能过牌');
  if (action.type === 'call' && legal.call === 0) throw new Error('无需跟注');
  if (action.type === 'raise') {
    if (
      !legal.canRaise ||
      !Number.isInteger(action.to) ||
      action.to > legal.maxTo ||
      action.to <= Math.max(...state.streetBets) ||
      (action.to < legal.minTo && action.to !== legal.maxTo)
    )
      throw new Error('加注额度不符合规则');
  }
  const record: Decision = {
    seat,
    street: state.street as Decision['street'],
    board: [...state.board],
    pot: legal.pot,
    call: legal.call,
    stack: state.stacks[seat],
    streetBet: state.streetBets[seat],
    action,
    paid: 0,
  };
  if (action.type === 'fold') {
    state.actions.push(record);
    finish(state, opponent, 'fold');
    return state;
  }
  if (action.type === 'raise') {
    const increase = action.to - Math.max(...state.streetBets);
    record.paid = action.to - state.streetBets[seat];
    record.effectiveRisk = Math.min(
      record.paid,
      Math.max(
        0,
        state.streetBets[opponent] +
          state.stacks[opponent] -
          state.streetBets[seat],
      ),
    );
    pay(state, seat, record.paid);
    const fullRaise = increase >= state.lastRaise;
    if (fullRaise) {
      state.lastRaise = increase;
      state.acted[opponent] = false;
      state.raiseOpen[opponent] = true;
    } else if (state.acted[opponent]) state.raiseOpen[opponent] = false;
  } else if (action.type === 'call') {
    record.paid = legal.call;
    pay(state, seat, legal.call);
  }
  state.acted[seat] = true;
  state.actions.push(record);
  const equal = state.streetBets[0] === state.streetBets[1];
  if (
    (equal && (state.stacks[0] === 0 || state.stacks[1] === 0)) ||
    (!equal && state.stacks[seat] === 0 && action.type === 'call')
  ) {
    runOut(state);
  } else if (equal && state.acted[0] && state.acted[1]) {
    advanceStreet(state);
  } else state.toAct = opponent;
  return state;
}

function dealBoard(state: HoldemState) {
  state.cursor++; // Burn one before each board street.
  const count = state.board.length === 0 ? 3 : 1;
  state.board.push(...state.deck.slice(state.cursor, state.cursor + count));
  state.cursor += count;
}

function advanceStreet(state: HoldemState) {
  if (state.street === 'river') {
    showdown(state);
    return;
  }
  dealBoard(state);
  state.street =
    state.board.length === 3
      ? 'flop'
      : state.board.length === 4
        ? 'turn'
        : 'river';
  state.streetBets = [0, 0];
  state.acted = [false, false];
  state.raiseOpen = [true, true];
  state.lastRaise = state.bigBlind;
  state.toAct = otherSeat(state.button);
}

function runOut(state: HoldemState) {
  while (state.board.length < 5) dealBoard(state);
  showdown(state);
}

function showdown(state: HoldemState) {
  const ranks = state.holes.map((hole) => rankHand([...hole, ...state.board]));
  finish(
    state,
    ranks[0].value === ranks[1].value
      ? 'tie'
      : ranks[0].value > ranks[1].value
        ? 0
        : 1,
    'showdown',
    [ranks[0].label, ranks[1].label],
  );
}

function finish(
  state: HoldemState,
  winner: Seat | 'tie',
  reason: 'fold' | 'showdown',
  labels: [string, string] = ['', ''],
) {
  const matched = Math.min(...state.committed);
  const returned: [number, number] = [
    state.committed[0] - matched,
    state.committed[1] - matched,
  ];
  for (const seat of [0, 1] as const) {
    state.stacks[seat] += returned[seat];
    state.committed[seat] = matched;
  }
  const pot = matched * 2;
  if (winner === 'tie') {
    state.stacks[0] += matched;
    state.stacks[1] += matched;
  } else state.stacks[winner] += pot;
  state.result = { winner, reason, pot, returned, labels };
  state.street = 'complete';
  state.toAct = null;
}

export function actionLabel(decision: Decision) {
  if (decision.action.type === 'fold') return '弃牌';
  if (decision.action.type === 'check') return '过牌';
  if (decision.action.type === 'call') return `跟注 ${decision.paid}`;
  return `${decision.streetBet === 0 && decision.call === 0 ? '下注' : '加注到'} ${decision.action.to}`;
}
