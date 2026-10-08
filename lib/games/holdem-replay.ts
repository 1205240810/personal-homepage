import type {
  HoldemState,
  PokerAction,
  PublicAction,
  Seat,
  Street,
} from './holdem-engine.ts';

/** Recorded diagnostics from the policy that actually selected this action.
 * These are local policy samples, not solved GTO action frequencies. */
export type BotDecisionTrace = {
  seat: Seat;
  tableSize: number;
  street: Exclude<Street, 'complete'>;
  hole: number[];
  board: number[];
  pot: number;
  call: number;
  bigBlind: number;
  position: string;
  opponents: number;
  equity: number;
  rawEquity: number;
  samples: number;
  style: 'balanced' | 'careful' | 'active' | 'tricky';
  difficulty: 'casual' | 'standard' | 'advanced';
  selectedAction: PokerAction;
  policyAction: PokerAction;
  selectedIntent: string;
  rationale: string[];
  mixing: {
    roll: number;
    equityJitterRoll: number;
    adjustedEquity: number;
    realizedEquity: number;
    bluffProbability: number;
    bluffEligible: boolean;
    bluffTriggered: boolean;
    draw: number;
    blocker: boolean;
    inPosition: boolean;
    cbet: boolean;
    steal: boolean;
  };
  /** Same-world local EV diagnostics; these values do not drive policy mixing. */
  candidates: {
    action: PokerAction;
    evBB: number;
    standardErrorBB: number;
  }[];
  override?: {
    reason: 'call-ev';
    from: PokerAction;
    to: PokerAction;
    callEVBB: number;
    toleranceBB: number;
    changed: boolean;
  };
};

export type ReplayAction = PublicAction & {
  index: number;
  /** Only the public cards already dealt at this action. */
  board: number[];
  pot: number;
  call: number;
  stack: number;
  botTrace?: BotDecisionTrace;
};

/** A completed hand only. The undealt deck and burn cards are never archived. */
export type TableReplay = {
  version: 1;
  hand: number;
  button: Seat;
  tableSize: number;
  smallBlind: number;
  bigBlind: number;
  holes: number[][];
  board: number[];
  folded: boolean[];
  startingStacks: number[];
  stacks: number[];
  committed: number[];
  result: NonNullable<HoldemState['result']>;
  actions: ReplayAction[];
};

export const MAX_REPLAY_ACTIONS = 512;
const streets = ['preflop', 'flop', 'turn', 'river'] as const;
const boardLengths = [0, 3, 4, 5];
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keysOnly = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const safeInt = (value: unknown, minimum = 0): value is number =>
  Number.isSafeInteger(value) && (value as number) >= minimum;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const ratio = (value: unknown) => finite(value) && value >= 0 && value <= 1;
const text = (value: unknown, limit = 1000): value is string =>
  typeof value === 'string' && value.length <= limit;
const card = (value: unknown): value is number => safeInt(value) && value <= 51;
const sameNumbers = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);
const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);
const seatList = (value: unknown, count: number): value is number[] =>
  Array.isArray(value) &&
  value.length <= count &&
  value.every((seat) => safeInt(seat) && seat < count) &&
  new Set(value).size === value.length;
const chipList = (
  value: unknown,
  count: number,
  minimum = 0,
): value is number[] =>
  Array.isArray(value) &&
  value.length === count &&
  value.every((chips) => safeInt(chips, minimum)) &&
  Number.isSafeInteger(sum(value));
const boolList = (value: unknown, count: number): value is boolean[] =>
  Array.isArray(value) &&
  value.length === count &&
  value.every((item) => typeof item === 'boolean');

export function validateReplayAction(value: unknown): value is PokerAction {
  if (!isObject(value)) return false;
  return value.type === 'raise'
    ? keysOnly(value, ['type', 'to']) && safeInt(value.to, 1)
    : keysOnly(value, ['type']) &&
        ['fold', 'check', 'call'].includes(value.type as string);
}

export function sameReplayAction(a: PokerAction, b: PokerAction) {
  return (
    a.type === b.type &&
    (a.type !== 'raise' || (b.type === 'raise' && a.to === b.to))
  );
}

export function validateBotDecisionTrace(
  value: unknown,
): value is BotDecisionTrace {
  if (
    !isObject(value) ||
    !keysOnly(value, [
      'seat',
      'tableSize',
      'street',
      'hole',
      'board',
      'pot',
      'call',
      'bigBlind',
      'position',
      'opponents',
      'equity',
      'rawEquity',
      'samples',
      'style',
      'difficulty',
      'selectedAction',
      'policyAction',
      'selectedIntent',
      'rationale',
      'mixing',
      'candidates',
      'override',
    ])
  )
    return false;
  if (
    !safeInt(value.tableSize, 2) ||
    value.tableSize > 9 ||
    !safeInt(value.seat, 1) ||
    value.seat >= value.tableSize
  )
    return false;
  const street = streets.indexOf(value.street as (typeof streets)[number]);
  if (
    street < 0 ||
    !Array.isArray(value.hole) ||
    value.hole.length !== 2 ||
    !value.hole.every(card) ||
    !Array.isArray(value.board) ||
    value.board.length !== boardLengths[street] ||
    !value.board.every(card) ||
    new Set([...value.hole, ...value.board]).size !== 2 + value.board.length
  )
    return false;
  if (
    !safeInt(value.pot) ||
    !safeInt(value.call) ||
    !safeInt(value.bigBlind, 2) ||
    value.bigBlind > 100000 ||
    !text(value.position, 64) ||
    !safeInt(value.opponents, 1) ||
    value.opponents >= value.tableSize ||
    !ratio(value.equity) ||
    !ratio(value.rawEquity) ||
    !safeInt(value.samples, 1) ||
    value.samples > 100000 ||
    !['balanced', 'careful', 'active', 'tricky'].includes(
      value.style as string,
    ) ||
    !['casual', 'standard', 'advanced'].includes(value.difficulty as string) ||
    !validateReplayAction(value.selectedAction) ||
    !validateReplayAction(value.policyAction) ||
    !text(value.selectedIntent, 128) ||
    !Array.isArray(value.rationale) ||
    value.rationale.length > 12 ||
    !value.rationale.every((item) => text(item))
  )
    return false;
  const mix = value.mixing;
  if (
    !isObject(mix) ||
    !keysOnly(mix, [
      'roll',
      'equityJitterRoll',
      'adjustedEquity',
      'realizedEquity',
      'bluffProbability',
      'bluffEligible',
      'bluffTriggered',
      'draw',
      'blocker',
      'inPosition',
      'cbet',
      'steal',
    ]) ||
    !ratio(mix.roll) ||
    mix.roll === 1 ||
    !ratio(mix.equityJitterRoll) ||
    mix.equityJitterRoll === 1 ||
    !ratio(mix.adjustedEquity) ||
    !ratio(mix.realizedEquity) ||
    !ratio(mix.bluffProbability) ||
    !finite(mix.draw) ||
    mix.draw < 0 ||
    mix.draw > 2 ||
    ![
      'bluffEligible',
      'bluffTriggered',
      'blocker',
      'inPosition',
      'cbet',
      'steal',
    ].every((key) => typeof mix[key] === 'boolean') ||
    (mix.bluffTriggered && !mix.bluffEligible)
  )
    return false;
  if (
    !Array.isArray(value.candidates) ||
    value.candidates.length < 1 ||
    value.candidates.length > 32 ||
    !value.candidates.every(
      (item) =>
        isObject(item) &&
        keysOnly(item, ['action', 'evBB', 'standardErrorBB']) &&
        validateReplayAction(item.action) &&
        finite(item.evBB) &&
        finite(item.standardErrorBB) &&
        item.standardErrorBB >= 0,
    )
  )
    return false;
  if (
    !value.candidates.some((item) =>
      sameReplayAction(item.action, value.selectedAction as PokerAction),
    )
  )
    return false;
  if (value.override !== undefined) {
    const override = value.override;
    if (
      !isObject(override) ||
      !keysOnly(override, [
        'reason',
        'from',
        'to',
        'callEVBB',
        'toleranceBB',
        'changed',
      ]) ||
      override.reason !== 'call-ev' ||
      !validateReplayAction(override.from) ||
      !validateReplayAction(override.to) ||
      !finite(override.callEVBB) ||
      !finite(override.toleranceBB) ||
      override.toleranceBB < 0 ||
      typeof override.changed !== 'boolean' ||
      !sameReplayAction(override.from, value.policyAction) ||
      !sameReplayAction(override.to, value.selectedAction) ||
      override.changed === sameReplayAction(override.from, override.to)
    )
      return false;
  } else if (!sameReplayAction(value.policyAction, value.selectedAction))
    return false;
  return true;
}

export function copyBotDecisionTrace(
  trace: BotDecisionTrace,
): BotDecisionTrace {
  return {
    ...trace,
    hole: [...trace.hole],
    board: [...trace.board],
    selectedAction: { ...trace.selectedAction },
    policyAction: { ...trace.policyAction },
    rationale: [...trace.rationale],
    mixing: { ...trace.mixing },
    candidates: trace.candidates.map((item) => ({
      ...item,
      action: { ...item.action },
    })),
    ...(trace.override
      ? {
          override: {
            ...trace.override,
            from: { ...trace.override.from },
            to: { ...trace.override.to },
          },
        }
      : {}),
  };
}

export function createTableReplay(state: HoldemState): TableReplay {
  if (state.street !== 'complete' || !state.result || state.toAct !== null)
    throw new Error('牌局结束后才能查看全桌底牌与 AI 决策回放');
  if (state.actions.length > MAX_REPLAY_ACTIONS)
    throw new Error('本手行动过多，无法保存完整回放');
  const replay: TableReplay = {
    version: 1,
    hand: state.hand,
    button: state.button,
    tableSize: state.tableSize,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    holes: state.holes.map((hole) => [...hole]),
    board: [...state.board],
    folded: [...state.folded],
    startingStacks: [...state.startingStacks],
    stacks: [...state.stacks],
    committed: [...state.committed],
    result: {
      ...state.result,
      winners: [...state.result.winners],
      returned: [...state.result.returned],
      payouts: [...state.result.payouts],
      labels: [...state.result.labels],
      pots: state.result.pots.map((pot) => ({
        ...pot,
        eligible: [...pot.eligible],
        winners: [...pot.winners],
      })),
    },
    actions: state.actions.map((decision, index) => ({
      index,
      seat: decision.seat,
      street: decision.street,
      action: { ...decision.action },
      paid: decision.paid,
      streetBet: decision.streetBet,
      board: [...decision.board],
      pot: decision.pot,
      call: decision.call,
      stack: decision.stack,
      ...(decision.botTrace
        ? { botTrace: copyBotDecisionTrace(decision.botTrace) }
        : {}),
    })),
  };
  if (!validateTableReplay(replay))
    throw new Error('本手回放记录不完整或不一致');
  return replay;
}

/** Fail closed for corrupted local archives, while absent replay data remains
 * compatible with the old history format at the UI boundary. */
export function validateTableReplay(value: unknown): value is TableReplay {
  if (
    !isObject(value) ||
    !keysOnly(value, [
      'version',
      'hand',
      'button',
      'tableSize',
      'smallBlind',
      'bigBlind',
      'holes',
      'board',
      'folded',
      'startingStacks',
      'stacks',
      'committed',
      'result',
      'actions',
    ]) ||
    value.version !== 1 ||
    !safeInt(value.hand, 1) ||
    !safeInt(value.tableSize, 2) ||
    value.tableSize > 9 ||
    !safeInt(value.button) ||
    value.button >= value.tableSize ||
    !safeInt(value.smallBlind, 1) ||
    !safeInt(value.bigBlind, 2) ||
    value.smallBlind >= value.bigBlind ||
    value.bigBlind > 100000
  )
    return false;
  const count = value.tableSize;
  if (
    !Array.isArray(value.holes) ||
    value.holes.length !== count ||
    !value.holes.every(
      (hole) => Array.isArray(hole) && hole.length === 2 && hole.every(card),
    ) ||
    !Array.isArray(value.board) ||
    !boardLengths.includes(value.board.length) ||
    !value.board.every(card) ||
    new Set([...value.holes.flat(), ...value.board]).size !==
      count * 2 + value.board.length ||
    !boolList(value.folded, count) ||
    !chipList(value.startingStacks, count, 1) ||
    !chipList(value.stacks, count) ||
    !chipList(value.committed, count) ||
    !Array.isArray(value.actions) ||
    value.actions.length > MAX_REPLAY_ACTIONS
  )
    return false;
  const finalFolded = value.folded;
  const startingStacks = value.startingStacks;
  const finalStacks = value.stacks;
  const finalCommitted = value.committed;
  const result = value.result;
  if (
    !isObject(result) ||
    !keysOnly(result, [
      'winner',
      'winners',
      'reason',
      'pot',
      'returned',
      'payouts',
      'labels',
      'pots',
    ]) ||
    !['fold', 'showdown'].includes(result.reason as string) ||
    !safeInt(result.pot) ||
    !seatList(result.winners, count) ||
    !chipList(result.returned, count) ||
    !chipList(result.payouts, count) ||
    !Array.isArray(result.labels) ||
    result.labels.length !== count ||
    !result.labels.every((label) => text(label, 64)) ||
    !Array.isArray(result.pots) ||
    result.pots.length > count ||
    !result.pots.every((pot) => {
      if (
        !isObject(pot) ||
        !keysOnly(pot, ['amount', 'eligible', 'winners']) ||
        !safeInt(pot.amount, 1) ||
        !seatList(pot.eligible, count) ||
        pot.eligible.length === 0 ||
        !seatList(pot.winners, count) ||
        pot.winners.length === 0
      )
        return false;
      const eligible = pot.eligible;
      return (
        eligible.every((seat) => !finalFolded[seat]) &&
        pot.winners.every((seat) => eligible.includes(seat))
      );
    })
  )
    return false;
  const payouts = result.payouts;
  const returned = result.returned;
  if (
    result.winner !==
      (result.winners.length === 1 ? result.winners[0] : 'tie') ||
    !sameNumbers(
      result.winners,
      result.payouts.flatMap((payout, seat) => (payout > 0 ? [seat] : [])),
    ) ||
    result.pot !== sum(value.committed) ||
    result.pot !== sum(result.payouts) ||
    result.pot !== sum(result.pots.map((pot) => pot.amount)) ||
    sum(value.stacks) !== sum(value.startingStacks) ||
    finalStacks.some(
      (chips, seat) =>
        chips !== startingStacks[seat] - finalCommitted[seat] + payouts[seat],
    )
  )
    return false;
  const live = value.folded.filter((folded) => !folded).length;
  if (
    (result.reason === 'fold' && live !== 1) ||
    (result.reason === 'showdown' && (live < 2 || value.board.length !== 5))
  )
    return false;
  // Reconstruct public chip movement to reject reordered actions, altered amounts,
  // mismatched bot diagnostics, and future cards smuggled into an earlier street.
  const bets = Array.from({ length: count }, () => 0);
  const contributed = [...bets];
  const remaining = [...value.startingStacks];
  const folded = Array.from({ length: count }, () => false);
  const smallSeat = count === 2 ? value.button : (value.button + 1) % count;
  const bigSeat = (value.button + (count === 2 ? 1 : 2)) % count;
  for (const [seat, blind] of [
    [smallSeat, value.smallBlind],
    [bigSeat, value.bigBlind],
  ]) {
    bets[seat] = Math.min(remaining[seat], blind);
    contributed[seat] += bets[seat];
    remaining[seat] -= bets[seat];
  }
  let previousStreet = 0;
  for (const [index, step] of value.actions.entries()) {
    if (
      !isObject(step) ||
      !keysOnly(step, [
        'index',
        'seat',
        'street',
        'action',
        'paid',
        'streetBet',
        'board',
        'pot',
        'call',
        'stack',
        'botTrace',
      ]) ||
      step.index !== index ||
      !safeInt(step.seat) ||
      step.seat >= count ||
      !validateReplayAction(step.action) ||
      !safeInt(step.paid) ||
      !safeInt(step.streetBet) ||
      !safeInt(step.pot) ||
      !safeInt(step.call) ||
      !safeInt(step.stack, 1) ||
      !Array.isArray(step.board)
    )
      return false;
    const street = streets.indexOf(step.street as (typeof streets)[number]);
    if (
      street < previousStreet ||
      street > previousStreet + 1 ||
      step.board.length !== boardLengths[street] ||
      !sameNumbers(step.board, value.board.slice(0, step.board.length))
    )
      return false;
    if (street !== previousStreet) bets.fill(0);
    previousStreet = street;
    const seat = step.seat;
    const currentBet = Math.max(
      street === 0 &&
        remaining.filter((chips, actor) => chips > 0 && !folded[actor]).length >
          1
        ? value.bigBlind
        : 0,
      ...bets,
    );
    const call = Math.min(
      Math.max(0, currentBet - bets[seat]),
      remaining[seat],
    );
    const reachable = contributed[seat] + call;
    if (
      folded[seat] ||
      step.stack !== remaining[seat] ||
      step.streetBet !== bets[seat] ||
      step.call !== call ||
      step.pot !==
        sum(contributed.map((chips) => Math.min(chips, reachable))) ||
      step.paid > remaining[seat]
    )
      return false;
    if (step.action.type === 'raise') {
      if (
        step.action.to <= currentBet ||
        step.paid !== step.action.to - bets[seat]
      )
        return false;
    } else if (step.action.type === 'call') {
      if (call === 0 || step.paid !== call) return false;
    } else if (step.paid !== 0 || (step.action.type === 'check' && call !== 0))
      return false;
    if (step.botTrace !== undefined) {
      const trace = step.botTrace;
      if (
        !validateBotDecisionTrace(trace) ||
        trace.seat !== seat ||
        trace.tableSize !== count ||
        trace.street !== step.street ||
        !sameNumbers(trace.hole, value.holes[seat]) ||
        !sameNumbers(trace.board, step.board) ||
        trace.pot !== step.pot ||
        trace.call !== step.call ||
        trace.bigBlind !== value.bigBlind ||
        trace.opponents !==
          folded.filter((item, actor) => !item && actor !== seat).length ||
        !sameReplayAction(trace.selectedAction, step.action)
      )
        return false;
    }
    if (step.action.type === 'fold') folded[seat] = true;
    bets[seat] += step.paid;
    contributed[seat] += step.paid;
    remaining[seat] -= step.paid;
  }
  return (
    folded.every((item, seat) => item === finalFolded[seat]) &&
    contributed.every(
      (chips, seat) => chips === finalCommitted[seat] + returned[seat],
    ) &&
    remaining.every(
      (chips, seat) =>
        chips + returned[seat] + payouts[seat] === finalStacks[seat],
    )
  );
}
