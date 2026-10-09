import { finishComputation } from './cooperative-computation.ts';
import {
  cardRank,
  cardSuit,
  cardLabel,
  rankHand,
  sampleRangeWorldsSteps,
  equityFromWorlds,
  type EquityWorld,
  type OpponentRange,
  type WeightedCombo,
} from './holdem-cards.ts';
import {
  legalActions,
  nextSeat,
  tableSeats,
  type HoldemState,
  type PokerAction,
  type Decision,
  type Seat,
  type PublicAction,
} from './holdem-engine.ts';
import type { BotDecisionTrace } from './holdem-replay.ts';
export type { BotDecisionTrace } from './holdem-replay.ts';

export type BotStyle = 'balanced' | 'careful' | 'active' | 'tricky';
export type AiDifficulty = 'casual' | 'standard' | 'advanced';
export const BOT_STYLES = {
  balanced: { label: '均衡', description: '位置、价值与半诈唬并重。' },
  careful: { label: '稳健', description: '收紧弱牌范围，偏向可靠的价值。' },
  active: { label: '积极', description: '争夺后位底池，更频繁地施压。' },
  tricky: { label: '灵活', description: '混合延迟下注、诱导与选择性诈唬。' },
} as const;
export const AI_DIFFICULTIES = {
  casual: { label: '入门', description: '范围较宽，尺度和防守有更多偏差。' },
  standard: { label: '标准', description: '结合多人权益、位置和公开行动。' },
  advanced: { label: '进阶', description: '更细的范围抽样，调整尺度与防守。' },
} as const;
export const DEFAULT_SEAT_STYLES: BotStyle[] = [
  'balanced',
  'balanced',
  'careful',
  'active',
  'tricky',
  'balanced',
  'careful',
  'active',
  'tricky',
];
export const seatStyle = (seat: Seat): BotStyle =>
  DEFAULT_SEAT_STYLES[seat] ?? 'balanced';
export const REVIEW_SAMPLES: Record<AiDifficulty, number> = {
  casual: 600,
  standard: 900,
  advanced: 1400,
};
const BOT_SAMPLES: Record<AiDifficulty, number> = {
  casual: 110,
  standard: 260,
  advanced: 500,
};
const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
export const pct = (value: number) => `${Math.round(value * 100)}%`;
type PositionState = Pick<HoldemState, 'button' | 'tableSize'>;
const positionOffset = (state: PositionState, seat: Seat) =>
  (seat - state.button + state.tableSize) % state.tableSize;
export function positionLabel(state: PositionState, seat: Seat) {
  const offset = positionOffset(state, seat);
  if (state.tableSize === 2) return offset === 0 ? '按钮 / 小盲' : '大盲';
  if (offset < 3) return ['按钮', '小盲', '大盲'][offset];
  if (offset === state.tableSize - 1) return '截止位';
  if (offset === state.tableSize - 2 && state.tableSize >= 6) return '劫持位';
  if (offset === state.tableSize - 3 && state.tableSize >= 7) return '低劫位';
  return offset === 3 ? '前位' : `前位 +${offset - 3}`;
}
function latePosition(state: PositionState, seat: Seat) {
  const offset = positionOffset(state, seat);
  return (
    offset === 0 || (state.tableSize > 3 && offset === state.tableSize - 1)
  );
}
function hasPosition(
  decision: Pick<Decision, 'button' | 'tableSize' | 'activeSeats' | 'seat'>,
) {
  const order = (seat: Seat) =>
    positionOffset(decision, seat) || decision.tableSize;
  return decision.activeSeats.every(
    (seat) => seat === decision.seat || order(seat) < order(decision.seat),
  );
}
export const nextButton = (state: HoldemState) =>
  nextSeat(state.button, 1, state.tableSize);

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}
function seedFor(value: unknown): number {
  const text = JSON.stringify(value);
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++)
    seed = Math.imul(seed ^ text.charCodeAt(index), 16777619);
  return seed >>> 0;
}
function normalizedDecisionSeed(decision: Decision, bigBlind: number) {
  const {
    action: _action,
    paid: _paid,
    effectiveRisk: _risk,
    botTrace: _trace,
    ...before
  } = decision;
  return {
    ...before,
    pot: before.pot / bigBlind,
    call: before.call / bigBlind,
    stack: before.stack / bigBlind,
    streetBet: before.streetBet / bigBlind,
    stacks: before.stacks.map((value) => value / bigBlind),
    committed: before.committed.map((value) => value / bigBlind),
    streetBets: before.streetBets.map((value) => value / bigBlind),
    lastRaise: before.lastRaise / bigBlind,
    minTo: before.minTo / bigBlind,
    maxTo: before.maxTo / bigBlind,
    history: before.history.map((action) => ({
      ...action,
      paid: action.paid / bigBlind,
      streetBet: action.streetBet / bigBlind,
      action:
        action.action.type === 'raise'
          ? { type: 'raise', to: action.action.to / bigBlind }
          : action.action,
    })),
  };
}

/** A ranking feature, NOT equity. Calibrated only for this local response model. */
function strengthFeature(hole: readonly number[], board: readonly number[]) {
  const ranks = hole.map(cardRank).sort((a, b) => b - a);
  const suited = cardSuit(hole[0]) === cardSuit(hole[1]);
  if (board.length < 3) {
    if (ranks[0] === ranks[1]) return clamp(0.43 + ranks[0] / 29);
    return clamp(
      0.08 +
        (ranks[0] + ranks[1]) / 42 +
        (suited ? 0.055 : 0) +
        (ranks[0] - ranks[1] <= 2 ? 0.035 : 0) -
        (ranks[0] - ranks[1] >= 6 ? 0.075 : 0),
    );
  }
  const hand = rankHand([...hole, ...board]);
  const base = [0.19, 0.5, 0.8, 0.87, 0.92, 0.95, 0.98, 0.995, 0.999][
    hand.category
  ];
  let value = base;
  if (hand.category === 0) value += (ranks[0] - 8) * 0.016;
  if (hand.category === 1) {
    const paired = hand.kickers[0];
    const boardRanks = [...new Set(board.map(cardRank))].sort((a, b) => b - a);
    const privatePair = hole.some((card) => cardRank(card) === paired);
    const pocketPair = ranks[0] === ranks[1];
    const kicker = Math.max(2, ...ranks.filter((rank) => rank !== paired));
    if (!privatePair) value = 0.25 + (ranks[0] - 8) * 0.012;
    else if (pocketPair && paired > boardRanks[0]) value = 0.85;
    else if (paired === boardRanks[0]) value = 0.75 + (kicker - 2) * 0.007;
    else if (paired >= boardRanks[1]) value = 0.61 + (kicker - 2) * 0.006;
    else value = 0.44 + (kicker - 2) * 0.005;
    const monotone = [0, 1, 2, 3].some(
      (suit) => board.filter((card) => cardSuit(card) === suit).length >= 3,
    );
    if (
      monotone &&
      !hole.some(
        (card) =>
          board.filter((other) => cardSuit(other) === cardSuit(card)).length >=
          3,
      )
    )
      value -= 0.055;
  }
  if (hand.category === 2) {
    const boardCounts = new Map<number, number>();
    for (const card of board)
      boardCounts.set(
        cardRank(card),
        (boardCounts.get(cardRank(card)) ?? 0) + 1,
      );
    const privatePairs = hand.kickers
      .slice(0, 2)
      .filter(
        (rank) =>
          hole.some((card) => cardRank(card) === rank) &&
          (boardCounts.get(rank) ?? 0) < 2,
      );
    if (privatePairs.length === 0) value = 0.3 + (ranks[0] - 8) * 0.012;
    else if (
      privatePairs.length === 1 &&
      [...boardCounts.values()].some((count) => count >= 2)
    ) {
      const rank = privatePairs[0];
      const boardHigh = Math.max(...board.map(cardRank));
      const kicker = Math.max(2, ...ranks.filter((value) => value !== rank));
      value =
        rank > boardHigh
          ? 0.84
          : rank === boardHigh
            ? 0.73 + (kicker - 2) * 0.006
            : 0.53 + (kicker - 2) * 0.004;
    }
  }
  if (
    hand.category === 3 &&
    board.filter((card) => cardRank(card) === hand.kickers[0]).length >= 3
  ) {
    // Public trips do not turn every unrelated pair of hole cards into a strong private hand.
    value = 0.27 + (ranks[0] - 8) * 0.015;
  } else if (hand.category === 3) {
    const trips = hand.kickers[0];
    const pocketSet = ranks[0] === trips && ranks[1] === trips;
    const privateKicker = Math.max(
      2,
      ...ranks.filter((rank) => rank !== trips),
    );
    value = pocketSet ? 0.9 + trips / 500 : 0.85 + (privateKicker - 2) * 0.008;
  }
  if (board.length < 5) value += drawFeature(hole, board) * 0.14;
  return clamp(value, 0.03, 0.999);
}
function drawFeature(hole: readonly number[], board: readonly number[]) {
  if (board.length < 3 || board.length === 5) return 0;
  const cards = [...hole, ...board];
  const suits = [0, 1, 2, 3].map(
    (suit) => cards.filter((card) => cardSuit(card) === suit).length,
  );
  const flushDraw = suits.some(
    (count, suit) =>
      count === 4 && hole.some((card) => cardSuit(card) === suit),
  );
  const ranks = new Set(cards.map(cardRank));
  if (ranks.has(14)) ranks.add(1);
  let straightDraw = false;
  for (let high = 5; high <= 14; high++) {
    const count = Array.from({ length: 5 }, (_, i) => high - i).filter((rank) =>
      ranks.has(rank),
    ).length;
    if (
      count === 4 &&
      hole.some((card) => cardRank(card) <= high && cardRank(card) >= high - 4)
    )
      straightDraw = true;
  }
  return (flushDraw ? 1 : 0) + (straightDraw ? 0.6 : 0);
}
export function quickEquity(hole: readonly number[]) {
  return strengthFeature(hole, []);
}

function styleOffset(style: BotStyle) {
  return style === 'careful'
    ? 0.065
    : style === 'active'
      ? -0.05
      : style === 'tricky'
        ? -0.015
        : 0;
}
function boardForStreet(
  board: readonly number[],
  street: PublicAction['street'],
) {
  return board.slice(0, { preflop: 0, flop: 3, turn: 4, river: 5 }[street]);
}
function rangeWeight(
  hole: readonly number[],
  decision: Pick<Decision, 'board' | 'button' | 'tableSize' | 'history'>,
  seat: Seat,
  style: BotStyle,
  strengthCache: Map<string, number>,
) {
  const position = positionOffset(decision, seat);
  const openingThreshold =
    decision.tableSize === 2
      ? position === 0
        ? 0.43
        : 0.49
      : position === 0
        ? 0.48
        : position === 1
          ? decision.tableSize > 4
            ? 0.55
            : 0.5
          : position === 2
            ? 0.54
            : position === decision.tableSize - 1
              ? 0.56
              : position === decision.tableSize - 2
                ? 0.6
                : 0.64 + Math.max(0, decision.tableSize - 6) * 0.01;
  let weight = 1;
  const history = decision.history.filter((action) => action.seat === seat);
  for (const action of history) {
    const board = boardForStreet(decision.board, action.street);
    const key = `${Math.min(...hole) * 52 + Math.max(...hole)}|${board.join(',')}`;
    let strength = strengthCache.get(key);
    if (strength === undefined) {
      strength = strengthFeature(hole, board);
      strengthCache.set(key, strength);
    }
    const raiseBefore = decision.history.some(
      (prior) =>
        prior !== action &&
        prior.street === action.street &&
        prior.action.type === 'raise' &&
        decision.history.indexOf(prior) < decision.history.indexOf(action),
    );
    const threshold =
      (action.street === 'preflop'
        ? raiseBefore
          ? 0.63
          : openingThreshold
        : 0.54) + styleOffset(style);
    if (action.action.type === 'raise') {
      const bluff =
        style === 'active'
          ? 0.1
          : style === 'tricky'
            ? 0.09
            : style === 'careful'
              ? 0.02
              : 0.055;
      weight *= bluff + (1 - bluff) * sigmoid((strength - threshold) * 13);
    } else if (action.action.type === 'call') {
      weight *= 0.03 + 0.92 * sigmoid((strength - threshold + 0.09) * 11);
    } else if (action.action.type === 'check') {
      // Checking is not proof of weakness; retain slowplays and the full checking range.
      weight *=
        style === 'tricky' ? 0.9 : 1 - 0.25 * sigmoid((strength - 0.8) * 10);
    }
  }
  return Math.max(0.002, weight);
}

export function buildOpponentRanges(
  hole: readonly number[],
  decision: Pick<
    Decision,
    'board' | 'button' | 'tableSize' | 'history' | 'activeSeats' | 'seat'
  >,
  styles: readonly BotStyle[] = DEFAULT_SEAT_STYLES,
): OpponentRange[] {
  return finishComputation(buildOpponentRangesSteps(hole, decision, styles));
}

function* buildOpponentRangesSteps(
  hole: readonly number[],
  decision: Pick<
    Decision,
    'board' | 'button' | 'tableSize' | 'history' | 'activeSeats' | 'seat'
  >,
  styles: readonly BotStyle[] = DEFAULT_SEAT_STYLES,
): Generator<void, OpponentRange[]> {
  const known = new Set([...hole, ...decision.board]);
  const remaining = Array.from({ length: 52 }, (_, card) => card).filter(
    (card) => !known.has(card),
  );
  const strengthCache = new Map<string, number>();
  const ranges: OpponentRange[] = [];
  for (const seat of decision.activeSeats.filter(
    (seat) => seat !== decision.seat,
  )) {
    const combos: WeightedCombo[] = [];
    for (let i = 0; i < remaining.length; i++)
      for (let j = i + 1; j < remaining.length; j++) {
        const cards: [number, number] = [remaining[i], remaining[j]];
        if (combos.length % 24 === 0) yield;
        combos.push({
          cards,
          weight: rangeWeight(
            cards,
            decision,
            seat as Seat,
            styles[seat] ?? 'balanced',
            strengthCache,
          ),
        });
      }
    ranges.push({ seat, combos });
  }
  return ranges;
}
function snapshot(state: HoldemState, seat: Seat): Decision {
  const legal = legalActions(state);
  if (!legal || legal.seat !== seat)
    throw new Error('策略请求必须属于当前行动者。');
  return {
    seat,
    street: state.street as Decision['street'],
    board: [...state.board],
    button: state.button,
    tableSize: state.tableSize,
    pot: legal.pot,
    call: legal.call,
    stack: state.stacks[seat],
    streetBet: state.streetBets[seat],
    action: { type: 'check' },
    paid: 0,
    effectiveRisk: 0,
    activeSeats: tableSeats(state).filter((player) => !state.folded[player]),
    stacks: [...state.stacks],
    committed: [...state.committed],
    streetBets: [...state.streetBets],
    folded: [...state.folded],
    lastRaise: state.lastRaise,
    raiseOpen: legal.canRaise,
    minTo: legal.minTo,
    maxTo: legal.maxTo,
    history: state.actions.map(
      ({ seat: player, street, action, paid, streetBet }) => ({
        seat: player,
        street,
        action,
        paid,
        streetBet,
      }),
    ),
  };
}

export type BotHandFeatures = {
  draw: number;
  aceBlocker: boolean;
  nutBlocker?: boolean;
  showdownValue?: boolean;
};
export function chooseBotPolicy(
  state: HoldemState,
  equity: number,
  style: BotStyle,
  random = Math.random,
  difficulty: AiDifficulty = 'standard',
  handFeatures: BotHandFeatures = {
    draw: 0,
    aceBlocker: false,
  },
) {
  const legal = legalActions(state);
  if (!legal) throw new Error('没有可行动的玩家');
  const seat = legal.seat;
  const opponents = tableSeats(state).filter(
    (player) => player !== seat && !state.folded[player],
  ).length;
  const multiway = Math.max(0, opponents - 1);
  const inPosition = hasPosition({
    button: state.button,
    tableSize: state.tableSize,
    seat,
    activeSeats: tableSeats(state).filter((player) => !state.folded[player]),
  });
  const aggression =
    style === 'active'
      ? 1.3
      : style === 'careful'
        ? 0.6
        : style === 'tricky'
          ? 1.08
          : 1;
  const errors =
    difficulty === 'casual' ? 0.14 : difficulty === 'standard' ? 0.045 : 0.015;
  const roll = random();
  const equityJitterRoll = random();
  const adjusted = clamp(equity + (equityJitterRoll - 0.5) * errors);
  const effective = Math.min(
    state.stacks[seat],
    Math.max(
      0,
      ...tableSeats(state)
        .filter((player) => player !== seat && !state.folded[player])
        .map((player) => state.stacks[player]),
    ),
  );
  const spr = effective / Math.max(1, legal.pot);
  const futureBetting = state.street !== 'river' && spr > 1.3;
  const realized =
    difficulty === 'advanced' && futureBetting
      ? adjusted * (inPosition ? 0.97 : 0.88 - Math.min(0.07, multiway * 0.025))
      : adjusted;
  const priorRaises = state.actions.filter(
    (action) => action.street === 'preflop' && action.action.type === 'raise',
  );
  const lastAggressor = priorRaises.at(-1)?.seat;
  const cbet =
    state.street === 'flop' &&
    lastAggressor === seat &&
    legal.call === 0 &&
    !state.actions.some(
      (action) => action.street === 'flop' && action.action.type === 'raise',
    );
  const unopened = state.street === 'preflop' && priorRaises.length === 0;
  const steal = unopened && latePosition(state, seat);
  const bigValue =
    adjusted >
    (state.street === 'preflop'
      ? 0.48 - multiway * 0.018
      : 0.62 - multiway * 0.04);
  const value = adjusted > 0.48 - multiway * 0.045;
  const heroCalls = state.actions.filter(
    (action) => action.seat === 0 && action.action.type === 'call',
  ).length;
  const advancedDraw = difficulty === 'advanced' && handFeatures.draw > 0;
  const allInOpponents = tableSeats(state).filter(
    (player) =>
      player !== seat && !state.folded[player] && state.stacks[player] === 0,
  ).length;
  // Pure bluffs need a foldable target and little showdown value. A generic
  // ace is not a river nut blocker; only decision-time board-specific removal
  // supports that adjustment. No pure bluff can win a contested all-in pot.
  const pureBluffEligible =
    legal.canRaise &&
    allInOpponents === 0 &&
    !handFeatures.showdownValue &&
    !bigValue;
  const bluffRate =
    ((style === 'active'
      ? 0.105
      : style === 'tricky'
        ? 0.095
        : style === 'careful'
          ? 0.02
          : 0.06) /
      (1 + multiway * 2.6)) *
    (inPosition ? 1.25 : 0.8) *
    (steal ? 1.8 : cbet ? 1.3 : 1) *
    (opponents >= 4 ? 0.35 : 1);
  const selectiveBluff =
    difficulty === 'advanced'
      ? (bluffRate *
          (advancedDraw
            ? 1.8
            : handFeatures.nutBlocker && state.street === 'river'
              ? 1.45
              : 0.65)) /
        (1 + heroCalls * 0.35)
      : bluffRate;
  const pureBluffProbability = pureBluffEligible
    ? clamp(selectiveBluff, 0, 0.3)
    : 0;
  const semiBluffEligible =
    legal.canRaise &&
    advancedDraw &&
    allInOpponents === 0 &&
    inPosition &&
    opponents <= 2;
  const semiBluffProbability = semiBluffEligible
    ? (legal.call ? 0.16 : 0.2) / (1 + multiway * 2.6)
    : 0;
  const bluffEligible = pureBluffEligible || semiBluffEligible;
  const bluffProbability = Math.max(pureBluffProbability, semiBluffProbability);
  const bluff = roll < pureBluffProbability;
  const semiBluff = roll < semiBluffProbability;
  const finish = (action: PokerAction, intent: string, reason: string) => ({
    action,
    intent,
    rationale: [
      reason,
      `${positionLabel(state, seat)}面对 ${opponents} 位对手；可争夺底池 ${legal.pot}，跟注 ${legal.call}。策略权益 ${(equity * 100).toFixed(1)}%，扰动后 ${(adjusted * 100).toFixed(1)}%，兑现代理 ${(realized * 100).toFixed(1)}%。`,
      `实际混合抽样为 ${roll.toFixed(3)}；本局部策略诈唬触发阈值 ${bluffProbability.toFixed(3)}${allInOpponents ? '，全下主池不能靠弃牌赢走，本策略保守取消诈唬分支；边池可能有弃牌收益，未在此展开' : ''}。这些阈值来自本地启发式，不是求解器混合频率。`,
    ],
    mixing: {
      roll,
      equityJitterRoll,
      adjustedEquity: adjusted,
      realizedEquity: realized,
      bluffProbability,
      bluffEligible,
      bluffTriggered: intent === 'bluff' || intent === 'semi-bluff',
      draw: handFeatures.draw,
      blocker: Boolean(handFeatures.nutBlocker),
      inPosition,
      cbet,
      steal,
    },
  });
  const raiseTo = () => {
    let size: number;
    if (state.street === 'preflop') {
      size = unopened
        ? state.bigBlind * (inPosition ? 2.4 : 3)
        : Math.max(...state.streetBets) * (inPosition ? 3.1 : 3.6);
      size +=
        state.bigBlind *
        state.actions.filter(
          (action) =>
            action.street === 'preflop' && action.action.type === 'call',
        ).length;
    } else {
      const wetBoard = state.board.some(
        (card) =>
          state.board.filter((other) => cardSuit(other) === cardSuit(card))
            .length >= 2,
      );
      let fraction = bigValue
        ? style === 'tricky'
          ? 0.5
          : 0.75
        : cbet && multiway === 0
          ? 0.33
          : 0.5;
      if (difficulty === 'advanced')
        fraction =
          bigValue && wetBoard
            ? 0.8
            : cbet && !wetBoard && multiway === 0
              ? 0.3
              : 0.55;
      if (difficulty === 'casual' && roll < 0.3) fraction = 1.05;
      size =
        Math.max(...state.streetBets) +
        Math.max(state.bigBlind, (legal.pot + legal.call) * fraction);
      if (difficulty === 'advanced' && bigValue && spr < 1.1)
        size = legal.maxTo;
    }
    return Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(size)));
  };
  if (legal.call > 0) {
    const margin =
      (style === 'careful' ? 0.065 : style === 'active' ? 0.01 : 0.035) +
      multiway * 0.013;
    const cheapBlind =
      state.street === 'preflop' && legal.owed <= state.bigBlind;
    const looseCall = difficulty === 'casual' && roll < 0.13;
    if (
      realized < legal.potOdds + margin &&
      !(cheapBlind && realized > 0.22) &&
      !bluff &&
      !semiBluff &&
      !looseCall
    )
      return finish(
        { type: 'fold' },
        'price-fold',
        `兑现代理低于静态赔率加防守余量：${pct(realized)} < ${pct(legal.potOdds + margin)}，没有命中合法诈唬或宽松跟注分支。`,
      );
    if (legal.canRaise) {
      if (bigValue && roll < 0.72 * aggression)
        return finish(
          { type: 'raise', to: raiseTo() },
          'value',
          `强权益价值加注分支命中：${pct(adjusted)} 超过强牌阈值，${roll.toFixed(3)} < ${(0.72 * aggression).toFixed(3)}；尺度由当前街、牌面和SPR生成。`,
        );
      if (value && steal && roll < 0.55 * aggression)
        return finish(
          { type: 'raise', to: raiseTo() },
          'steal',
          `未加注底池的后位隔离分支命中，${roll.toFixed(3)} < ${(0.55 * aggression).toFixed(3)}；位置允许争夺底池，但仍需要现有权益。`,
        );
      if (semiBluff)
        return finish(
          { type: 'raise', to: raiseTo() },
          'semi-bluff',
          `听牌半诈唬分支命中：补牌特征 ${handFeatures.draw.toFixed(1)}、有位置且无全下对手，${roll.toFixed(3)} < ${semiBluffProbability.toFixed(3)}。`,
        );
      if (bluff)
        return finish(
          { type: 'raise', to: raiseTo() },
          handFeatures.draw ? 'semi-bluff' : 'bluff',
          `选择性${handFeatures.draw ? '半诈唬' : '诈唬'}分支命中，${roll.toFixed(3)} < ${pureBluffProbability.toFixed(3)}${handFeatures.nutBlocker ? '；持有牌面相关坚果阻挡牌' : ''}。对手均仍能弃牌，人数增加已降低触发率。`,
        );
    }
    return finish(
      { type: 'call' },
      looseCall && realized < legal.potOdds + margin
        ? 'loose-call'
        : 'price-call',
      looseCall && realized < legal.potOdds + margin
        ? '入门档宽松跟注分支被实际抽样命中；这是可见策略偏差，不是均衡跟注依据。'
        : `保留摊牌权益：当前价格通过防守条件，或可低成本防守盲注；未命中价值或合法诈唬加注分支。`,
    );
  }
  if (legal.canRaise) {
    const valueProbability = (style === 'tricky' ? 0.44 : 0.68) * aggression;
    if (value && roll < valueProbability)
      return finish(
        { type: 'raise', to: raiseTo() },
        'value',
        `价值下注分支命中：权益 ${pct(adjusted)} 超过价值阈值，${roll.toFixed(3)} < ${valueProbability.toFixed(3)}；按实际底池生成下注尺度。`,
      );
    if (
      cbet &&
      allInOpponents === 0 &&
      adjusted > 0.34 &&
      roll < 0.42 / (1 + multiway * 1.8)
    )
      return finish(
        { type: 'raise', to: raiseTo() },
        'continuation',
        `翻牌前主动加注者的持续下注分支命中：当前权益高于34%，${roll.toFixed(3)} < ${(0.42 / (1 + multiway * 1.8)).toFixed(3)}；多人底池已减少频率。`,
      );
    if (semiBluff)
      return finish(
        { type: 'raise', to: raiseTo() },
        'semi-bluff',
        `有位置的听牌半诈唬分支命中：补牌特征 ${handFeatures.draw.toFixed(1)}，${roll.toFixed(3)} < ${semiBluffProbability.toFixed(3)}；没有不能弃牌的全下对手。`,
      );
    if (bluff)
      return finish(
        { type: 'raise', to: raiseTo() },
        handFeatures.draw ? 'semi-bluff' : 'bluff',
        `选择性${handFeatures.draw ? '半诈唬' : '诈唬'}分支命中，${roll.toFixed(3)} < ${pureBluffProbability.toFixed(3)}${handFeatures.nutBlocker ? '；牌面相关坚果阻挡牌提高了触发权重' : ''}，没有把任意A自动当成河牌阻挡牌。`,
      );
  }
  return finish(
    { type: 'check' },
    'check',
    '免费过牌分支：本次没有触发价值、持续下注或合法诈唬加注，保留摊牌与后续重新判断的机会。',
  );
}

export function chooseBotAction(
  state: HoldemState,
  equity: number,
  style: BotStyle,
  random = Math.random,
  difficulty: AiDifficulty = 'standard',
  handFeatures: BotHandFeatures = { draw: 0, aceBlocker: false },
): PokerAction {
  return chooseBotPolicy(state, equity, style, random, difficulty, handFeatures)
    .action;
}

export function botHandFeatures(
  hole: readonly number[],
  board: readonly number[],
): BotHandFeatures {
  const hand = board.length >= 3 ? rankHand([...hole, ...board]) : null;
  const flushSuit = [0, 1, 2, 3].find(
    (suit) => board.filter((card) => cardSuit(card) === suit).length >= 3,
  );
  const quality = strengthFeature(hole, board);
  return {
    draw: drawFeature(hole, board),
    aceBlocker: hole.some((card) => cardRank(card) === 14),
    nutBlocker:
      flushSuit !== undefined &&
      hole.some(
        (card) => cardRank(card) === 14 && cardSuit(card) === flushSuit,
      ),
    showdownValue: hand
      ? quality >= 0.6 && hand.category >= 1
      : quality >= 0.67,
  };
}

export function decideBot(
  state: HoldemState,
  seat: Seat,
  style: BotStyle,
  difficulty: AiDifficulty = 'standard',
  styles: BotStyle[] = DEFAULT_SEAT_STYLES,
) {
  return finishComputation(
    decideBotSteps(state, seat, style, difficulty, styles),
  );
}

export function* decideBotSteps(
  state: HoldemState,
  seat: Seat,
  style: BotStyle,
  difficulty: AiDifficulty = 'standard',
  styles: BotStyle[] = DEFAULT_SEAT_STYLES,
) {
  const decision = snapshot(state, seat);
  const hole = state.holes[seat]; // Information firewall: only the acting player's cards.
  const ranges = yield* buildOpponentRangesSteps(hole, decision, styles);
  const seed = seedFor({
    hand: state.hand,
    seat,
    hole,
    decision: normalizedDecisionSeed(decision, state.bigBlind),
    difficulty,
    style,
  });
  const worlds = yield* sampleRangeWorldsSteps(
    hole,
    decision.board,
    ranges,
    BOT_SAMPLES[difficulty],
    seededRandom(seed),
  );
  const estimate = equityFromWorlds(worlds);
  const weightedEquity = projectedPotEquity(decision, worlds, ranges);
  const policy = chooseBotPolicy(
    state,
    weightedEquity,
    style,
    seededRandom(seed ^ 0xa71ef3),
    difficulty,
    botHandFeatures(hole, decision.board),
  );
  let action = policy.action;
  let override: BotDecisionTrace['override'];
  // A decision-specific EV check handles side pots and players still owing chips;
  // a single current pot-odds threshold cannot represent those situations.
  if (
    decision.call &&
    difficulty !== 'casual' &&
    (action.type === 'fold' || action.type === 'call')
  ) {
    const callValues = yield* candidateValuesSteps(
      decision,
      { type: 'call' },
      worlds,
      ranges,
      styles,
    );
    const callEV = mean(callValues);
    const tolerance =
      1.96 * standardError(callValues) +
      state.bigBlind * (difficulty === 'advanced' ? 0.15 : 0.35);
    if (callEV > tolerance) action = { type: 'call' };
    else if (callEV < -tolerance) action = { type: 'fold' };
    override = {
      reason: 'call-ev',
      from: policy.action,
      to: action,
      callEVBB: callEV / state.bigBlind,
      toleranceBB: tolerance / state.bigBlind,
      changed: actionKey(action) !== actionKey(policy.action),
    };
  }
  const diagnosticOptions = [
    ...new Map(
      [
        ...candidates({ ...decision, action }, state.bigBlind),
        policy.action,
      ].map((candidate) => [actionKey(candidate), candidate]),
    ).values(),
  ];
  const featureCache = new Map<number, ModelHandFeatures>();
  const diagnosticValues: number[][] = [];
  for (const candidate of diagnosticOptions)
    diagnosticValues.push(
      yield* candidateValuesSteps(
        decision,
        candidate,
        worlds,
        ranges,
        styles,
        featureCache,
      ),
    );
  const rationale = [...policy.rationale];
  if (override)
    rationale.push(
      `实际执行跟注EV核对：跟注估值 ${override.callEVBB.toFixed(2)} BB，抽样加策略容差 ±${override.toleranceBB.toFixed(2)} BB；${override.changed ? `从${actionLabel(policy.action, decision.call)}改为${actionLabel(action, decision.call)}` : '保留原策略动作'}。此核对处理可争夺边池和待行动玩家，不是均衡求解。`,
    );
  rationale.push(
    '候选EV在决策当时用相同合法抽样计算，是一轮响应诊断；行动仍按上述真实混合分支及跟注核对执行，并非选择候选表最高值。',
  );
  const trace: BotDecisionTrace = {
    seat,
    tableSize: decision.tableSize,
    street: decision.street,
    hole: [...hole],
    board: [...decision.board],
    pot: decision.pot,
    call: decision.call,
    bigBlind: state.bigBlind,
    position: positionLabel(decision, seat),
    opponents: ranges.length,
    equity: weightedEquity,
    rawEquity: estimate.equity,
    samples: estimate.samples,
    style,
    difficulty,
    selectedAction: action,
    policyAction: policy.action,
    selectedIntent: override?.changed
      ? action.type === 'call'
        ? 'ev-call'
        : 'ev-fold'
      : policy.intent,
    rationale,
    mixing: policy.mixing,
    candidates: diagnosticOptions.map((candidate, index) => ({
      action: candidate,
      evBB: mean(diagnosticValues[index]) / state.bigBlind,
      standardErrorBB: standardError(diagnosticValues[index]) / state.bigBlind,
    })),
    ...(override ? { override } : {}),
  };
  return { action, equity: weightedEquity, samples: estimate.samples, trace };
}

/** Chip-weighted equity over only the layers this caller can contest, assuming
 * outstanding current wagers are matched. A short all-in winning the main pot
 * does not incorrectly erase equity in a larger, reachable side pot. */
export function projectedPotEquity(
  decision: Decision,
  worlds: readonly EquityWorld[],
  ranges: readonly OpponentRange[],
) {
  const contributions = [...decision.committed];
  contributions[decision.seat] += decision.call;
  const target = Math.max(
    ...decision.streetBets,
    decision.streetBet + decision.call,
  );
  for (const range of ranges) {
    const seat = range.seat;
    contributions[seat] += Math.min(
      decision.stacks[seat],
      Math.max(0, target - decision.streetBets[seat]),
    );
  }
  const levels = [...new Set(contributions.filter((value) => value > 0))].sort(
    (a, b) => a - b,
  );
  let previous = 0;
  let contestable = 0;
  let expectedReturn = 0;
  for (const level of levels) {
    const contributors = tableSeats(contributions.length).filter(
      (seat) => contributions[seat] >= level,
    );
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (contributors.length < 2 || !contributors.includes(decision.seat))
      continue;
    const eligible = contributors.filter((seat) => !decision.folded[seat]);
    contestable += amount;
    for (const world of worlds) {
      const rankFor = (seat: Seat) =>
        seat === decision.seat
          ? world.ranks[0]
          : world.ranks[ranges.findIndex((range) => range.seat === seat) + 1];
      const best = Math.max(...eligible.map(rankFor));
      const winners = eligible.filter((seat) => rankFor(seat) === best);
      if (winners.includes(decision.seat))
        expectedReturn += amount / winners.length / worlds.length;
    }
  }
  return contestable ? clamp(expectedReturn / contestable) : 0;
}

export type ReviewAlternative = {
  action: PokerAction;
  label: string;
  evBB: number;
  standardErrorBB: number;
  score: number;
  /** Extreme effective investment makes the local response model sensitive. */
  scoreSensitive?: boolean;
  scoreGapBB?: number;
  comparison?: 'clear' | 'close' | 'sensitive';
  reason: string;
};
export type ReviewExplanation = {
  conclusion: string;
  reasons: string[];
  purpose: string;
  sizing: string;
  alternatives: string[];
  nextQuestion: string;
  gtoContext: string;
};
export type ReviewPoint = {
  index: number;
  street: Decision['street'];
  action: string;
  equity: number;
  samples: number;
  pot: number;
  call: number;
  threshold: number | null;
  title: string;
  advice: string;
  principle: string;
  board: number[];
  score: number;
  scoreSensitive?: boolean;
  /** Raw EV loss relative to the strongest non-sensitive candidate. */
  scoreGapBB?: number;
  comparison?: 'clear' | 'close' | 'sensitive';
  scoreReference?: { action: PokerAction; label: string; evBB: number };
  recommendation: { action: PokerAction; label: string; evBB: number };
  alternatives: ReviewAlternative[];
  regretBB: number;
  confidence: 'low' | 'medium';
  uncertaintyBB: number;
  position: string;
  opponents: number;
  spr: number;
  rangeNotes: string[];
  model: string;
  limitations: string[];
  /** Sensitivity allowance for the heuristic model, not a statistical confidence interval. */
  modelAllowanceBB?: number;
  /** Optional only for older locally stored hands; newly computed reviews always include it. */
  explanations?: ReviewExplanation;
};
const actionLabel = (action: PokerAction, call: number) =>
  action.type === 'raise'
    ? `加注到 ${action.to}`
    : action.type === 'call'
      ? `跟注 ${call}`
      : action.type === 'check'
        ? '过牌'
        : '弃牌';
const actionKey = (action: PokerAction) =>
  action.type === 'raise' ? `raise:${action.to}` : action.type;
const rankLabel = (rank: number) =>
  ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[rank] ?? `${rank}`;

function handContext(hole: readonly number[], decision: Decision) {
  const ranks = hole.map(cardRank).sort((a, b) => b - a);
  const board = decision.board;
  const notes: string[] = [];
  const draw = drawFeature(hole, board);
  const missedDraw =
    board.length === 5 &&
    drawFeature(hole, board.slice(0, 4)) > 0 &&
    rankHand([...hole, ...board]).category < 4;
  const privateValue =
    board.length >= 3 && strengthFeature(hole, board) >= 0.72;
  const blocker = botHandFeatures(hole, board).nutBlocker;
  let madeCategory = -1;
  let playsBoard = false;
  if (board.length < 3) {
    const type =
      ranks[0] === ranks[1]
        ? `${rankLabel(ranks[0])}${rankLabel(ranks[1])} 口袋对子`
        : `${rankLabel(ranks[0])}${rankLabel(ranks[1])}${cardSuit(hole[0]) === cardSuit(hole[1]) ? '同花' : '不同花'}`;
    notes.push(
      `起手牌是 ${type}。${ranks[0] === ranks[1] && ranks[0] <= 9 ? '中小对子常需要控制投入，深筹码时考虑成三条后的隐含赔率。' : ranks[1] >= 10 ? '高张能够组成强顶对，但面对紧范围的再加注仍可能被支配。' : cardSuit(hole[0]) === cardSuit(hole[1]) && ranks[0] - ranks[1] <= 2 ? '同花且相近的点数有成顺与成花潜力，位置和筹码深度会影响兑现。' : '不要把一张高牌或低成本入池自动当成有利跟注。'}`,
    );
    notes.push(
      '翻牌前的一轮摊牌模型尤其简化了后续取值与被支配风险，不能把候选排名当作开局范围表。',
    );
  } else {
    const hand = rankHand([...hole, ...board]);
    madeCategory = hand.category;
    playsBoard = board.length === 5 && rankHand(board).value === hand.value;
    const boardPair =
      hand.category === 1 &&
      !hole.some((card) => cardRank(card) === hand.kickers[0]);
    notes.push(
      `决策当时已成牌型为${hand.label}${boardPair ? '，其中对子来自公共牌，不能按私人强对子取值' : ''}。${draw ? '还有补牌潜力，半诈唬价值来自弃牌收益与被跟注后的权益两部分。' : hand.category <= 1 ? '这类摊牌牌力通常需要控制底池，尤其要警惕多人跟注后范围变强。' : '先识别会继续投入的更弱成牌，再决定价值下注尺度。'}`,
    );
    if (playsBoard)
      notes.push(
        '你的最佳五张牌完全来自公共牌，不能把公共强牌当成自己的专属优势；尤其留意分池而非独赢的可能性。',
      );
    if (missedDraw)
      notes.push(
        `转牌时的听牌没有在河牌补成。${hand.category === 0 ? '剩余高牌摊牌价值较低，但能否诈唬仍要识别可信弃牌对象和阻挡牌。' : '仍保留现有成牌的摊牌价值，不要把所有错过的听牌自动转成诈唬。'}`,
      );
    const suitCounts = [0, 1, 2, 3].map(
      (suit) => board.filter((card) => cardSuit(card) === suit).length,
    );
    const flushSuit = suitCounts.findIndex((count) => count >= 3);
    if (flushSuit >= 0)
      notes.push('公共牌已有三张以上同花色，不能忽略对手的成花组合。');
    if (new Set(board.map(cardRank)).size < board.length)
      notes.push('公共牌配对，三条与葫芦相关组合会改变强牌和诈唬的相对价值。');
    const nutBlocker = hole.find(
      (card) => cardRank(card) === 14 && cardSuit(card) === flushSuit,
    );
    if (nutBlocker !== undefined)
      notes.push(
        `你的 ${cardLabel(nutBlocker)} 移除了对手该花色 A 高同花的组合；阻挡牌能影响继续范围，但不能代替弃牌率与底池价格。`,
      );
    else if (ranks[0] === 14)
      notes.push(
        '你持有 A，移除了部分 AA、AK 组合；这只是范围修正，不能仅凭一个 A 判断诈唬成功。',
      );
  }
  return {
    notes,
    draw,
    madeCategory,
    playsBoard,
    missedDraw,
    privateValue,
    blocker,
  };
}

function bluffLesson(
  action: PokerAction,
  decision: Decision,
  hand: ReturnType<typeof handContext>,
) {
  if (action.type !== 'raise')
    return hand.missedDraw
      ? '河牌错过听牌时，先比较现有摊牌价值与对手会弃掉的更强组合；没有合适阻挡牌和弃牌对象，不必自动诈唬。'
      : '';
  const opponents = decision.activeSeats.filter(
    (seat) => seat !== decision.seat,
  );
  const risk = Math.min(
    action.to - decision.streetBet,
    Math.max(
      0,
      ...opponents.map(
        (seat) =>
          decision.streetBets[seat] +
          decision.stacks[seat] -
          decision.streetBet,
      ),
    ),
  );
  const allIns = opponents.filter((seat) => decision.stacks[seat] === 0).length;
  if (allIns)
    return '存在全下对手，通过弃牌直接赢走全部可争夺底池的概率为0；可另考虑边池价值，但不能把主池当纯诈唬奖励。';
  const required = risk / Math.max(1, decision.pot + risk);
  return `仅作纯诈唬的静态参照：若被跟注必输，用新增有效风险 ${risk} 争夺现有底池 ${decision.pot}，需要所有对手一起弃牌约 ${pct(required)}（风险 / (风险 + 底池)）。${hand.draw ? '这手有补牌权益，半诈唬可从被跟注后补成获得价值，不能直接套用必输公式。' : hand.privateValue ? '这手已有私人牌力，下注先找更弱牌取值，不能按纯诈唬解释。' : hand.missedDraw ? '河牌错过听牌已没有未来补牌权益，需要真实弃牌对象。' : '这只是忽略后续下注的盈亏平衡示例，不是最佳诈唬频率。'}${hand.blocker ? '当前持有牌面相关A高同花阻挡牌，移除了对手部分强继续组合；仍需核对会弃的范围。' : '任意A不等于当前牌面的坚果阻挡牌。'}`;
}

function rangeDescription(decision: Decision, seat: Seat, style: BotStyle) {
  const history = decision.history.filter((action) => action.seat === seat);
  const latest = history.at(-1);
  const raises = history.filter(
    (action) => action.action.type === 'raise',
  ).length;
  const calls = history.filter(
    (action) => action.action.type === 'call',
  ).length;
  const observed = latest
    ? `已见 ${history.length} 次行动，最近${actionLabel(latest.action, latest.paid)}（${({ preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌' } as const)[latest.street]}）`
    : '尚无主动行动，起始范围保留全部合法底牌';
  const interpretation = raises
    ? `加注 ${raises} 次使强牌权重提高，同时保留${style === 'careful' ? '较少' : '一定'}诈唬组合`
    : calls
      ? `跟注 ${calls} 次收紧了继续范围，但不等于只有坚果牌`
      : latest?.action.type === 'check'
        ? '过牌仍可能包含强牌与慢打，未把过牌直接视作弱牌'
        : '不会在其行动前凭位置或风格假定其已经弃掉弱牌';
  const checkNote =
    latest?.action.type === 'check' && raises
      ? '；最近过牌也可能是控池或慢打'
      : '';
  return `${positionLabel(decision, seat)} · ${BOT_STYLES[style].label}：${observed}；${interpretation}${checkNote}。所有组合均排除你的底牌与当时公共牌。`;
}

function recommendationReason(
  action: PokerAction,
  decision: Decision,
  equity: number,
  opponents: number,
  hand: ReturnType<typeof handContext>,
) {
  const allIns = decision.activeSeats.filter(
    (seat) => seat !== decision.seat && decision.stacks[seat] === 0,
  ).length;
  if (action.type === 'fold')
    return '思路是先保护剩余筹码：比较跟注价格与对手公开行动收紧后的范围；多人继续时，被支配和后位再加注的风险更大。这里只说明本模型下弃牌较划算，不因最后输赢倒推决策。';
  if (action.type === 'check')
    return '思路是利用免费过牌保留摊牌权益，并避免把底池扩大到只剩更强牌跟注。强牌也可留在过牌范围，但本模型没有计算诱导对手后续下注的额外收益。';
  if (action.type === 'call')
    return `思路是按当前价格保留${hand.draw ? '听牌补成与现有摊牌' : hand.madeCategory >= 2 ? '当前强牌的摊牌' : '边缘摊牌'}权益。${decision.raiseOpen ? '跟注保留较宽的对手范围，加注则可能赶走弱牌、留下更强的继续范围。' : '当前没有有效加注机会，重点比较跟注后可争夺的主池与边池。'}检查后位尚待行动的玩家，${decision.street === 'river' ? '河牌直接比较被支配与分池可能性' : '后续面对大下注仍需重新判断，赔率达标不代表必须一路跟到底'}。`;
  const likelyValue =
    !hand.playsBoard &&
    (hand.privateValue || equity > Math.max(0.43, 1 / (opponents + 1) + 0.16));
  const purpose = likelyValue
    ? '这个尺度更偏向价值取值：列出愿意跟注的较弱对子、听牌或较弱成牌，再判断更大尺度是否只留下强牌。'
    : hand.draw
      ? '这个尺度更偏向半诈唬：同时争取立即弃牌与补牌后的价值，避免把所有听牌都自动加注。'
      : '这个尺度主要争取弃牌收益或隔离更宽的范围：先问哪些更好的牌真的会弃、哪些更弱的牌会跟。';
  return `${purpose}${opponents > 1 ? '多人底池的立即获胜要求所有仍可弃牌的对手一起放弃，单人的弃牌率不能直接套用。' : '单挑时小尺度可保留较宽的跟注范围，大尺度更依赖明确价值或可信诈唬。'}${allIns ? `当前 ${allIns} 名全下对手不会弃牌，加注最多改变其他玩家及边池，不能诈唬拿走仍需摊牌的主池。` : ''}${bluffLesson(action, decision, hand)}`;
}
function teachingExplanation({
  decision,
  hole,
  recommendation,
  alternatives,
  bigBlind,
  equity,
  hand,
  position,
  spr,
  close,
  conservative,
  sizingSensitive,
}: {
  decision: Decision;
  hole: readonly number[];
  recommendation: PokerAction;
  alternatives: ReviewAlternative[];
  bigBlind: number;
  equity: number;
  hand: ReturnType<typeof handContext>;
  position: string;
  spr: number;
  close: boolean;
  conservative: boolean;
  sizingSensitive: boolean;
}): ReviewExplanation {
  const chosen = actionLabel(decision.action, decision.call);
  const recommended = actionLabel(recommendation, decision.call);
  const same = actionKey(decision.action) === actionKey(recommendation);
  const conclusion = sizingSensitive
    ? `${chosen}涉及极大投入，估值对少数强牌跟注假设很敏感；这类尺度暂不可靠评分，先把${recommended}作为稳健参照。`
    : same
      ? `推荐${recommended}：这次选择与当前公开信息下的稳健方案一致。`
      : close
        ? `${chosen}和${recommended}的估值接近；先理解两者目的，不因这手输赢判错。`
        : `这轮优先考虑${recommended}，重新检查${chosen}的价格和下注目的。`;
  const holeText = hole.map(cardLabel).join(' ');
  const ranks = hole.map(cardRank).sort((a, b) => b - a);
  const suited = cardSuit(hole[0]) === cardSuit(hole[1]);
  const boardText = decision.board.map(cardLabel).join(' ');
  const handReason =
    decision.board.length < 3
      ? `${holeText} 是${ranks[0] === ranks[1] ? '口袋对子' : suited ? '同花起手牌' : '不同花起手牌'}；${ranks[1] >= 10 ? '高张有顶对潜力，但仍要防被紧范围支配' : ranks[0] === ranks[1] ? '对子强度与成三条后的取值取决于位置和深度' : '弱点数不能只凭入池便宜就扩大投入'}。`
      : `${holeText} 在 ${boardText} 上是${rankHand([...hole, ...decision.board]).label}；${hand.playsBoard ? '最佳五张来自公共牌，要考虑分池而非独赢' : hand.draw ? '还有听牌潜力，需要区分补牌价值和立即弃牌收益' : hand.madeCategory <= 1 ? '重点是控制底池、识别会继续的更强组合' : '重点是找出愿意投入的更弱成牌'}。`;
  const priceReason = decision.call
    ? `跟注 ${round(decision.call / bigBlind)} BB 争夺当前 ${round(decision.pot / bigBlind)} BB，需要约 ${pct(decision.call / (decision.pot + decision.call))} 静态权益；公开范围份额约 ${pct(equity)}，还要看能否兑现。`
    : `现在可以免费过牌；约 ${pct(equity)} 的公开范围摊牌份额，并不自动意味着下注有利。`;
  const activeOpponents = decision.activeSeats.filter(
    (seat) => seat !== decision.seat,
  );
  const latestRaise = decision.history
    .filter(
      (action) =>
        activeOpponents.includes(action.seat) && action.action.type === 'raise',
    )
    .at(-1);
  const publicNote = latestRaise
    ? `${positionLabel(decision, latestRaise.seat)}最近${actionLabel(latestRaise.action, latestRaise.paid)}，继续范围需收紧看待`
    : '当前对手尚未表现出持续加注压力，过牌也不能直接当作弱牌';
  const rangeReason = `你在${position}，还有 ${activeOpponents.length} 个对手，SPR 约 ${spr.toFixed(1)}；${publicNote}。`;
  const allIns = activeOpponents.filter(
    (seat) => decision.stacks[seat] === 0,
  ).length;
  const purpose =
    recommendation.type === 'fold'
      ? '保留剩余筹码，不为了追回之前投入而高价追逐边缘权益。'
      : recommendation.type === 'check'
        ? '免费保留摊牌与补牌机会，避免把底池扩大到只剩强牌继续。'
        : recommendation.type === 'call'
          ? `用当前价格保留${hand.draw ? '补牌与摊牌' : '现有摊牌'}权益，保持对手较宽的范围。`
          : !hand.playsBoard &&
              (hand.privateValue ||
                equity >
                  Math.max(0.43, 1 / (activeOpponents.length + 1) + 0.16))
            ? '向更弱成牌和听牌取值，确认它们愿意按这个尺度继续。'
            : hand.draw
              ? '用半诈唬同时争取弃牌收益与补成后的价值，不能只因为有听牌就加注。'
              : '争取弃牌收益或隔离更宽范围，必须明确哪些更强牌真的会弃。';
  const currentBet = Math.max(
    ...decision.streetBets,
    decision.streetBet + decision.call,
  );
  const sizing =
    recommendation.type === 'raise'
      ? `加注到 ${recommendation.to}（${round(recommendation.to / bigBlind)} BB），本次新增 ${recommendation.to - decision.streetBet}；${decision.street === 'preflop' ? '这是结合当前入池与下注的局部尺度，不是通用开局表' : `额外加注约为跟注后底池的 ${pct((recommendation.to - currentBet) / Math.max(1, decision.pot + decision.call))}`}。${allIns ? '全下对手不会弃牌，尺度只能改变其他玩家及边池。' : ''}`
      : recommendation.type === 'call'
        ? `只补 ${decision.call}（${round(decision.call / bigBlind)} BB）${decision.call >= decision.stack ? '，这是当前筹码范围内的全下跟注' : '，下一街重新评估而非自动跟到底'}。`
        : recommendation.type === 'check'
          ? '本次新增投入为 0；遇到后续下注或公共牌变化，再重新判断。'
          : '本次新增投入为 0；已经投入的筹码是沉没成本。';
  const seen = new Set<string>();
  const otherChoices = alternatives
    .filter((option) => {
      if (
        actionKey(option.action) === actionKey(recommendation) ||
        seen.has(option.action.type)
      )
        return false;
      seen.add(option.action.type);
      return true;
    })
    .slice(0, 3)
    .map((option) => {
      if (option.action.type === 'raise')
        return `${option.label}：增加投入和面对再加注的风险；${option.action.to - currentBet > 2 * (decision.pot + decision.call) ? '极大尺度依赖少数强牌是否跟注，不能按单次数值峰值认可' : conservative ? '估值差接近模型预留，优先较少投入的方案' : hand.draw ? '听牌可半诈唬，但必须有足够弃牌收益' : '需要明确的价值对象或可信弃牌率'}。`;
      if (option.action.type === 'fold')
        return `${option.label}：${decision.call === 0 ? '免费过牌不花钱，直接弃牌会白白放弃权益' : '保留筹码，但也放弃当前可争夺的权益，需与价格比较'}。`;
      if (option.action.type === 'check')
        return `${option.label}：保留免费观察，但${recommendation.type === 'raise' ? '可能错过当前更弱牌愿意支付的价值' : '未来遇到下注仍需继续判断'}。`;
      return `${option.label}：保留权益，但${recommendation.type === 'fold' ? '当前价格与收紧后的范围不足以支持继续' : recommendation.type === 'raise' ? '没有主动向更弱牌取值或施压' : '不能消除后位加注与权益兑现风险'}。`;
    });
  const nextQuestion =
    decision.street === 'preflop'
      ? '如果后位再加注，你准备继续哪些更强起手牌？'
      : decision.street === 'flop'
        ? '下一张牌会让谁的范围变强，你准备保留哪些成牌与听牌？'
        : decision.street === 'turn'
          ? '哪些河牌会改变你的取值对象或让你必须放弃？'
          : '哪些具体更弱组合会跟这个尺度，哪些更强组合真的会弃？';
  return {
    conclusion,
    reasons: [handReason, priceReason, rangeReason],
    purpose: `${purpose}${bluffLesson(recommendation, decision, hand)}`,
    sizing,
    alternatives: otherChoices,
    nextQuestion,
    gtoContext:
      'GTO 讨论整组手牌在同一局面如何分配行动及混合频率，而非单手 EV 排名。这里使用公开范围近似和稳健推荐，没有求解专业均衡范围或精确频率；高分也不表示该动作应执行 100%。',
  };
}

function candidates(decision: Decision, bigBlind: number): PokerAction[] {
  const actions: PokerAction[] = [
    { type: 'fold' },
    decision.call ? { type: 'call' } : { type: 'check' },
  ];
  const current = Math.max(...decision.streetBets);
  const hasResponder = decision.activeSeats.some(
    (seat) => seat !== decision.seat && decision.stacks[seat] > 0,
  );
  if (decision.raiseOpen && hasResponder && decision.maxTo > current) {
    const sizes =
      decision.street === 'preflop'
        ? [
            Math.max(bigBlind * 2.5, current * 3),
            Math.max(bigBlind * 3.5, current * 4),
            decision.maxTo,
          ]
        : [0.33, 0.66, 1]
            .map(
              (fraction) =>
                current + Math.round((decision.pot + decision.call) * fraction),
            )
            .concat(decision.maxTo);
    for (const size of sizes)
      actions.push({
        type: 'raise',
        to: Math.min(
          decision.maxTo,
          Math.max(decision.minTo, Math.round(size)),
        ),
      });
  }
  actions.push(decision.action); // The chosen slider size is compared exactly, not replaced by a preset.
  return [
    ...new Map(actions.map((action) => [actionKey(action), action])).values(),
  ];
}

type ModelHandFeatures = {
  quality: number;
  category: number;
  topPair: boolean;
  draw: number;
  wetPenalty: number;
};
function modelHandFeatures(
  hole: readonly number[],
  board: readonly number[],
): ModelHandFeatures {
  const hand = board.length >= 3 ? rankHand([...hole, ...board]) : null;
  const privatePair =
    hand?.category === 1 &&
    hole.some((card) => cardRank(card) === hand.kickers[0]);
  const boardSuitCount = Math.max(
    0,
    ...[0, 1, 2, 3].map(
      (suit) => board.filter((card) => cardSuit(card) === suit).length,
    ),
  );
  return {
    quality: strengthFeature(hole, board),
    category: hand?.category ?? -1,
    topPair: Boolean(
      privatePair &&
      hand &&
      hand.kickers[0] >= Math.max(...board.map(cardRank)),
    ),
    draw: drawFeature(hole, board),
    wetPenalty: boardSuitCount >= 4 ? 0.25 : boardSuitCount >= 3 ? 0.14 : 0,
  };
}

/** Probability of continuing in our disclosed local response model, not a GTO frequency.
 * It uses sampled private cards and ONLY the decision-time board, never the runout. */
export function continuationProbability(
  hole: readonly number[],
  board: readonly number[],
  cost: number,
  pot: number,
  style: BotStyle,
  opponents: number,
  raised: boolean,
  cachedFeatures?: ModelHandFeatures,
  betMultiple?: number,
) {
  if (cost <= 0) return 1;
  const features = cachedFeatures ?? modelHandFeatures(hole, board);
  const quality = features.quality;
  const price = cost / Math.max(1, pot + cost);
  const multiple = Math.max(0, betMultiple ?? cost / Math.max(1, pot - cost));
  const overbet = Math.max(0, Math.log2(Math.max(1, multiple / 1.5)));
  const threshold =
    (board.length < 3 ? 0.37 : 0.31) +
    price * 0.75 +
    Math.max(0, opponents - 1) * 0.028 +
    styleOffset(style) +
    (raised ? 0.025 : 0) +
    Math.min(0.32, overbet * 0.065);
  let probability = 0.025 + 0.95 * sigmoid((quality - threshold) * 11);
  if (board.length >= 3) {
    // A normal single bet does not make a private top pair vanish from the
    // defending range. Tight opponents still defend it; wet boards and large
    // prices reduce that floor, rather than making every pair equivalent.
    if (features.topPair && price <= 0.34)
      probability = Math.max(
        probability,
        (style === 'careful' ? 0.72 : 0.84) - features.wetPenalty,
      );
    if (features.category >= 2 && quality >= 0.72 && price <= 0.38)
      probability = Math.max(probability, 0.9);
    if (features.draw >= 1 && price <= 0.26)
      probability = Math.max(probability, 0.62);
    if (features.category < 3 && overbet > 0)
      probability *= Math.exp(-overbet * 0.9);
    if (features.category >= 6) probability = Math.max(probability, 0.85);
  }
  return clamp(probability, 0.025 / Math.max(1, multiple ** 1.1), 0.99);
}
function payout(
  contributions: readonly number[],
  active: readonly boolean[],
  ranks: readonly number[],
  hero: Seat,
) {
  const levels = [
    ...new Set(contributions.filter((amount) => amount > 0)),
  ].sort((a, b) => a - b);
  let previous = 0;
  let won = 0;
  for (const level of levels) {
    const contributors = tableSeats(contributions.length).filter(
      (seat) => contributions[seat] >= level,
    );
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (contributors.length === 1) {
      if (contributors[0] === hero) won += amount; // Uncalled excess is returned even before showdown.
      continue;
    }
    const eligible = contributors.filter((seat) => active[seat]);
    if (!eligible.includes(hero)) continue;
    const best = Math.max(...eligible.map((seat) => ranks[seat]));
    const winners = eligible.filter((seat) => ranks[seat] === best);
    if (winners.includes(hero)) won += amount / winners.length;
  }
  return won;
}
function* candidateValuesSteps(
  decision: Decision,
  action: PokerAction,
  worlds: readonly EquityWorld[],
  ranges: readonly OpponentRange[],
  styles: readonly BotStyle[],
  featureCache: Map<number, ModelHandFeatures> = new Map(),
): Generator<void, number[]> {
  if (action.type === 'fold') return worlds.map(() => 0);
  const hero = decision.seat;
  const featuresFor = (hole: readonly number[]) => {
    const key = Math.min(...hole) * 52 + Math.max(...hole);
    let features = featureCache.get(key);
    if (!features) {
      features = modelHandFeatures(hole, decision.board);
      featureCache.set(key, features);
    }
    return features;
  };
  type DefensePlan = { threshold: number; partial: number };
  const defensePlans = new Map<Seat, DefensePlan>();
  const defenseFloor = function* (
    range: OpponentRange,
    quality: number,
    multiple: number,
  ): Generator<void, number> {
    let plan = defensePlans.get(range.seat);
    if (!plan) {
      // A one-bet defense reference applied to the top of a public weighted
      // range. It is not a solved multiplayer equilibrium or actual hidden hand.
      const entries: { quality: number; weight: number }[] = [];
      for (const combo of range.combos) {
        if (entries.length % 24 === 0) yield;
        entries.push({
          quality: featuresFor(combo.cards).quality,
          weight: combo.weight,
        });
      }
      entries.sort((a, b) => b.quality - a.quality);
      const target =
        entries.reduce((sum, entry) => sum + entry.weight, 0) / (1 + multiple);
      let above = 0;
      for (let index = 0; index < entries.length;) {
        const threshold = entries[index].quality;
        let group = 0;
        while (index < entries.length && entries[index].quality === threshold)
          group += entries[index++].weight;
        if (above + group >= target) {
          plan = { threshold, partial: clamp((target - above) / group) };
          break;
        }
        above += group;
      }
      plan ??= { threshold: 0, partial: 1 };
      defensePlans.set(range.seat, plan);
    }
    return quality > plan.threshold
      ? 1
      : quality === plan.threshold
        ? plan.partial
        : 0;
  };
  const target =
    action.type === 'raise'
      ? action.to
      : Math.max(...decision.streetBets, decision.streetBet + decision.call);
  const paid =
    action.type === 'check'
      ? 0
      : action.type === 'call'
        ? decision.call
        : Math.min(decision.stack, Math.max(0, target - decision.streetBet));
  const values: number[] = [];
  for (const world of worlds) {
    yield;
    const committed = [...decision.committed];
    committed[hero] += paid;
    const active = decision.folded.map((folded) => !folded);
    const ranks = tableSeats(decision).map(() => 0);
    ranks[hero] = world.ranks[0];
    // Respond in table order, including opponents who still owe the current bet.
    const order = ranges
      .map((range, index) => ({ range, index }))
      .sort(
        (a, b) =>
          ((a.range.seat - hero + decision.tableSize) % decision.tableSize) -
          ((b.range.seat - hero + decision.tableSize) % decision.tableSize),
      );
    for (const { range, index } of order) {
      const seat = range.seat as Seat;
      ranks[seat] = world.ranks[index + 1];
      if (decision.stacks[seat] === 0) continue;
      const cost = Math.min(
        decision.stacks[seat],
        Math.max(0, target - decision.streetBets[seat]),
      );
      const callerCap = committed[seat] + cost;
      const callerPot = committed.reduce(
        (sum, amount) => sum + Math.min(amount, callerCap),
        0,
      );
      const sizingMultiple =
        action.type === 'raise'
          ? Math.min(
              (target -
                Math.max(
                  ...decision.streetBets,
                  decision.streetBet + decision.call,
                )) /
                Math.max(1, decision.pot + decision.call),
              cost / Math.max(1, decision.pot + decision.call),
            )
          : undefined;
      let probability = continuationProbability(
        world.holes[index + 1],
        decision.board,
        cost,
        callerPot,
        styles[seat] ?? 'balanced',
        ranges.length,
        action.type === 'raise',
        featuresFor(world.holes[index + 1]),
        sizingMultiple,
      );
      if ((sizingMultiple ?? 0) >= 2)
        probability = Math.max(
          probability,
          yield* defenseFloor(
            range,
            featuresFor(world.holes[index + 1]).quality,
            sizingMultiple!,
          ),
        );
      if (world.responseRolls[index] > probability) active[seat] = false;
      else {
        committed[seat] += cost;
      }
    }
    const gross = payout(committed, active, ranks, hero);
    const liveOpponents = ranges.filter((range) => active[range.seat]);
    if (
      !liveOpponents.length ||
      decision.street === 'river' ||
      paid >= decision.stack
    ) {
      values.push(gross - paid);
      continue;
    }
    const returnedExcess = Math.max(
      0,
      committed[hero] -
        Math.max(
          ...tableSeats(decision)
            .filter((seat) => seat !== hero)
            .map((seat) => committed[seat]),
        ),
    );
    const heroQuality = featuresFor(world.holes[0]).quality;
    const inPosition = hasPosition(decision);
    // A deliberately conservative equity-realization proxy. Future wagers are
    // not solved; out-of-position weak hands do not realize every lucky runout.
    let realization =
      decision.street === 'preflop'
        ? clamp(
            0.68 + heroQuality * 0.24 + (inPosition ? 0.08 : -0.03),
            0.65,
            0.98,
          )
        : clamp(
            0.76 +
              heroQuality * 0.2 +
              (inPosition ? 0.05 : -0.035) -
              Math.max(0, liveOpponents.length - 1) * 0.025,
            0.7,
            0.99,
          );
    if (action.type === 'raise' && action.to >= decision.minTo) {
      // Exposure discount for a possible full re-raise. This is a proxy, not a
      // claimed solved response tree, and is absent for short/non-reopening raises.
      const current = Math.max(
        ...decision.streetBets,
        decision.streetBet + decision.call,
      );
      const increment = Math.max(decision.lastRaise, action.to - current);
      let avoidReraise = 1;
      for (const range of liveOpponents) {
        const index = ranges.indexOf(range);
        const call = Math.min(
          decision.stacks[range.seat],
          Math.max(0, target - decision.streetBets[range.seat]),
        );
        if (decision.stacks[range.seat] - call < increment) continue;
        const quality = featuresFor(world.holes[index + 1]).quality;
        const risk =
          0.28 *
          sigmoid(
            (quality - (decision.street === 'preflop' ? 0.78 : 0.83)) * 18,
          );
        avoidReraise *= 1 - risk;
      }
      const heroWouldFold = sigmoid((0.65 - heroQuality) * 14);
      realization *= 1 - (1 - avoidReraise) * heroWouldFold;
    }
    values.push(
      returnedExcess + Math.max(0, gross - returnedExcess) * realization - paid,
    );
  }
  return values;
}
function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function standardError(values: readonly number[]) {
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      Math.max(1, values.length - 1) /
      values.length,
  );
}

export function reviewHand(
  state: HoldemState,
  samples = 900,
  random?: () => number,
  styles: BotStyle[] = DEFAULT_SEAT_STYLES,
): ReviewPoint[] {
  return finishComputation(reviewHandSteps(state, samples, random, styles));
}

export function* reviewHandSteps(
  state: HoldemState,
  samples = 900,
  random?: () => number,
  styles: BotStyle[] = DEFAULT_SEAT_STYLES,
): Generator<void, ReviewPoint[]> {
  const hole = state.holes[0]; // No opponent holes, final board, or deck is ever read.
  const bigBlind = state.bigBlind;
  const points: ReviewPoint[] = [];
  for (const [index, decision] of state.actions.entries()) {
    if (decision.seat !== 0) continue;
    const ranges = yield* buildOpponentRangesSteps(hole, decision, styles);
    const worlds = yield* sampleRangeWorldsSteps(
      hole,
      decision.board,
      ranges,
      samples,
      random ??
        seededRandom(
          seedFor({
            hole,
            beforeAction: normalizedDecisionSeed(decision, bigBlind),
            styles,
          }),
        ),
    );
    const estimate = equityFromWorlds(worlds);
    const options = candidates(decision, bigBlind);
    const featureCache = new Map<number, ModelHandFeatures>();
    const values: number[][] = [];
    for (const action of options)
      values.push(
        yield* candidateValuesSteps(
          decision,
          action,
          worlds,
          ranges,
          styles,
          featureCache,
        ),
      );
    const expected = values.map(mean);
    const bestIndex = expected.reduce(
      (best, value, candidate) => (value > expected[best] ? candidate : best),
      0,
    );
    const actualIndex = options.findIndex(
      (action) => actionKey(action) === actionKey(decision.action),
    );
    const baseModelAllowance =
      Math.max(bigBlind * 0.2, decision.pot * 0.12) *
      ({ preflop: 1.75, flop: 1.35, turn: 0.65, river: 0.35 } as const)[
        decision.street
      ];
    const investment = (action: PokerAction) =>
      action.type === 'raise'
        ? action.to - decision.streetBet
        : action.type === 'call'
          ? decision.call
          : 0;
    const effectiveInvestment = (action: PokerAction) =>
      Math.min(
        investment(action),
        Math.max(
          0,
          ...ranges.map(
            (range) =>
              decision.streetBets[range.seat] +
              decision.stacks[range.seat] -
              decision.streetBet,
          ),
        ),
      );
    // Each candidate has its own model sensitivity allowance. An extreme
    // all-in must not spread its uncertainty across ordinary value bets/checks.
    // The 3% reserve is a disclosed heuristic, not a solved risk premium.
    const allowances = options.map((action) =>
      action.type === 'fold'
        ? 0
        : baseModelAllowance +
          0.03 *
            Math.max(
              0,
              effectiveInvestment(action) -
                decision.call -
                2 * (decision.pot + decision.call),
            ),
    );
    const samplingError = values.map(standardError);
    const conservativeValues = expected.map(
      (value, candidate) =>
        value - allowances[candidate] - samplingError[candidate] * 1.96,
    );
    const anchorIndex = conservativeValues.reduce(
      (best, value, candidate) =>
        (options[candidate].type !== 'fold' || decision.call > 0) &&
        value > conservativeValues[best]
          ? candidate
          : best,
      decision.call ? 0 : 1,
    );
    const pairedError = values.map((value) =>
      standardError(
        value.map((ev, sample) => values[anchorIndex][sample] - ev),
      ),
    );
    const samplingTolerance = pairedError.map((error) =>
      Math.max(bigBlind * 0.08, error * 1.96),
    );
    const stableIndex = expected.reduce(
      (best, value, candidate) =>
        allowances[candidate] <= baseModelAllowance &&
        !(options[candidate].type === 'fold' && decision.call === 0) &&
        value > expected[best]
          ? candidate
          : best,
      decision.call ? 0 : 1,
    );
    const scoreGaps = expected.map((ev) =>
      Math.max(0, expected[stableIndex] - ev),
    );
    const comparisonError = values.map(
      (value) =>
        standardError(
          value.map((ev, sample) => values[stableIndex][sample] - ev),
        ) * 1.96,
    );
    const comparisons = options.map((_, candidate) =>
      allowances[candidate] > baseModelAllowance
        ? ('sensitive' as const)
        : scoreGaps[candidate] <=
            Math.max(bigBlind * 0.08, comparisonError[candidate]) +
              Math.max(allowances[stableIndex], allowances[candidate])
          ? ('close' as const)
          : ('clear' as const),
    );
    // Quality and uncertainty are separate: a noisy/suboptimal estimate does
    // not receive bonus points merely because its model tolerance is large.
    // The scale is a disclosed training heuristic, not a fitted GTO grade.
    const scale = Math.max(bigBlind * 0.5, decision.pot * 0.25);
    const score = expected.map(
      (_, candidate) =>
        Math.round(Math.exp(-scoreGaps[candidate] / scale) * 1000) / 10,
    );
    // First choose a candidate-specific conservative EV anchor. Compare close
    // choices against that anchor with paired Monte Carlo noise, then prefer
    // lower investment. A free check dominates a gratuitous fold in a tie.
    const plausible = options
      .map((action, candidate) => ({ action, candidate }))
      .filter(
        ({ action, candidate }) =>
          conservativeValues[anchorIndex] - conservativeValues[candidate] <=
            samplingTolerance[candidate] +
              Math.min(allowances[anchorIndex], allowances[candidate]) &&
          comparisons[candidate] !== 'clear' &&
          !(action.type === 'fold' && decision.call === 0),
      );
    const recommendationIndex =
      plausible.sort(
        (a, b) =>
          investment(a.action) - investment(b.action) ||
          expected[b.candidate] - expected[a.candidate],
      )[0]?.candidate ?? anchorIndex;
    const recommendation = options[recommendationIndex];
    const conservativeRecommendation = recommendationIndex !== bestIndex;
    const regret = Math.max(0, expected[bestIndex] - expected[actualIndex]);
    const uncertainty = comparisonError[actualIndex];
    const modelAllowance = allowances[actualIndex];
    const close = comparisons[actualIndex] !== 'clear';
    const threshold = decision.call
      ? decision.call / (decision.pot + decision.call)
      : null;
    const position = positionLabel(decision, 0);
    const effective = Math.min(
      decision.stack,
      Math.max(0, ...ranges.map((range) => decision.stacks[range.seat])),
    );
    const spr = effective / Math.max(1, decision.pot);
    const hand = handContext(hole, decision);
    const rangeNotes = ranges.map((range) =>
      rangeDescription(
        decision,
        range.seat as Seat,
        styles[range.seat] ?? 'balanced',
      ),
    );
    const context =
      decision.street === 'river'
        ? '河牌不再补牌，但对手面对不同尺度的响应仍是近似模型。'
        : '后续公共牌按合法牌组抽样，非全下时加入保守的权益兑现及再加注暴露折价；这些系数是启发式，未来下注树没有被求解。';
    const reasoning = [
      threshold !== null
        ? `当前跟注 ${decision.call}、可争夺底池 ${decision.pot}，静态权益门槛 ${pct(threshold)}。`
        : '当前可以免费过牌，比较主动取值与保留摊牌权益。',
      `对 ${ranges.length} 个仍在牌局的对手，公开范围模型估计摊牌份额 ${pct(estimate.equity)}；这不是被加注跟注后的条件权益。`,
      `最高数值候选 ${actionLabel(options[bestIndex], decision.call)}，估计增量 EV ${formatBB(expected[bestIndex] / bigBlind)} BB；推荐 ${actionLabel(recommendation, decision.call)} 的估值为 ${formatBB(expected[recommendationIndex] / bigBlind)} BB；你的选择 ${formatBB(expected[actualIndex] / bigBlind)} BB。`,
      `数值评分参照为普通尺度的${actionLabel(options[stableIndex], decision.call)}（${formatBB(expected[stableIndex] / bigBlind)} BB）；你的原始估值差为 ${(scoreGaps[actualIndex] / bigBlind).toFixed(2)} BB。分数不扣误差，也不因模型不确定而奖励成满分；是否能可靠区分另作说明。`,
      ...(conservativeRecommendation
        ? [
            allowances[bestIndex] > baseModelAllowance
              ? '极大尺度估值敏感，采用较稳健的选择：逐项扣除抽样误差和各自模型预留，再比较稳健锚点附近的动作；巨额下注的数值峰值不构成可靠最优证据。'
              : '候选估值接近，采用较稳健的选择：先逐项扣除其抽样误差和模型敏感性预留，再比较稳健锚点附近的动作，不宣称单次数值排名就是唯一正确答案。',
          ]
        : []),
      recommendationReason(
        recommendation,
        decision,
        estimate.equity,
        ranges.length,
        hand,
      ),
      ...hand.notes,
      close
        ? '差异落在抽样容差与模型敏感性预留范围内，可视作相近选择，不能凭这次结果判定失误。'
        : `在本模型中约少 ${(regret / bigBlind).toFixed(2)} BB，先检查下注目的、后位玩家与对手可能继续的范围。`,
      `你在${position}，SPR 约 ${spr.toFixed(1)}。${ranges.length > 1 ? '多人底池需要更强的取值范围，诈唬必须让所有可争夺对手放弃；全下玩家不能被诈唬弃牌。' : '单挑可更积极争夺小底池，但仍要考虑更弱牌是否愿意跟注。'}`,
      context,
    ];
    const alternatives = options
      .map(
        (action, candidate): ReviewAlternative => ({
          action,
          label: actionLabel(action, decision.call),
          evBB: round(expected[candidate] / bigBlind),
          standardErrorBB: round(standardError(values[candidate]) / bigBlind),
          score: score[candidate],
          scoreSensitive: allowances[candidate] > baseModelAllowance,
          scoreGapBB: round(scoreGaps[candidate] / bigBlind),
          comparison: comparisons[candidate],
          reason: `${recommendationReason(action, decision, estimate.equity, ranges.length, hand)} ${
            action.type === 'fold'
              ? '弃牌的增量 EV 设为 0，之前投入的筹码是沉没成本。'
              : action.type === 'check'
                ? '免费看完公共牌的基准；没有假设之后继续下注。'
                : action.type === 'call'
                  ? '计入本次跟注、仍待行动玩家的响应和可争夺底池；用摊牌样本估值，早期街另作权益实现折价。'
                  : '按此尺度重算每个对手的跟注/弃牌，并逐层结算主池、边池和未被跟注的返还。'
          }${allowances[candidate] > baseModelAllowance ? ' 这个尺度的有效新增风险超过跟注后两倍底池，对极少数强牌是否继续非常敏感；抽样高分只说明无法可靠区分，不能验证巨额下注。' : ''}`,
        }),
      )
      .sort((a, b) => b.evBB - a.evBB);
    points.push({
      index,
      street: decision.street,
      action: actionLabel(decision.action, decision.call),
      equity: estimate.equity,
      samples,
      pot: decision.pot,
      call: decision.call,
      threshold,
      title:
        modelAllowance > baseModelAllowance
          ? '极大尺度对模型假设敏感，优先稳健参照'
          : !close
            ? `优先比较 ${actionLabel(recommendation, decision.call)}`
            : conservativeRecommendation
              ? '候选估值接近，采用较稳健的选择'
              : '这个选择接近模型首选',
      advice: reasoning.join(' '),
      principle:
        'GTO 的核心是完整范围与对手响应的平衡。这里是公开范围的一轮响应 EV 近似，不是严格 GTO 求解、精确频率或完整多街最优解。',
      board: [...decision.board],
      score: score[actualIndex],
      scoreSensitive: modelAllowance > baseModelAllowance,
      scoreGapBB: round(scoreGaps[actualIndex] / bigBlind),
      comparison: comparisons[actualIndex],
      scoreReference: {
        action: options[stableIndex],
        label: actionLabel(options[stableIndex], decision.call),
        evBB: round(expected[stableIndex] / bigBlind),
      },
      recommendation: {
        action: recommendation,
        label: actionLabel(recommendation, decision.call),
        evBB: round(expected[recommendationIndex] / bigBlind),
      },
      alternatives,
      regretBB: round(regret / bigBlind),
      confidence: 'low' as const,
      uncertaintyBB: round(uncertainty / bigBlind),
      modelAllowanceBB: round(modelAllowance / bigBlind),
      position,
      opponents: ranges.length,
      spr: round(spr),
      rangeNotes,
      explanations: teachingExplanation({
        decision,
        hole,
        recommendation,
        alternatives,
        bigBlind,
        equity: estimate.equity,
        hand,
        position,
        spr,
        close,
        conservative: conservativeRecommendation,
        sizingSensitive: modelAllowance > baseModelAllowance,
      }),
      model: '公开范围 · 一轮响应与风险折价 EV',
      limitations: [
        '范围与跟注概率由本地启发式估计，未求解均衡。',
        '公开历史按位置、风格与动作类型修正范围，尚未拟合所有历史下注尺度；实际对手偏差仍会改变结论。',
        '超池下注按当前公开加权范围强端设置保守的一轮防守参照；1 / (1 + 有效下注/底池) 是启发式，不是多人均衡防守频率。公共两对、三条与私人牌力分别处理。',
        '非全下早期局面加入保守权益兑现及再加注暴露折价，但没有求解未来下注树；这些系数仍是启发式。',
        '抽样误差仅是 95% 配对 Monte Carlo 容差；另设模型敏感性预留，不能把后者当作统计置信区间。',
        '多人边池分别结算；无法以一个总权益直接代替所有边池权益。',
        '所有候选共用相同样本；评分反映模型内差异，接近的动作不作硬性优劣判断。',
        '数值分为 100 × exp(−普通稳定参照的原始 EV 损失 / max(0.5 BB, 25% 当前底池))，不扣除抽样误差或模型容差；这个比例是透明的训练启发式，未经专业策略拟合。极端尺度单独标记敏感，数值不作可靠评分。',
        '稳健推荐另按候选 EV − 95% 抽样误差 − 各自模型预留选择近似且少投入的方案，因此可与数值最高分不同。模型基准预留为 max(0.2 BB, 12% 底池) × 街道系数（1.75 / 1.35 / 0.65 / 0.35），新增有效风险超出跟注后两倍底池的部分另留 3%；它仅用于可区分程度与推荐，不提高质量分。',
      ],
    });
  }
  return points;
}
const round = (value: number) => Math.round(value * 100) / 100;
const formatBB = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
