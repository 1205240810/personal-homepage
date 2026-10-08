import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleRangeWorlds,
  equityFromWorlds,
} from '../lib/games/holdem-cards.ts';
import {
  act,
  legalActions,
  shuffledDeck,
  startHand,
  SEATS,
  type HoldemState,
  type PokerAction,
  type Decision,
} from '../lib/games/holdem-engine.ts';
import {
  chooseBotAction,
  decideBot,
  buildOpponentRanges,
  reviewHand,
  seededRandom,
  projectedPotEquity,
  continuationProbability,
  DEFAULT_SEAT_STYLES,
  type BotStyle,
  type AiDifficulty,
} from '../lib/games/holdem-strategy.ts';
const styles: BotStyle[] = ['balanced', 'careful', 'active', 'tricky'];
const difficulties: AiDifficulty[] = ['casual', 'standard', 'advanced'];
function assertAction(state: HoldemState, action: PokerAction) {
  const legal = legalActions(state)!;
  assert(legal);
  if (action.type === 'check') assert(legal.canCheck);
  if (action.type === 'call') assert(legal.call > 0);
  if (action.type === 'raise') {
    assert(legal.canRaise);
    assert(Number.isInteger(action.to) && action.to <= legal.maxTo);
    assert(action.to > Math.max(...state.streetBets));
    assert(action.to >= legal.minTo || action.to === legal.maxTo);
  }
}
function complete(state: HoldemState) {
  for (let i = 0; i < 100 && state.street !== 'complete'; i++) {
    const legal = legalActions(state)!;
    state = act(state, legal.call ? { type: 'call' } : { type: 'check' });
  }
  assert.equal(state.street, 'complete');
  return state;
}
function reviewFixture(): HoldemState {
  return complete(startHand({ deck: shuffledDeck(seededRandom(3307)) }));
}

await test('300 手五人策略对打：四种风格、三档难度、合法行动与筹码守恒', () => {
  const counts = { fold: 0, call: 0, check: 0, raise: 0 };
  for (let hand = 0; hand < 300; hand++) {
    const random = seededRandom(9387 + hand * 61);
    const stacks = [1000, 210, 580, 45, 1500] as [
      number,
      number,
      number,
      number,
      number,
    ];
    let state = startHand({
      hand: hand + 1,
      button: (hand % 5) as 0 | 1 | 2 | 3 | 4,
      stacks,
      deck: shuffledDeck(random),
    });
    const total = stacks.reduce((sum, chip) => sum + chip, 0);
    for (let action = 0; state.street !== 'complete'; action++) {
      assert(action < 140, '不能无限行动');
      const legal = legalActions(state)!;
      // The policy consumes a multiway estimate; small samples are sufficient for rule fuzzing.
      const decision: Decision = {
        seat: legal.seat,
        street: state.street,
        board: state.board,
        pot: legal.pot,
        call: legal.call,
        stack: state.stacks[legal.seat],
        streetBet: state.streetBets[legal.seat],
        action: { type: 'check' },
        paid: 0,
        effectiveRisk: 0,
        button: state.button,
        activeSeats: SEATS.filter((seat) => !state.folded[seat]),
        stacks: state.stacks,
        committed: state.committed,
        streetBets: state.streetBets,
        folded: state.folded,
        lastRaise: state.lastRaise,
        raiseOpen: legal.canRaise,
        minTo: legal.minTo,
        maxTo: legal.maxTo,
        history: [],
      };
      const ranges = buildOpponentRanges(state.holes[legal.seat], decision);
      const equity = equityFromWorlds(
        sampleRangeWorlds(
          state.holes[legal.seat],
          state.board,
          ranges,
          8,
          random,
        ),
      ).equity;
      const move = chooseBotAction(
        state,
        equity,
        styles[(hand + legal.seat) % 4],
        random,
        difficulties[hand % 3],
      );
      assertAction(state, move);
      counts[move.type]++;
      const previous = state;
      const before = JSON.stringify(previous);
      state = act(previous, move);
      assert.equal(JSON.stringify(previous), before, '策略行动不能修改旧状态');
      assert.equal(
        state.stacks.reduce((sum, value) => sum + value, 0) +
          (state.street === 'complete'
            ? 0
            : state.committed.reduce((sum, value) => sum + value, 0)),
        total,
      );
    }
  }
  for (const count of Object.values(counts)) assert(count > 0);
  console.log('五人策略行动覆盖', counts);
});

await test('联合范围抽样执行卡牌移除，五方公共皇家同花顺按 1/5 分池', () => {
  const board = [32, 36, 40, 44, 48];
  const hole = [0, 5];
  const decision = {
    seat: 0 as const,
    board,
    button: 0 as const,
    history: [],
    activeSeats: [...SEATS],
  };
  const worlds = sampleRangeWorlds(
    hole,
    board,
    buildOpponentRanges(hole, decision),
    120,
    seededRandom(88),
  );
  for (const world of worlds)
    assert.equal(new Set([...board, ...world.holes.flat()]).size, 15);
  const estimate = equityFromWorlds(worlds);
  assert(Math.abs(estimate.equity - 0.2) < 1e-12);
  assert.equal(estimate.win, 0);
  assert.equal(estimate.tie, 1);
});

await test('AI 仅访问自己的底牌及当前公开信息，固定状态可重复', () => {
  const state = startHand({ deck: shuffledDeck(seededRandom(117)) });
  const seat = state.toAct!;
  const holes = new Proxy(state.holes, {
    get(target, key, receiver) {
      if (/^[0-4]$/.test(String(key)) && Number(key) !== seat)
        throw new Error('读取对手底牌');
      return Reflect.get(target, key, receiver);
    },
  });
  const protectedState = new Proxy(
    { ...state, holes },
    {
      get(target, key, receiver) {
        if (key === 'deck') throw new Error('读取未来牌组');
        return Reflect.get(target, key, receiver);
      },
    },
  );
  const result = decideBot(protectedState, seat, 'active', 'standard');
  assert.deepEqual(
    result,
    decideBot(protectedState, seat, 'active', 'standard'),
  );
  assertAction(state, result.action);
  const noCards = new Proxy(state, {
    get(target, key, receiver) {
      if (key === 'holes' || key === 'deck')
        throw new Error('显式权益策略不可重新读牌');
      return Reflect.get(target, key, receiver);
    },
  });
  for (const style of styles)
    for (const difficulty of difficulties)
      assertAction(
        state,
        chooseBotAction(noCards, 0.31, style, seededRandom(717), difficulty),
      );
});

await test('复盘信息防火墙：不访问四名对手底牌、牌组或最终公共牌', () => {
  const state = reviewFixture();
  const expected = reviewHand(state, 100);
  const holes = new Proxy(state.holes, {
    get(target, key, receiver) {
      if (/^[1-4]$/.test(String(key))) throw new Error('复盘读取隐藏底牌');
      return Reflect.get(target, key, receiver);
    },
  });
  const protectedState = new Proxy(
    { ...state, holes },
    {
      get(target, key, receiver) {
        if (key === 'deck' || key === 'board')
          throw new Error('复盘读取未来公共牌');
        return Reflect.get(target, key, receiver);
      },
    },
  );
  assert.deepEqual(reviewHand(protectedState, 100), expected);
  assert.equal(
    expected.length,
    state.actions.filter((action) => action.seat === 0).length,
  );
  for (const point of expected) {
    assert(point.score >= 0 && point.score <= 100);
    assert(
      point.alternatives.every(
        (option) =>
          option.score >= 0 &&
          option.score <= 100 &&
          Number.isFinite(option.evBB),
      ),
    );
    assert(point.regretBB >= 0 && point.uncertaintyBB >= 0);
    assert.equal(point.confidence, 'low');
    assert.match(point.principle, /不是严格 GTO/);
  }
});

await test('同一决策快照更换实际动作不改变共同候选 EV；精确保留滑块尺度', () => {
  const state = reviewFixture();
  const decision = state.actions.find((action) => action.seat === 0)!;
  const first = {
    ...state,
    actions: [
      {
        ...decision,
        action: { type: 'fold' } as PokerAction,
        paid: 0,
        effectiveRisk: 0,
      },
    ],
  };
  const second = {
    ...state,
    actions: [
      {
        ...decision,
        action: { type: 'raise', to: 37 } as PokerAction,
        paid: 37,
        effectiveRisk: 37,
      },
    ],
  };
  const a = reviewHand(first, 220)[0];
  const b = reviewHand(second, 220)[0];
  for (const option of a.alternatives) {
    const shared = b.alternatives.find(
      (candidate) =>
        JSON.stringify(candidate.action) === JSON.stringify(option.action),
    );
    if (shared) assert.equal(shared.evBB, option.evBB);
  }
  assert(
    b.alternatives.some(
      (option) => option.action.type === 'raise' && option.action.to === 37,
    ),
  );
});

await test('短全下主池与边池：皇家同花顺只赢有资格的层，不把大边池当自己权益', () => {
  const state = startHand();
  state.holes[0] = [48, 44];
  const decision: Decision = {
    seat: 0,
    street: 'river',
    board: [40, 36, 32, 1, 5],
    button: 0,
    pot: 80,
    call: 10,
    stack: 10,
    streetBet: 20,
    action: { type: 'call' },
    paid: 10,
    effectiveRisk: 10,
    activeSeats: [0, 1, 2],
    stacks: [10, 0, 0, 1000, 1000],
    committed: [20, 100, 100, 0, 0],
    streetBets: [20, 100, 100, 0, 0],
    folded: [false, false, false, true, true],
    lastRaise: 80,
    raiseOpen: false,
    minTo: 180,
    maxTo: 30,
    history: [],
  };
  state.actions = [decision];
  const point = reviewHand(state, 150)[0];
  assert.equal(
    point.alternatives.find((option) => option.action.type === 'call')!.evBB,
    8,
  );
  assert.equal(point.score, 100);
  assert.equal(point.recommendation.action.type, 'call');
  assert(
    !point.alternatives.some((option) => option.action.type === 'raise'),
    '干边池不能加注',
  );
});

await test('AI 的权益按可争夺底池金额加权，短全下强牌不遮蔽大边池权益', () => {
  const decision: Decision = {
    seat: 0,
    street: 'river',
    board: [0, 4, 8, 12, 16],
    button: 0,
    pot: 210,
    call: 10,
    stack: 1000,
    streetBet: 90,
    action: { type: 'call' },
    paid: 10,
    effectiveRisk: 10,
    activeSeats: [0, 1, 2],
    stacks: [1000, 0, 1000, 0, 0],
    committed: [90, 10, 100, 0, 0],
    streetBets: [90, 10, 100, 0, 0],
    folded: [false, false, false, true, true],
    lastRaise: 10,
    raiseOpen: true,
    minTo: 110,
    maxTo: 1090,
    history: [],
  };
  const ranges = [
    { seat: 1, combos: [] },
    { seat: 2, combos: [] },
  ];
  const worlds = [
    {
      holes: [
        [40, 44],
        [48, 49],
        [20, 24],
      ],
      ranks: [2, 3, 1],
      responseRolls: [0.5, 0.5],
    },
  ];
  assert.equal(
    equityFromWorlds(worlds).equity,
    0,
    '整体摊牌份额被短码强牌压到零',
  );
  assert(
    Math.abs(projectedPotEquity(decision, worlds, ranges) - 180 / 210) < 1e-12,
    '主池30输给短码，边池180仍可获胜',
  );
});

await test('短大盲时模型使用名义大盲的实际跟注额，而不是公共投入最大值', () => {
  let state = startHand({ stacks: [1000, 1000, 1000, 5, 2], button: 2 });
  // Hero may not be first; clear earlier choices without raises.
  while (state.toAct !== 0 && state.street === 'preflop') {
    const legal = legalActions(state)!;
    state = act(state, legal.call ? { type: 'call' } : { type: 'check' });
  }
  const legal = legalActions(state)!;
  assert.equal(Math.max(...state.streetBets), 5);
  assert.equal(legal.call, 10);
  state = act(state, { type: 'call' });
  const hero = state.actions.find((action) => action.seat === 0)!;
  assert.equal(hero.call, legal.call);
  const point = reviewHand({ ...state, actions: [hero] }, 100)[0];
  assert.equal(point.call, legal.call);
  assert.equal(point.threshold, legal.call / (legal.pot + legal.call));
});

await test('三档难度确实改变策略，而非只更换标签或抽样次数', () => {
  const state = startHand({ deck: shuffledDeck(seededRandom(883)) });
  const signatures = difficulties.map((difficulty) =>
    Array.from({ length: 80 }, (_, seed) =>
      JSON.stringify(
        chooseBotAction(
          state,
          0.17,
          'balanced',
          seededRandom(seed * 919),
          difficulty,
        ),
      ),
    ).join('|'),
  );
  assert.notEqual(signatures[0], signatures[1]);
  // In a deep out-of-position postflop spot, advanced applies equity realization.
  const post = {
    ...state,
    street: 'flop' as const,
    board: [1, 21, 39],
    committed: [20, 20, 20, 20, 20] as [number, number, number, number, number],
    streetBets: [0, 0, 0, 40, 0] as [number, number, number, number, number],
    toAct: 1 as const,
  };
  const standard = Array.from({ length: 80 }, (_, seed) =>
    JSON.stringify(
      chooseBotAction(
        post,
        0.3,
        'balanced',
        seededRandom(seed * 919),
        'standard',
      ),
    ),
  ).join('|');
  const advanced = Array.from({ length: 80 }, (_, seed) =>
    JSON.stringify(
      chooseBotAction(
        post,
        0.3,
        'balanced',
        seededRandom(seed * 919),
        'advanced',
      ),
    ),
  ).join('|');
  assert.notEqual(standard, advanced);
});

await test('候选动作全部合法；采样容差内的近似动作不被扣分', () => {
  let state = startHand({ deck: shuffledDeck(seededRandom(899)) });
  while (state.toAct !== 0) state = act(state, { type: 'call' });
  const before = state;
  state = act(state, { type: 'call' });
  const point = reviewHand(state, 240)[0];
  for (const candidate of point.alternatives)
    assertAction(before, candidate.action);
  assert.equal(
    point.alternatives.find(
      (option) =>
        JSON.stringify(option.action) ===
        JSON.stringify(point.recommendation.action),
    )!.score,
    100,
  );
});

await test('复盘解释对应实际手牌、免费过牌与已观察的范围行动', () => {
  const points = reviewHand(reviewFixture(), 100);
  assert.match(points[0].advice, /起手牌是/);
  assert.match(points[0].advice, /翻牌前的一轮摊牌模型/);
  assert(points[0].rangeNotes.some((note) => note.includes('跟注 1 次')));
  const flop = points.find((point) => point.street === 'flop')!;
  assert.match(flop.advice, /决策当时已成牌型/);
  assert.match(
    flop.alternatives.find((option) => option.action.type === 'check')!.reason,
    /免费过牌/,
  );
  assert(flop.rangeNotes.some((note) => note.includes('最近过牌')));
});

await test('普通尺度下顶对真实防守，区分超对、顶对、中对、底对与空气', () => {
  const board = [45, 6, 37]; // K♥ 3♣ J♥
  const probability = (hole: number[]) =>
    continuationProbability(hole, board, 23, 94, 'tricky', 1, true);
  const over = probability([50, 51]);
  const top = probability([46, 18]);
  const middle = probability([38, 18]);
  const bottom = probability([7, 8]);
  const air = probability([0, 16]);
  assert(top > 0.8, '普通三分之一池附近下注不应让 K6 顶对弃牌九成');
  assert(over >= top && top > middle && middle > bottom && bottom > air);
  assert(
    continuationProbability([46, 18], board, 23, 94, 'careful', 2, true) >=
      0.72,
  );
});

await test('线上 43o 回归：弱对子不会因为对手魔法过度弃牌而每街都被要求诈唬', () => {
  const assignments = new Map([
    [4, 7],
    [9, 8],
    [3, 46],
    [8, 18],
    [11, 45],
    [12, 6],
    [13, 37],
    [15, 15],
    [17, 32],
  ]);
  const remaining = Array.from({ length: 52 }, (_, card) => card).filter(
    (card) => ![...assignments.values()].includes(card),
  );
  const deck = Array.from({ length: 52 }, (_, index) =>
    assignments.has(index) ? assignments.get(index)! : remaining.shift()!,
  );
  let state = startHand({ deck });
  const actions: PokerAction[] = [
    { type: 'fold' },
    { type: 'call' },
    { type: 'call' },
    { type: 'fold' },
    { type: 'check' },
    { type: 'check' },
    { type: 'check' },
    { type: 'check' },
    { type: 'check' },
    { type: 'raise', to: 18 },
    { type: 'call' },
    { type: 'fold' },
    { type: 'check' },
    { type: 'check' },
  ];
  for (const action of actions) state = act(state, action);
  assert.deepEqual(state.holes[0], [7, 8]);
  assert.deepEqual(state.board, [45, 6, 37, 15, 32]);
  const points = reviewHand(state, 1400);
  assert.deepEqual(
    points.map((point) => point.street),
    ['preflop', 'flop', 'turn', 'river'],
  );
  assert.deepEqual(
    points.map((point) => point.recommendation.action.type),
    ['fold', 'check', 'fold', 'check'],
  );
  assert.equal(points[2].recommendation.action.type, 'fold');
  assert.equal(points[3].recommendation.action.type, 'check');
  assert(
    points[1].score >= 75,
    '可防守的弱对子免费过牌不应因为假设过度弃牌而得零分',
  );
  assert.equal(points[3].score, 100);
  assert(
    points[0].alternatives.find((option) => option.action.type === 'fold')!
      .score >= 90,
    '未求解后续树的翻牌前模型必须容许更稳健的弃牌',
  );
  assert(points.every((point) => (point.modelAllowanceBB ?? 0) > 0));
  assert.match(points[1].advice, /启发式/);
  assert(points[1].limitations.some((limit) => limit.includes('统计置信区间')));
  assert.match(points[0].advice, /候选估值接近，采用较稳健的选择/);
  for (const point of points)
    assert.equal(
      point.recommendation.evBB,
      point.alternatives.find(
        (option) =>
          JSON.stringify(option.action) ===
          JSON.stringify(point.recommendation.action),
      )!.evBB,
    );
  console.log(
    '43o 线上回归：',
    points
      .map(
        (point) =>
          `${point.street} ${point.score} / ${point.recommendation.label}`,
      )
      .join('；'),
  );
});

await test('稳健推荐不会把明显高价值的私人坚果下注降级成免费过牌', () => {
  const state = startHand();
  state.holes[0] = [48, 44]; // A♠ K♠; private royal flush, not a shared board.
  const decision: Decision = {
    seat: 0,
    street: 'river',
    board: [40, 36, 32, 1, 5],
    button: 0,
    pot: 150,
    call: 0,
    stack: 950,
    streetBet: 0,
    action: { type: 'check' },
    paid: 0,
    effectiveRisk: 0,
    activeSeats: [0, 1, 2],
    stacks: [950, 950, 950, 1000, 1000],
    committed: [50, 50, 50, 0, 0],
    streetBets: [0, 0, 0, 0, 0],
    folded: [false, false, false, true, true],
    lastRaise: 10,
    raiseOpen: true,
    minTo: 10,
    maxTo: 950,
    history: [],
  };
  state.actions = [decision];
  const point = reviewHand(state, 1400)[0];
  const check = point.alternatives.find(
    (option) => option.action.type === 'check',
  )!;
  assert.equal(point.recommendation.action.type, 'raise');
  assert(point.recommendation.evBB > check.evBB + 2);
  assert.equal(
    point.recommendation.evBB,
    point.alternatives.find(
      (option) =>
        JSON.stringify(option.action) ===
        JSON.stringify(point.recommendation.action),
    )!.evBB,
  );
});

const bench = reviewFixture();
const started = performance.now();
const review = reviewHand(bench, 900, undefined, DEFAULT_SEAT_STYLES);
const elapsed = performance.now() - started;
const bot = startHand({ deck: shuffledDeck(seededRandom(558)) });
const botStarted = performance.now();
decideBot(bot, bot.toAct!, 'balanced', 'advanced');
console.log(
  `策略性能：${review.length} 个选择 / 900 样本复盘 ${elapsed.toFixed(0)} ms；进阶 AI ${(performance.now() - botStarted).toFixed(0)} ms。`,
);
