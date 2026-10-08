import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  act,
  legalActions,
  shuffledDeck,
  startHand,
  type HoldemState,
  type PokerAction,
} from '../lib/games/holdem-engine.ts';
import {
  createTableReplay,
  MAX_REPLAY_ACTIONS,
  validateBotDecisionTrace,
  validateTableReplay,
  type BotDecisionTrace,
  type TableReplay,
} from '../lib/games/holdem-replay.ts';
import {
  decideBot,
  seatStyle,
  seededRandom,
} from '../lib/games/holdem-strategy.ts';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const passive = (state: HoldemState): PokerAction =>
  legalActions(state)!.canCheck ? { type: 'check' } : { type: 'call' };
function traceFor(state: HoldemState, action: PokerAction): BotDecisionTrace {
  const legal = legalActions(state)!;
  return {
    seat: legal.seat,
    tableSize: state.tableSize,
    street: state.street as BotDecisionTrace['street'],
    hole: [...state.holes[legal.seat]],
    board: [...state.board],
    pot: legal.pot,
    call: legal.call,
    bigBlind: state.bigBlind,
    position: '测试位置',
    opponents: state.folded.filter(
      (folded, seat) => !folded && seat !== legal.seat,
    ).length,
    equity: 0.42,
    rawEquity: 0.4,
    samples: 260,
    style: 'balanced',
    difficulty: 'standard',
    selectedAction: { ...action },
    policyAction: { ...action },
    selectedIntent: '测试实际行动',
    rationale: ['根据当时公开局面选择，保存实际决策诊断。'],
    mixing: {
      roll: 0.3,
      equityJitterRoll: 0.2,
      adjustedEquity: 0.42,
      realizedEquity: 0.4,
      bluffProbability: 0.06,
      bluffEligible: false,
      bluffTriggered: false,
      draw: 0,
      blocker: false,
      inPosition: false,
      cbet: false,
      steal: false,
    },
    candidates: [{ action: { ...action }, evBB: 0.3, standardErrorBB: 0.1 }],
  };
}
function finish(state: HoldemState, trace = true) {
  let count = 0;
  while (state.street !== 'complete') {
    const move = passive(state);
    state = act(
      state,
      move,
      trace && state.toAct !== 0 ? traceFor(state, move) : undefined,
    );
    assert(++count <= 100);
  }
  return state;
}
function tracedHand() {
  let state = startHand();
  const move = { type: 'fold' } as const;
  state = act(state, move, traceFor(state, move));
  return finish(state);
}
function rejectMutation(
  replay: TableReplay,
  change: (copy: TableReplay) => void,
) {
  const copy = clone(replay);
  change(copy);
  assert.equal(validateTableReplay(copy), false);
}

void test('全桌底牌与回放只在完成后生成，包含已弃牌的 AI 底牌', () => {
  const initial = startHand();
  assert.throws(() => createTableReplay(initial), /结束后/);
  const state = tracedHand();
  const replay = createTableReplay(state);
  assert(validateTableReplay(replay));
  assert.deepEqual(replay.holes, state.holes);
  assert.equal(replay.folded[3], true);
  assert.equal(replay.actions[0].action.type, 'fold');
  assert.equal(replay.actions[0].botTrace?.seat, 3);
  assert.deepEqual(replay.actions[0].botTrace?.hole, state.holes[3]);
  assert(!('deck' in replay));
  assert(!('cursor' in replay));
  assert(!JSON.stringify(replay).includes('history'));
  assert.throws(() => createTableReplay({ ...state, result: null }), /结束后/);
});

void test('实际 AI 行动与诊断原子关联，并隔离调用方随后对诊断的修改', () => {
  const initial = startHand();
  const move = passive(initial);
  const input = traceFor(initial, move);
  const expected = clone(input);
  const saved = JSON.stringify(initial);
  const state = act(initial, move, input);
  assert.equal(JSON.stringify(initial), saved);
  assert.deepEqual(state.actions[0].botTrace, expected);
  input.hole[0] = 51;
  input.board.push(50);
  input.rationale[0] = '改写';
  input.mixing.roll = 0.99;
  input.candidates[0].evBB = -100;
  input.candidates[0].action = { type: 'fold' };
  assert.deepEqual(state.actions[0].botTrace, expected);
  const completed = finish(state);
  assert.deepEqual(completed.actions[0].botTrace, expected);
  const replay = createTableReplay(completed);
  assert.deepEqual(replay.actions[0].botTrace, expected);
  replay.holes[0][0] = 51;
  replay.result.payouts[0] = -1;
  replay.actions[0].board.push(50);
  replay.actions[0].botTrace!.rationale[0] = '再次改写';
  assert.deepEqual(completed.actions[0].botTrace, expected);
  assert.notEqual(completed.holes[0][0], 51);
  assert(completed.result!.payouts[0] >= 0);
  assert.deepEqual(completed.actions[0].board, []);
});

void test('拒绝错位、错误行动、未来公共牌和英雄伪造 AI 诊断', () => {
  const initial = startHand();
  const move = passive(initial);
  const valid = traceFor(initial, move);
  for (const patch of [
    { seat: 4 },
    { tableSize: 4 },
    { street: 'flop' },
    { hole: [...initial.holes[4]] },
    { board: [40, 41, 42] },
    { pot: valid.pot + 1 },
    { call: valid.call + 1 },
    { bigBlind: valid.bigBlind + 1 },
    { opponents: 1 },
    { selectedAction: { type: 'fold' } },
  ])
    assert.throws(
      () => act(initial, move, { ...valid, ...patch } as BotDecisionTrace),
      /诊断/,
    );
  const extra = { ...valid, deck: initial.deck };
  assert.equal(validateBotDecisionTrace(extra), false);
  assert.throws(() => act(initial, move, extra), /诊断/);
  let hero = initial;
  while (hero.toAct !== 0) hero = act(hero, passive(hero));
  assert.throws(
    () => act(hero, passive(hero), traceFor(hero, passive(hero))),
    /诊断/,
  );
});

void test('诊断校验拒绝非有限数字、过大字段和不一致 EV 覆盖记录', () => {
  const state = startHand();
  const trace = traceFor(state, passive(state));
  assert(validateBotDecisionTrace(trace));
  const invalids = [
    { ...trace, equity: NaN },
    { ...trace, mixing: { ...trace.mixing, roll: 1 } },
    { ...trace, rationale: Array.from({ length: 13 }, () => 'a') },
    { ...trace, rationale: ['a'.repeat(1001)] },
    {
      ...trace,
      candidates: [
        { action: trace.selectedAction, evBB: Infinity, standardErrorBB: 0 },
      ],
    },
    {
      ...trace,
      candidates: [{ action: { type: 'fold' }, evBB: 0, standardErrorBB: 0 }],
    },
    { ...trace, policyAction: { type: 'fold' } },
  ];
  for (const input of invalids)
    assert.equal(validateBotDecisionTrace(input), false);
  const override: BotDecisionTrace = {
    ...trace,
    policyAction: { type: 'fold' },
    override: {
      reason: 'call-ev',
      from: { type: 'fold' },
      to: trace.selectedAction,
      callEVBB: 0.3,
      toleranceBB: 0.1,
      changed: true,
    },
  };
  assert(validateBotDecisionTrace(override));
  assert.equal(
    validateBotDecisionTrace({
      ...override,
      override: { ...override.override, changed: false },
    }),
    false,
  );
});

void test('真实同花加顺子组合听牌的诊断可保存，且完整实际策略牌局均可回放', () => {
  // Three-handed: seat1 holds 4s5s, flop6s7sJh => flush + straight feature1.6.
  const prefix = [8, 0, 4, 12, 1, 5, 2, 16, 20, 37];
  const deck = [
    ...prefix,
    ...Array.from({ length: 52 }, (_, card) => card).filter(
      (card) => !prefix.includes(card),
    ),
  ];
  let combo = startHand({ tableSize: 3, deck });
  while (combo.street === 'preflop') combo = act(combo, passive(combo));
  assert.equal(combo.toAct, 1);
  const choice = decideBot(combo, 1, 'tricky', 'advanced');
  assert.equal(choice.trace.mixing.draw, 1.6);
  assert(validateBotDecisionTrace(choice.trace));
  combo = act(combo, choice.action, choice.trace);
  const replay = createTableReplay(finish(combo));
  assert.equal(replay.actions[3].botTrace!.mixing.draw, 1.6);
  assert.deepEqual(replay.actions[3].botTrace!.selectedAction, choice.action);

  for (const tableSize of [2, 5, 9]) {
    let state = startHand({
      tableSize,
      initialStack: 200,
      hand: tableSize + 40,
      deck: shuffledDeck(seededRandom(0x5eed + tableSize)),
    });
    let actions = 0;
    while (state.street !== 'complete') {
      const seat = state.toAct!;
      if (seat === 0) state = act(state, passive(state));
      else {
        const selected = decideBot(state, seat, seatStyle(seat), 'casual');
        assert(validateBotDecisionTrace(selected.trace));
        state = act(state, selected.action, selected.trace);
      }
      assert(++actions < 240);
    }
    assert(validateTableReplay(createTableReplay(state)));
    assert(
      state.actions
        .filter((decision) => decision.seat !== 0)
        .every((decision) => decision.botTrace),
    );
  }
});

void test('旧局没有诊断仍可回放，折叠获胜与未被跟注筹码归还保持一致', () => {
  const old = createTableReplay(finish(startHand(), false));
  assert(old.actions.every((action) => action.botTrace === undefined));
  assert(validateTableReplay(clone(old)));
  let state = startHand();
  state = act(state, { type: 'raise', to: 100 });
  while (state.street !== 'complete') state = act(state, { type: 'fold' });
  const replay = createTableReplay(state);
  assert.equal(replay.result.reason, 'fold');
  assert.equal(replay.result.returned[3], 90);
  assert.deepEqual(replay.board, []);
  assert(validateTableReplay(clone(replay)));
});

void test('名义短大盲、英雄先弃牌、累计短全下与跨街自动跑牌可正确存档', () => {
  let shortBlind = startHand({ button: 2, stacks: [100, 100, 100, 3, 4] });
  assert.equal(legalActions(shortBlind)!.call, 10);
  shortBlind = act(shortBlind, { type: 'call' });
  shortBlind = act(shortBlind, { type: 'fold' });
  shortBlind = act(shortBlind, { type: 'fold' });
  assert.equal(shortBlind.street, 'complete');
  assert.equal(shortBlind.result!.returned[0], 6);
  assert(validateTableReplay(createTableReplay(shortBlind)));

  let heroFold = startHand({ button: 2 });
  heroFold = act(heroFold, { type: 'fold' });
  heroFold = finish(heroFold);
  const heroReplay = createTableReplay(heroFold);
  assert.equal(heroReplay.actions[0].seat, 0);
  assert.equal(heroReplay.folded[0], true);
  assert.deepEqual(heroReplay.holes[0], heroFold.holes[0]);
  assert(validateTableReplay(heroReplay));

  let cumulative = startHand({ stacks: [1000, 1000, 22, 1000, 30] });
  while (cumulative.street === 'preflop')
    cumulative = act(cumulative, passive(cumulative));
  cumulative = act(cumulative, { type: 'raise', to: 10 });
  cumulative = act(cumulative, { type: 'raise', to: 12 });
  cumulative = act(cumulative, { type: 'call' });
  cumulative = act(cumulative, { type: 'raise', to: 20 });
  cumulative = act(cumulative, { type: 'call' });
  assert.equal(legalActions(cumulative)!.canRaise, true);
  cumulative = act(cumulative, { type: 'raise', to: 30 });
  cumulative = finish(cumulative);
  assert(validateTableReplay(createTableReplay(cumulative)));

  let runout = startHand({ button: 2, stacks: [150, 100, 70, 40, 25] });
  runout = act(runout, { type: 'raise', to: 150 });
  while (runout.street !== 'complete') runout = act(runout, { type: 'call' });
  const allInReplay = createTableReplay(runout);
  assert.equal(allInReplay.board.length, 5);
  assert(
    allInReplay.actions.every(
      (action) => action.street === 'preflop' && action.board.length === 0,
    ),
  );
  assert.equal(allInReplay.result.pots.length, 4);
  assert.equal(allInReplay.result.returned[0], 50);
  assert(validateTableReplay(allInReplay));

  let zeroEligible = startHand({ tableSize: 3, button: 0 });
  zeroEligible = act(zeroEligible, { type: 'fold' });
  zeroEligible = act(zeroEligible, { type: 'call' });
  zeroEligible = act(zeroEligible, { type: 'check' });
  zeroEligible = act(zeroEligible, { type: 'fold' });
  assert(validateTableReplay(createTableReplay(zeroEligible)));
});

void test('本机存档拒绝重复底牌、错街未来牌、诊断错配、筹码与顺序损坏', () => {
  const replay = createTableReplay(tracedHand());
  assert(validateTableReplay(clone(replay)));
  rejectMutation(replay, (copy) => {
    copy.holes[0][0] = copy.holes[1][0];
  });
  rejectMutation(replay, (copy) => {
    copy.actions[0].board = copy.board.slice(0, 3);
  });
  rejectMutation(replay, (copy) => {
    copy.actions[0].botTrace!.seat = 4;
  });
  rejectMutation(replay, (copy) => {
    copy.actions[0].botTrace!.hole = [...copy.holes[4]];
  });
  rejectMutation(replay, (copy) => {
    copy.actions[0].botTrace!.selectedAction = { type: 'check' };
  });
  rejectMutation(replay, (copy) => {
    copy.actions[1].paid++;
  });
  rejectMutation(replay, (copy) => {
    copy.actions[1].stack++;
  });
  rejectMutation(replay, (copy) => {
    copy.actions[1].streetBet++;
  });
  rejectMutation(replay, (copy) => {
    copy.actions[1].pot++;
  });
  rejectMutation(replay, (copy) => {
    copy.actions[1].index = 0;
  });
  rejectMutation(replay, (copy) => {
    copy.result.payouts[0]++;
  });
  rejectMutation(replay, (copy) => {
    copy.result.winners = [3];
  });
  rejectMutation(replay, (copy) => {
    copy.actions.reverse();
  });
  rejectMutation(replay, (copy) => {
    copy.actions = Array(MAX_REPLAY_ACTIONS + 1).fill(copy.actions[0]);
  });
  assert.equal(
    validateTableReplay({
      ...replay,
      deck: Array.from({ length: 52 }, (_, i) => i),
    }),
    false,
  );
  assert.equal(validateTableReplay(null), false);
  assert.equal(validateTableReplay({}), false);
});

void test('2–9 人真实多街行动、短筹码全下与边池均能序列化验证', () => {
  let seed = 0x7265706c;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let hand = 1; hand <= 320; hand++) {
    const tableSize = 2 + (hand % 8);
    let state = startHand({
      hand,
      tableSize,
      button: hand % tableSize,
      smallBlind: 2,
      bigBlind: 7,
      stacks: Array.from(
        { length: tableSize },
        () => 1 + Math.floor(random() * 300),
      ),
      deck: shuffledDeck(random),
    });
    let actions = 0;
    while (state.street !== 'complete') {
      const legal = legalActions(state)!;
      const roll = random();
      const move: PokerAction =
        legal.canRaise && roll < 0.24
          ? {
              type: 'raise',
              to:
                legal.maxTo < legal.minTo || roll < 0.08
                  ? legal.maxTo
                  : legal.minTo,
            }
          : roll < 0.36
            ? { type: 'fold' }
            : passive(state);
      state = act(
        state,
        move,
        state.toAct !== 0 ? traceFor(state, move) : undefined,
      );
      assert(++actions < 240);
    }
    const replay = createTableReplay(state);
    assert(validateTableReplay(clone(replay)), `第 ${hand} 手回放损坏`);
    for (const step of replay.actions) {
      assert.deepEqual(step.board, replay.board.slice(0, step.board.length));
      assert.equal(step.botTrace === undefined, step.seat === 0);
    }
  }
  assert(validateTableReplay(createTableReplay(startHand({ stacks: [1, 1] }))));
});
