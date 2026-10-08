import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  act,
  legalActions,
  otherSeat,
  potSize,
  shuffledDeck,
  startHand,
  type HoldemState,
  type PokerAction,
  type Seat,
} from '../lib/games/holdem-engine.ts';

// Both players must play the royal flush on the board. Burn cards are explicit
// so run-outs can be checked without comparing against a second evaluator.
const prefix = [1, 2, 5, 6, 0, 32, 36, 40, 3, 44, 4, 48];
const royalBoardDeck = [
  ...prefix,
  ...Array.from({ length: 52 }, (_, i) => i).filter(
    (card) => !prefix.includes(card),
  ),
];
const royalBoard = [32, 36, 40, 44, 48];
const sum = (numbers: readonly number[]) =>
  numbers.reduce((total, value) => total + value, 0);

function assertConserved(state: HoldemState) {
  assert.equal(
    sum(state.stacks) + (state.street === 'complete' ? 0 : potSize(state)),
    sum(state.startingStacks),
    `筹码不守恒: ${state.street}`,
  );
  assert(
    state.stacks.every((stack) => Number.isSafeInteger(stack) && stack >= 0),
  );
  assert(
    state.committed.every((chips) => Number.isSafeInteger(chips) && chips >= 0),
  );
}

function action(state: HoldemState, next: PokerAction) {
  const saved = JSON.stringify(state);
  const result = act(state, next);
  assert.equal(JSON.stringify(state), saved, '行动不能改写上一份状态');
  assertConserved(result);
  return result;
}

function newHand(options: Parameters<typeof startHand>[0] = {}) {
  const state = startHand({ deck: royalBoardDeck, ...options });
  assertConserved(state);
  return state;
}

function limpToFlop(button: Seat = 0) {
  let state = newHand({ button });
  state = action(state, { type: 'call' });
  return action(state, { type: 'check' });
}

void test('合法牌组验证及可复现洗牌，发牌不会重复使用底牌或烧牌', () => {
  assert.throws(() => startHand({ deck: [0, 1] }), /牌组/);
  assert.throws(
    () => startHand({ deck: Array.from({ length: 52 }, () => 0) }),
    /牌组/,
  );
  assert.throws(() => startHand({ stacks: [0, 1000] }), /筹码/);
  assert.throws(() => startHand({ stacks: [10.5, 1000] }), /筹码/);
  const seeded = () => {
    let seed = 93;
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  };
  const deck = shuffledDeck(seeded());
  assert.deepEqual(deck, shuffledDeck(seeded()));
  assert.equal(new Set(deck).size, 52);
  const state = newHand();
  assert.deepEqual(state.holes, [
    [2, 6],
    [1, 5],
  ]);
  assert.equal(state.cursor, 4);
  assert.deepEqual(state.board, []);
});

void test('单挑 button 是小盲，翻牌前先手；翻牌后由大盲先手', () => {
  for (const button of [0, 1] as const) {
    let state = newHand({ button });
    assert.equal(state.toAct, button);
    assert.equal(state.streetBets[button], 5);
    assert.equal(state.streetBets[otherSeat(button)], 10);
    assert.deepEqual(
      state.holes[otherSeat(button)],
      [1, 5],
      '大盲先收到每轮发牌',
    );
    assert.deepEqual(
      state.holes[button],
      [2, 6],
      'button／小盲最后收到每轮发牌',
    );
    assert.equal(legalActions(state)?.call, 5);
    state = action(state, { type: 'call' });
    state = action(state, { type: 'check' });
    assert.equal(state.street, 'flop');
    assert.equal(state.toAct, otherSeat(button));
    assert.deepEqual(state.board, royalBoard.slice(0, 3));
    assert.deepEqual(state.streetBets, [0, 0]);
    for (const street of ['turn', 'river'] as const) {
      state = action(state, { type: 'check' });
      state = action(state, { type: 'check' });
      assert.equal(state.street, street);
      assert.equal(state.toAct, otherSeat(button));
    }
  }
});

void test('小盲 limp 不能跳过大盲的过牌或加注权', () => {
  const limped = action(newHand(), { type: 'call' });
  assert.equal(limped.street, 'preflop');
  assert.equal(limped.toAct, 1);
  assert.deepEqual(limped.acted, [true, false]);
  const legal = legalActions(limped)!;
  assert.equal(legal.canCheck, true);
  assert.equal(legal.canRaise, true);
  assert.equal(legal.minTo, 20);
  const checked = action(limped, { type: 'check' });
  assert.equal(checked.street, 'flop');
  let raised = action(limped, { type: 'raise', to: 30 });
  assert.equal(raised.street, 'preflop');
  assert.equal(raised.toAct, 0);
  assert.equal(legalActions(raised)?.call, 20);
  raised = action(raised, { type: 'call' });
  assert.equal(raised.street, 'flop');
  assert.equal(potSize(raised), 60);
});

void test('大额下注后对手弃牌，退回未匹配下注，底池与筹码守恒', () => {
  const raised = action(newHand(), { type: 'raise', to: 500 });
  assert.equal(potSize(raised), 510);
  const state = action(raised, { type: 'fold' });
  assert.equal(state.street, 'complete');
  assert.equal(state.toAct, null);
  assert.deepEqual(state.board, []);
  assert.equal(state.result?.winner, 0);
  assert.equal(state.result?.reason, 'fold');
  assert.deepEqual(state.result?.returned, [490, 0]);
  assert.equal(state.result?.pot, 20);
  assert.deepEqual(state.stacks, [1010, 990]);
  assert.deepEqual(state.committed, [10, 10]);
  assert.equal(legalActions(state), null);
  assert.throws(() => act(state, { type: 'check' }), /不能行动/);
});

void test('小盲直接弃牌时大盲未匹配的五枚盲注退回', () => {
  const state = action(newHand(), { type: 'fold' });
  assert.deepEqual(state.result?.returned, [0, 5]);
  assert.equal(state.result?.pot, 10);
  assert.equal(state.result?.winner, 1);
  assert.deepEqual(state.stacks, [995, 1005]);
});

void test('双方全下并跟注后自动跑完五张公共牌，烧牌不参与摊牌', () => {
  let state = action(newHand({ stacks: [40, 40] }), { type: 'raise', to: 40 });
  assert.equal(state.toAct, 1);
  assert.equal(state.street, 'preflop');
  assert.equal(legalActions(state)?.call, 30);
  state = action(state, { type: 'call' });
  assert.equal(state.street, 'complete');
  assert.deepEqual(state.board, royalBoard);
  assert.equal(state.cursor, 12);
  assert.equal(new Set([...state.holes.flat(), ...state.board]).size, 9);
  assert.equal(state.result?.reason, 'showdown');
  assert.equal(state.result?.pot, 80);
  assert.deepEqual(state.result?.returned, [0, 0]);
});

void test('短筹码跟注全下只争夺匹配底池，超额下注退回', () => {
  let state = action(newHand({ stacks: [100, 45] }), {
    type: 'raise',
    to: 100,
  });
  const legal = legalActions(state)!;
  assert.equal(legal.owed, 90);
  assert.equal(legal.call, 35);
  assert.equal(legal.pot, 55, '未匹配的55枚筹码不应计算为可争夺底池');
  assert.equal(legal.potOdds, 35 / 90);
  state = action(state, { type: 'call' });
  assert.deepEqual(state.board, royalBoard);
  assert.equal(state.result?.winner, 'tie');
  assert.deepEqual(state.result?.returned, [55, 0]);
  assert.equal(state.result?.pot, 90);
  assert.deepEqual(state.stacks, [100, 45]);
});

void test('对手已经全下时不能再加注，只能跟注或弃牌', () => {
  const state = action(newHand({ stacks: [35, 1000] }), {
    type: 'raise',
    to: 35,
  });
  const legal = legalActions(state)!;
  assert.equal(state.stacks[0], 0);
  assert.equal(legal.canRaise, false);
  assert.equal(legal.canCheck, false);
  assert.equal(legal.call, 25);
  const original = JSON.stringify(state);
  assert.throws(() => act(state, { type: 'raise', to: 100 }), /加注/);
  assert.throws(() => act(state, { type: 'check' }), /不能过牌/);
  assert.equal(JSON.stringify(state), original, '拒绝非法行动不能污染状态');
});

void test('最小再加注按最近完整加注增量计算，不按底池或总注额倍增', () => {
  let state = newHand();
  assert.equal(legalActions(state)?.minTo, 20);
  state = action(state, { type: 'raise', to: 30 });
  assert.equal(state.lastRaise, 20);
  assert.equal(legalActions(state)?.minTo, 50);
  assert.throws(() => act(state, { type: 'raise', to: 49 }), /加注/);
  state = action(state, { type: 'raise', to: 70 });
  assert.equal(state.lastRaise, 40);
  assert.equal(legalActions(state)?.minTo, 110);
  assert.throws(() => act(state, { type: 'raise', to: 100 }), /加注/);
  state = action(state, { type: 'raise', to: 110 });
  assert.equal(state.lastRaise, 40);
  assert.equal(legalActions(state)?.minTo, 150);
  const flop = limpToFlop();
  assert.equal(legalActions(flop)?.minTo, 10);
  assert.equal(
    legalActions(action(flop, { type: 'raise', to: 15 }))?.minTo,
    30,
  );
});

void test('不足完整加注的短全下不重开已行动玩家的加注权', () => {
  let state = newHand({ stacks: [1000, 35] });
  state = action(state, { type: 'raise', to: 30 });
  assert.equal(legalActions(state)?.minTo, 50);
  assert.equal(legalActions(state)?.maxTo, 35);
  state = action(state, { type: 'raise', to: 35 });
  assert.equal(state.lastRaise, 20, '五枚短加注不能覆盖二十枚完整增量');
  assert.equal(state.raiseOpen[0], false);
  assert.equal(state.toAct, 0);
  const legal = legalActions(state)!;
  assert.equal(legal.call, 5);
  assert.equal(legal.canCheck, false);
  assert.equal(legal.canRaise, false);
  assert.throws(() => act(state, { type: 'raise', to: 55 }), /加注/);
  const called = action(state, { type: 'call' });
  assert.equal(called.street, 'complete');
  assert.equal(called.result?.pot, 70);
  const folded = action(state, { type: 'fold' });
  assert.equal(folded.result?.winner, 1);
  assert.deepEqual(folded.result?.returned, [0, 5]);
});

void test('面临下注时拒绝过牌，没有欠注时拒绝虚假跟注', () => {
  const preflop = newHand();
  assert.throws(() => act(preflop, { type: 'check' }), /不能过牌/);
  const flop = limpToFlop();
  assert.throws(() => act(flop, { type: 'call' }), /无需跟注/);
  const bet = action(flop, { type: 'raise', to: 50 });
  assert.throws(() => act(bet, { type: 'check' }), /不能过牌/);
  assert.throws(() => act(bet, { type: 'raise', to: 99 }), /加注/);
});

void test('相同公共牌成最强牌时严格平分底池，不用花色破平局', () => {
  let state = limpToFlop();
  for (let i = 0; i < 6; i++) state = action(state, { type: 'check' });
  assert.equal(state.street, 'complete');
  assert.deepEqual(state.board, royalBoard);
  assert.equal(state.result?.winner, 'tie');
  assert.equal(state.result?.labels[0], '同花顺');
  assert.equal(state.result?.labels[1], '同花顺');
  assert.equal(state.result?.pot, 20);
  assert.deepEqual(state.stacks, [1000, 1000]);
});

void test('非平局摊牌将匹配底池完整付给胜者，结算不遗留筹码', () => {
  // AA versus KK on 2 / 7 / 9 / J / Q, with no flush or straight.
  const first = [44, 48, 45, 49, 50, 0, 21, 30, 51, 38, 2, 41];
  const deck = [
    ...first,
    ...Array.from({ length: 52 }, (_, card) => card).filter(
      (card) => !first.includes(card),
    ),
  ];
  let state = newHand({ stacks: [100, 100], deck });
  state = action(state, { type: 'raise', to: 100 });
  state = action(state, { type: 'call' });
  assert.deepEqual(state.board, [0, 21, 30, 38, 41]);
  assert.equal(state.result?.winner, 0);
  assert.equal(state.result?.pot, 200);
  assert.deepEqual(state.stacks, [200, 0]);
  assert.deepEqual(state.result?.returned, [0, 0]);
});

void test('翻牌后的全下只发剩余街，弃牌退款保留前面街的匹配底池', () => {
  let allIn = newHand({ stacks: [40, 40] });
  allIn = action(allIn, { type: 'call' });
  allIn = action(allIn, { type: 'check' });
  assert.equal(allIn.cursor, 8);
  allIn = action(allIn, { type: 'raise', to: 30 });
  allIn = action(allIn, { type: 'call' });
  assert.deepEqual(allIn.board, royalBoard);
  assert.equal(allIn.cursor, 12);
  assert.equal(allIn.result?.pot, 80);
  const flopBet = action(limpToFlop(), { type: 'raise', to: 50 });
  const folded = action(flopBet, { type: 'fold' });
  assert.equal(folded.result?.winner, 1);
  assert.equal(folded.result?.pot, 20);
  assert.deepEqual(folded.result?.returned, [0, 50]);
  assert.deepEqual(folded.stacks, [990, 1010]);
});

void test('短盲注全下仍保留未补齐玩家的跟弃决策，无欠注时直接发完', () => {
  let state = newHand({ stacks: [1000, 7] });
  assert.equal(state.street, 'preflop');
  assert.equal(state.toAct, 0);
  assert.equal(legalActions(state)?.call, 2);
  assert.equal(legalActions(state)?.canRaise, false);
  state = action(state, { type: 'call' });
  assert.equal(state.result?.pot, 14);
  assert.deepEqual(state.stacks, [1000, 7]);
  for (const stacks of [
    [3, 1000],
    [1000, 3],
  ] as [number, number][]) {
    const short = newHand({ stacks });
    assert.equal(short.street, 'complete');
    assert.deepEqual(short.board, royalBoard);
    assert.equal(short.result?.pot, 6);
    assert.deepEqual(short.stacks, stacks);
  }
});

void test('下一手换 button 和手数由调用方传入，沿用结算后的筹码', () => {
  const ended = action(newHand(), { type: 'fold' });
  const next = newHand({
    hand: ended.hand + 1,
    button: otherSeat(ended.button),
    stacks: [...ended.stacks],
  });
  assert.equal(next.hand, 2);
  assert.equal(next.button, 1);
  assert.equal(next.toAct, 1);
  assert.deepEqual(next.startingStacks, ended.stacks);
  assert.deepEqual(next.committed, [10, 5]);
  assert.deepEqual(ended.stacks, [995, 1005], '开始新手不能修改上手结算');
});
