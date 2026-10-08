import {
  cardRank,
  cardSuit,
  cardLabel,
  rankHand,
  sampleRangeWorlds,
  equityFromWorlds,
  type EquityWorld,
  type OpponentRange,
  type WeightedCombo,
} from './holdem-cards.ts';
import {
  legalActions,
  nextSeat,
  SEATS,
  type HoldemState,
  type PokerAction,
  type Decision,
  type Seat,
  type PublicAction,
} from './holdem-engine.ts';

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
];
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
export const positionLabel = (state: Pick<HoldemState, 'button'>, seat: Seat) =>
  ['按钮', '小盲', '大盲', '前位', '截止位'][(seat - state.button + 5) % 5];
export const nextButton = (state: HoldemState) => nextSeat(state.button);

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
  decision: Pick<Decision, 'board' | 'button' | 'history'>,
  seat: Seat,
  style: BotStyle,
) {
  const position = (seat - decision.button + 5) % 5;
  let weight = 1;
  const history = decision.history.filter((action) => action.seat === seat);
  for (const action of history) {
    const board = boardForStreet(decision.board, action.street);
    const strength = strengthFeature(hole, board);
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
          : [0.48, 0.55, 0.54, 0.64, 0.56][position]
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
    'board' | 'button' | 'history' | 'activeSeats' | 'seat'
  >,
  styles: readonly BotStyle[] = DEFAULT_SEAT_STYLES,
): OpponentRange[] {
  const known = new Set([...hole, ...decision.board]);
  const remaining = Array.from({ length: 52 }, (_, card) => card).filter(
    (card) => !known.has(card),
  );
  return decision.activeSeats
    .filter((seat) => seat !== decision.seat)
    .map((seat) => {
      const combos: WeightedCombo[] = [];
      for (let i = 0; i < remaining.length; i++)
        for (let j = i + 1; j < remaining.length; j++) {
          const cards: [number, number] = [remaining[i], remaining[j]];
          combos.push({
            cards,
            weight: rangeWeight(
              cards,
              decision,
              seat as Seat,
              styles[seat] ?? 'balanced',
            ),
          });
        }
      return { seat, combos };
    });
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
    pot: legal.pot,
    call: legal.call,
    stack: state.stacks[seat],
    streetBet: state.streetBets[seat],
    action: { type: 'check' },
    paid: 0,
    effectiveRisk: 0,
    activeSeats: SEATS.filter((player) => !state.folded[player]),
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

export function chooseBotAction(
  state: HoldemState,
  equity: number,
  style: BotStyle,
  random = Math.random,
  difficulty: AiDifficulty = 'standard',
  handFeatures: { draw: number; aceBlocker: boolean } = {
    draw: 0,
    aceBlocker: false,
  },
): PokerAction {
  const legal = legalActions(state);
  if (!legal) throw new Error('没有可行动的玩家');
  const seat = legal.seat;
  const opponents = SEATS.filter(
    (player) => player !== seat && !state.folded[player],
  ).length;
  const multiway = Math.max(0, opponents - 1);
  const position = (seat - state.button + 5) % 5;
  const inPosition = position === 0 || position === 4;
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
  const adjusted = clamp(equity + (random() - 0.5) * errors);
  const effective = Math.min(
    state.stacks[seat],
    Math.max(
      0,
      ...SEATS.filter((player) => player !== seat && !state.folded[player]).map(
        (player) => state.stacks[player],
      ),
    ),
  );
  const spr = effective / Math.max(1, legal.pot);
  const futureBetting = state.street !== 'river' && spr > 1.3;
  const realized =
    difficulty === 'advanced' && futureBetting
      ? adjusted * (inPosition ? 0.97 : 0.88 - Math.min(0.07, multiway * 0.025))
      : adjusted;
  const priorRaises = state.actions.filter(
    (action) => action.action.type === 'raise',
  );
  const lastAggressor = priorRaises.at(-1)?.seat;
  const cbet = state.street === 'flop' && lastAggressor === seat;
  const unopened = state.street === 'preflop' && priorRaises.length === 0;
  const steal = unopened && inPosition;
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
  const bluffRate =
    ((style === 'active'
      ? 0.105
      : style === 'tricky'
        ? 0.095
        : style === 'careful'
          ? 0.02
          : 0.06) /
      (1 + multiway * 1.8)) *
    (inPosition ? 1.25 : 0.8) *
    (steal ? 1.8 : cbet ? 1.3 : 1);
  const selectiveBluff =
    difficulty === 'advanced'
      ? (bluffRate *
          (advancedDraw
            ? 1.8
            : handFeatures.aceBlocker && state.street === 'river'
              ? 1.2
              : 0.65)) /
        (1 + heroCalls * 0.35)
      : bluffRate;
  const bluff = roll < selectiveBluff;
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
      !looseCall
    )
      return { type: 'fold' };
    if (
      legal.canRaise &&
      ((bigValue && roll < 0.72 * aggression) ||
        (value && steal && roll < 0.55 * aggression) ||
        (advancedDraw && inPosition && multiway === 0 && roll < 0.16) ||
        bluff)
    )
      return { type: 'raise', to: raiseTo() };
    return { type: 'call' };
  }
  if (
    legal.canRaise &&
    ((value && roll < (style === 'tricky' ? 0.44 : 0.68) * aggression) ||
      (cbet && adjusted > 0.34 && roll < 0.42 / (1 + multiway)) ||
      (advancedDraw && inPosition && roll < 0.2 / (1 + multiway)) ||
      bluff)
  )
    return { type: 'raise', to: raiseTo() };
  return { type: 'check' };
}

export function decideBot(
  state: HoldemState,
  seat: Seat,
  style: BotStyle,
  difficulty: AiDifficulty = 'standard',
  styles: BotStyle[] = DEFAULT_SEAT_STYLES,
) {
  const decision = snapshot(state, seat);
  const hole = state.holes[seat]; // Information firewall: only the acting player's cards.
  const ranges = buildOpponentRanges(hole, decision, styles);
  const seed = seedFor({
    hand: state.hand,
    seat,
    hole,
    decision,
    difficulty,
    style,
  });
  const worlds = sampleRangeWorlds(
    hole,
    decision.board,
    ranges,
    BOT_SAMPLES[difficulty],
    seededRandom(seed),
  );
  const estimate = equityFromWorlds(worlds);
  const weightedEquity = projectedPotEquity(decision, worlds, ranges);
  let action = chooseBotAction(
    state,
    weightedEquity,
    style,
    seededRandom(seed ^ 0xa71ef3),
    difficulty,
    {
      draw: drawFeature(hole, decision.board),
      aceBlocker: hole.some((card) => cardRank(card) === 14),
    },
  );
  // A decision-specific EV check handles side pots and players still owing chips;
  // a single current pot-odds threshold cannot represent those situations.
  if (
    decision.call &&
    difficulty !== 'casual' &&
    (action.type === 'fold' || action.type === 'call')
  ) {
    const callValues = candidateValues(
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
  }
  return { action, equity: weightedEquity, samples: estimate.samples };
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
    const contributors = SEATS.filter((seat) => contributions[seat] >= level);
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
  return contestable ? expectedReturn / contestable : 0;
}

export type ReviewAlternative = {
  action: PokerAction;
  label: string;
  evBB: number;
  standardErrorBB: number;
  score: number;
  reason: string;
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
  return { notes, draw, madeCategory, playsBoard };
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
  return `${positionLabel({ button: decision.button }, seat)} · ${BOT_STYLES[style].label}：${observed}；${interpretation}${checkNote}。所有组合均排除你的底牌与当时公共牌。`;
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
    (hand.madeCategory >= 2 ||
      equity > Math.max(0.43, 1 / (opponents + 1) + 0.16));
  const purpose = likelyValue
    ? '这个尺度更偏向价值取值：列出愿意跟注的较弱对子、听牌或较弱成牌，再判断更大尺度是否只留下强牌。'
    : hand.draw
      ? '这个尺度更偏向半诈唬：同时争取立即弃牌与补牌后的价值，避免把所有听牌都自动加注。'
      : '这个尺度主要争取弃牌收益或隔离更宽的范围：先问哪些更好的牌真的会弃、哪些更弱的牌会跟。';
  return `${purpose}${opponents > 1 ? '多人底池的立即获胜要求所有仍可弃牌的对手一起放弃，单人的弃牌率不能直接套用。' : '单挑时小尺度可保留较宽的跟注范围，大尺度更依赖明确价值或可信诈唬。'}${allIns ? `当前 ${allIns} 名全下对手不会弃牌，加注最多改变其他玩家及边池，不能诈唬拿走仍需摊牌的主池。` : ''}`;
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
) {
  if (cost <= 0) return 1;
  const quality = strengthFeature(hole, board);
  const price = cost / Math.max(1, pot + cost);
  const threshold =
    (board.length < 3 ? 0.37 : 0.31) +
    price * 0.75 +
    Math.max(0, opponents - 1) * 0.028 +
    styleOffset(style) +
    (raised ? 0.025 : 0);
  let probability = 0.025 + 0.95 * sigmoid((quality - threshold) * 11);
  if (board.length >= 3) {
    const hand = rankHand([...hole, ...board]);
    const privatePair =
      hand.category === 1 &&
      hole.some((card) => cardRank(card) === hand.kickers[0]);
    const topPair =
      privatePair && hand.kickers[0] >= Math.max(...board.map(cardRank));
    // A normal single bet does not make a private top pair vanish from the
    // defending range. Tight opponents still defend it; wet boards and large
    // prices reduce that floor, rather than making every pair equivalent.
    const boardSuitCount = Math.max(
      ...[0, 1, 2, 3].map(
        (suit) => board.filter((card) => cardSuit(card) === suit).length,
      ),
    );
    const wetPenalty =
      boardSuitCount >= 4 ? 0.25 : boardSuitCount >= 3 ? 0.14 : 0;
    if (topPair && price <= 0.34)
      probability = Math.max(
        probability,
        (style === 'careful' ? 0.72 : 0.84) - wetPenalty,
      );
    if (hand.category >= 2 && price <= 0.38)
      probability = Math.max(probability, 0.9);
    if (drawFeature(hole, board) >= 1 && price <= 0.26)
      probability = Math.max(probability, 0.62);
  }
  return clamp(probability, 0.025, 0.99);
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
    const contributors = SEATS.filter((seat) => contributions[seat] >= level);
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
function candidateValues(
  decision: Decision,
  action: PokerAction,
  worlds: readonly EquityWorld[],
  ranges: readonly OpponentRange[],
  styles: readonly BotStyle[],
) {
  if (action.type === 'fold') return worlds.map(() => 0);
  const hero = decision.seat;
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
  return worlds.map((world) => {
    const committed = [...decision.committed];
    committed[hero] += paid;
    const active = decision.folded.map((folded) => !folded);
    const ranks = SEATS.map(() => 0);
    ranks[hero] = world.ranks[0];
    let responsePot =
      decision.committed.reduce((sum, value) => sum + value, 0) + paid;
    // Respond in table order, including opponents who still owe the current bet.
    const order = ranges
      .map((range, index) => ({ range, index }))
      .sort(
        (a, b) =>
          ((a.range.seat - hero + 5) % 5) - ((b.range.seat - hero + 5) % 5),
      );
    for (const { range, index } of order) {
      const seat = range.seat as Seat;
      ranks[seat] = world.ranks[index + 1];
      if (decision.stacks[seat] === 0) continue;
      const cost = Math.min(
        decision.stacks[seat],
        Math.max(0, target - decision.streetBets[seat]),
      );
      const probability = continuationProbability(
        world.holes[index + 1],
        decision.board,
        cost,
        responsePot,
        styles[seat] ?? 'balanced',
        ranges.length,
        action.type === 'raise',
      );
      if (world.responseRolls[index] > probability) active[seat] = false;
      else {
        committed[seat] += cost;
        responsePot += cost;
      }
    }
    const gross = payout(committed, active, ranks, hero);
    const liveOpponents = ranges.filter((range) => active[range.seat]);
    if (
      !liveOpponents.length ||
      decision.street === 'river' ||
      paid >= decision.stack
    )
      return gross - paid;
    const returnedExcess = Math.max(
      0,
      committed[hero] -
        Math.max(
          ...SEATS.filter((seat) => seat !== hero).map(
            (seat) => committed[seat],
          ),
        ),
    );
    const heroQuality = strengthFeature(world.holes[0], decision.board);
    const inPosition = [0, 4].includes((hero - decision.button + 5) % 5);
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
        const quality = strengthFeature(world.holes[index + 1], decision.board);
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
    return (
      returnedExcess + Math.max(0, gross - returnedExcess) * realization - paid
    );
  });
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
  const hole = state.holes[0]; // No opponent holes, final board, or deck is ever read.
  const bigBlind = state.bigBlind;
  return state.actions.flatMap((decision, index) => {
    if (decision.seat !== 0) return [];
    const ranges = buildOpponentRanges(hole, decision, styles);
    const {
      action: _action,
      paid: _paid,
      effectiveRisk: _risk,
      ...beforeAction
    } = decision;
    const worlds = sampleRangeWorlds(
      hole,
      decision.board,
      ranges,
      samples,
      random ?? seededRandom(seedFor({ hole, beforeAction, styles })),
    );
    const estimate = equityFromWorlds(worlds);
    const options = candidates(decision, bigBlind);
    const values = options.map((action) =>
      candidateValues(decision, action, worlds, ranges, styles),
    );
    const expected = values.map(mean);
    const bestIndex = expected.reduce(
      (best, value, candidate) => (value > expected[best] ? candidate : best),
      0,
    );
    const actualIndex = options.findIndex(
      (action) => actionKey(action) === actionKey(decision.action),
    );
    const pairedError = values.map((value) =>
      standardError(value.map((ev, sample) => values[bestIndex][sample] - ev)),
    );
    // Scores discount paired sampling noise and a separate model allowance.
    // They do not grade luck or claim equilibrium EV.
    const modelAllowance =
      Math.max(bigBlind * 0.2, decision.pot * 0.12) *
      ({ preflop: 1.75, flop: 1.35, turn: 0.65, river: 0.35 } as const)[
        decision.street
      ];
    const tolerance = pairedError.map(
      (error) => Math.max(bigBlind * 0.08, error * 1.96) + modelAllowance,
    );
    const scale = Math.max(bigBlind * 3, decision.pot * 0.35);
    const score = expected.map((ev, candidate) =>
      Math.round(
        Math.exp(
          -Math.max(0, expected[bestIndex] - ev - tolerance[candidate]) / scale,
        ) * 100,
      ),
    );
    const investment = (action: PokerAction) =>
      action.type === 'raise'
        ? action.to - decision.streetBet
        : action.type === 'call'
          ? decision.call
          : 0;
    // When values cannot be reliably distinguished, recommend the cheaper
    // viable action, rather than implying the noisy numerical maximum is exact.
    // A free check weakly dominates a gratuitous fold and is preferred in ties.
    const plausible = options
      .map((action, candidate) => ({ action, candidate }))
      .filter(
        ({ action, candidate }) =>
          expected[bestIndex] - expected[candidate] <= tolerance[candidate] &&
          !(action.type === 'fold' && decision.call === 0),
      );
    const recommendationIndex =
      plausible.sort(
        (a, b) =>
          investment(a.action) - investment(b.action) ||
          expected[b.candidate] - expected[a.candidate],
      )[0]?.candidate ?? bestIndex;
    const recommendation = options[recommendationIndex];
    const conservativeRecommendation = recommendationIndex !== bestIndex;
    const regret = Math.max(0, expected[bestIndex] - expected[actualIndex]);
    const uncertainty = pairedError[actualIndex] * 1.96;
    const close =
      regret <= Math.max(bigBlind * 0.08, uncertainty) + modelAllowance;
    const threshold = decision.call
      ? decision.call / (decision.pot + decision.call)
      : null;
    const position = positionLabel({ button: decision.button }, 0);
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
      ...(conservativeRecommendation
        ? [
            '候选估值接近，采用较稳健的选择：差异处于配对抽样容差与模型敏感性预留之内，优先减少本次投入，而不是宣称数值排名就是唯一正确动作。',
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
          reason: `${recommendationReason(action, decision, estimate.equity, ranges.length, hand)} ${
            action.type === 'fold'
              ? '弃牌的增量 EV 设为 0，之前投入的筹码是沉没成本。'
              : action.type === 'check'
                ? '免费看完公共牌的基准；没有假设之后继续下注。'
                : action.type === 'call'
                  ? '计入本次跟注、仍待行动玩家的响应和可争夺底池；用摊牌样本估值，早期街另作权益实现折价。'
                  : '按此尺度重算每个对手的跟注/弃牌，并逐层结算主池、边池和未被跟注的返还。'
          }`,
        }),
      )
      .sort((a, b) => b.evBB - a.evBB);
    return [
      {
        index,
        street: decision.street,
        action: actionLabel(decision.action, decision.call),
        equity: estimate.equity,
        samples,
        pot: decision.pot,
        call: decision.call,
        threshold,
        title: !close
          ? `优先比较 ${actionLabel(recommendation, decision.call)}`
          : conservativeRecommendation
            ? '候选估值接近，采用较稳健的选择'
            : '这个选择接近模型首选',
        advice: reasoning.join(' '),
        principle:
          'GTO 的核心是完整范围与对手响应的平衡。这里是公开范围的一轮响应 EV 近似，不是严格 GTO 求解、精确频率或完整多街最优解。',
        board: [...decision.board],
        score: score[actualIndex],
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
        model: '公开范围 · 一轮响应与风险折价 EV',
        limitations: [
          '范围与跟注概率由本地启发式估计，未求解均衡。',
          '非全下早期局面加入保守权益兑现及再加注暴露折价，但没有求解未来下注树；这些系数仍是启发式。',
          '抽样误差仅是 95% 配对 Monte Carlo 容差；另设模型敏感性预留，不能把后者当作统计置信区间。',
          '多人边池分别结算；无法以一个总权益直接代替所有边池权益。',
          '所有候选共用相同样本；评分反映模型内差异，接近的动作不作硬性优劣判断。',
          '评分扣除配对抽样容差与模型预留后，按 100 × exp(−剩余 EV 损失 / max(3 BB, 35% 当前底池)) 平滑归一；模型预留为 max(0.2 BB, 12% 底池) × 街道系数（翻牌前 1.75、翻牌 1.35、转牌 0.65、河牌 0.35）。它是训练指标，不是求解器认可度。',
        ],
      },
    ];
  });
}
const round = (value: number) => Math.round(value * 100) / 100;
const formatBB = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
