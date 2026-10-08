import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  act,
  legalActions,
  nextSeat,
  tableSeats,
  blindSeats,
  DEFAULT_TABLE_CONFIG,
  validateTableConfig,
  SEATS,
  seatsAfter,
  potSize,
  shuffledDeck,
  startHand,
  type HoldemState,
  type PokerAction,
  type Seat,
  type SeatValues,
} from '../lib/games/holdem-engine.ts';

const sum = (numbers: readonly number[]) => numbers.reduce((a, b) => a + b, 0);
const royalBoard = [32, 36, 40, 44, 48];
function makeDeck(prefix: number[]) {
  assert.equal(new Set(prefix).size, prefix.length);
  return [
    ...prefix,
    ...Array.from({ length: 52 }, (_, i) => i).filter(
      (card) => !prefix.includes(card),
    ),
  ];
}
const royalDeck = makeDeck([
  0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 2, 32, 36, 40, 6, 44, 10, 48,
]);
function assertConserved(state: HoldemState) {
  for (const values of [
    state.holes,
    state.stacks,
    state.startingStacks,
    state.committed,
    state.streetBets,
    state.folded,
    state.acted,
    state.raiseOpen,
    state.lastActedBet,
  ])
    assert.equal(values.length, state.tableSize);
  assert.equal(
    sum(state.stacks) + (state.street === 'complete' ? 0 : potSize(state)),
    sum(state.startingStacks),
  );
  assert(
    state.stacks.every((chips) => Number.isSafeInteger(chips) && chips >= 0),
  );
  assert(
    state.committed.every((chips) => Number.isSafeInteger(chips) && chips >= 0),
  );
  if (state.result) {
    assert.equal(sum(state.result.payouts), state.result.pot);
    assert.equal(potSize(state), state.result.pot);
    assert.equal(
      sum(state.result.pots.map((pot) => pot.amount)),
      state.result.pot,
    );
    for (const pot of state.result.pots) {
      assert(
        pot.winners.every(
          (seat) => pot.eligible.includes(seat) && !state.folded[seat],
        ),
      );
    }
  } else {
    assert.notEqual(state.toAct, null);
    assert(!state.folded[state.toAct!]);
    assert(state.stacks[state.toAct!] > 0);
  }
}
function action(previous: HoldemState, move: PokerAction) {
  const saved = JSON.stringify(previous);
  const result = act(previous, move);
  assert.equal(JSON.stringify(previous), saved, '不得改写之前的手牌状态');
  assertConserved(result);
  return result;
}
function newHand(options: Parameters<typeof startHand>[0] = {}) {
  const state = startHand({ deck: royalDeck, ...options });
  assertConserved(state);
  return state;
}
function limpToFlop(options: Parameters<typeof startHand>[0] = {}) {
  let state = newHand(options);
  for (let i = 0; i < state.tableSize && state.street === 'preflop'; i++) {
    state = action(
      state,
      legalActions(state)!.canCheck ? { type: 'check' } : { type: 'call' },
    );
  }
  assert.equal(state.street, 'flop');
  return state;
}
function checkToEnd(previous: HoldemState) {
  let state = previous;
  let actions = 0;
  while (state.street !== 'complete') {
    const legal = legalActions(state)!;
    state = action(
      state,
      legal.canCheck ? { type: 'check' } : { type: 'call' },
    );
    assert(++actions < 100);
  }
  return state;
}

void test('五人座位、盲注和发牌顺序在所有按钮位置正确，验证筹码和随机源', () => {
  assert.throws(() => startHand({ deck: [1, 2] }), /牌组/);
  assert.throws(
    () => startHand({ stacks: [0, 1000, 1000, 1000, 1000] }),
    /筹码/,
  );
  assert.throws(
    () => startHand({ stacks: [10.5, 1000, 1000, 1000, 1000] }),
    /筹码/,
  );
  assert.throws(
    () => startHand({ stacks: [Number.MAX_SAFE_INTEGER, 1, 1, 1, 1] }),
    /筹码/,
  );
  assert.throws(() => shuffledDeck(() => 1), /随机数/);
  assert.throws(() => startHand({ button: 5 as Seat }), /座位/);
  for (const button of SEATS) {
    const state = newHand({ button });
    assert.equal(state.toAct, nextSeat(button, 3));
    assert.equal(state.streetBets[nextSeat(button)], 5);
    assert.equal(state.streetBets[nextSeat(button, 2)], 10);
    assert.equal(state.cursor, 10);
    for (const [index, seat] of seatsAfter(button).entries())
      assert.deepEqual(state.holes[seat], [
        royalDeck[index],
        royalDeck[index + 5],
      ]);
    assert.equal(new Set(state.holes.flat()).size, 10);
    assert.deepEqual(limpToFlop({ button }).board, royalBoard.slice(0, 3));
    assert.equal(limpToFlop({ button }).toAct, nextSeat(button));
  }
});

void test('每位玩家依次行动，大盲拥有最后过牌或加注选项', () => {
  let state = newHand();
  for (const seat of [3, 4, 0, 1] as const) {
    assert.equal(state.toAct, seat);
    state = action(state, { type: 'call' });
  }
  assert.equal(state.toAct, 2);
  assert.equal(state.street, 'preflop');
  assert.equal(legalActions(state)!.canCheck, true);
  assert.equal(legalActions(state)!.minTo, 20);
  const checked = action(state, { type: 'check' });
  assert.equal(checked.street, 'flop');
  const raised = action(state, { type: 'raise', to: 30 });
  assert.equal(raised.toAct, 3);
  assert.equal(legalActions(raised)!.call, 20);
});

void test('英雄弃牌后其他玩家继续行动，只剩一个活跃席位时结束', () => {
  let state = newHand({ button: 2 });
  assert.equal(state.toAct, 0);
  state = action(state, { type: 'fold' });
  assert.equal(state.street, 'preflop');
  assert.equal(state.toAct, 1);
  state = action(state, { type: 'fold' });
  state = action(state, { type: 'fold' });
  state = action(state, { type: 'fold' });
  assert.equal(state.street, 'complete');
  assert.deepEqual(state.result!.winners, [4]);
  assert.deepEqual(state.result!.returned, [0, 0, 0, 0, 5]);
  assert.equal(state.result!.pot, 10);
  assert.equal(state.stacks[4], 1005);
  assert.deepEqual(state.board, []);
});

void test('加注增量控制最小再加注，不允许非法行动污染历史', () => {
  let state = newHand();
  state = action(state, { type: 'raise', to: 30 });
  assert.equal(state.lastRaise, 20);
  assert.equal(legalActions(state)!.minTo, 50);
  assert.throws(() => act(state, { type: 'raise', to: 49 }), /加注/);
  assert.throws(() => act(state, { type: 'check' }), /不能过牌/);
  state = action(state, { type: 'raise', to: 70 });
  assert.equal(state.lastRaise, 40);
  assert.equal(legalActions(state)!.minTo, 110);
  const flop = limpToFlop();
  assert.equal(legalActions(flop)!.minTo, 10);
  assert.throws(() => act(flop, { type: 'call' }), /无需跟注/);
  assert.equal(
    legalActions(action(flop, { type: 'raise', to: 15 }))!.minTo,
    30,
  );
});

void test('单次不足完整增量的短全下，不重开之前已下注玩家的加注权', () => {
  let state = newHand({ stacks: [1000, 1000, 1000, 1000, 35] });
  state = action(state, { type: 'raise', to: 30 }); // seat 3
  state = action(state, { type: 'raise', to: 35 }); // seat 4 short all-in
  for (let i = 0; i < 3; i++) state = action(state, { type: 'call' });
  assert.equal(state.toAct, 3);
  assert.equal(state.lastRaise, 20);
  assert.equal(state.raiseOpen[3], false);
  assert.equal(legalActions(state)!.canRaise, false);
  assert.throws(() => act(state, { type: 'raise', to: 55 }), /加注/);
  state = action(state, { type: 'call' });
  assert.equal(state.street, 'flop');
});

void test('累计短全下重开面对完整增量的原下注者，但不重开中途跟注者', () => {
  let state = limpToFlop({ stacks: [1000, 1000, 22, 1000, 30] });
  // TDA rule 49 example scaled: A 10, B all-in12, C calls12, D all-in20, E calls20.
  assert.equal(state.toAct, 1);
  state = action(state, { type: 'raise', to: 10 });
  state = action(state, { type: 'raise', to: 12 });
  state = action(state, { type: 'call' });
  state = action(state, { type: 'raise', to: 20 });
  state = action(state, { type: 'call' });
  assert.equal(state.toAct, 1);
  assert.equal(state.lastRaise, 10);
  assert.equal(state.lastActedBet[1], 10);
  assert.equal(state.raiseOpen[1], true);
  assert.equal(legalActions(state)!.minTo, 30);
  const called = action(state, { type: 'call' });
  assert.equal(called.toAct, 3);
  assert.equal(called.lastActedBet[3], 12);
  assert.equal(legalActions(called)!.call, 8);
  assert.equal(legalActions(called)!.canRaise, false);
  const reraised = action(state, { type: 'raise', to: 30 });
  assert.equal(reraised.toAct, 3);
  assert.equal(legalActions(reraised)!.canRaise, true);
});

void test('短开注不能直接补成最低下注：完整加注增量叠加，已过牌者不重开', () => {
  let state = limpToFlop({ stacks: [1000, 1000, 15, 1000, 1000] });
  state = action(state, { type: 'check' }); // seat1
  state = action(state, { type: 'raise', to: 5 }); // seat2 all-in5
  assert.equal(legalActions(state)!.minTo, 15);
  assert.throws(() => act(state, { type: 'raise', to: 10 }), /加注/);
  const raised = action(state, { type: 'raise', to: 15 });
  assert.equal(raised.lastRaise, 10);
  assert.equal(legalActions(raised)!.minTo, 25);
  for (let i = 0; i < 3; i++) state = action(state, { type: 'call' });
  assert.equal(state.toAct, 1);
  assert.equal(legalActions(state)!.canRaise, false);
});

void test('五人不同筹码全下按主池与每个边池分别平分，未跟注额退回', () => {
  let state = newHand({ button: 2, stacks: [150, 100, 70, 40, 25] });
  state = action(state, { type: 'raise', to: 150 });
  for (let i = 0; i < 4; i++) state = action(state, { type: 'call' });
  assert.equal(state.street, 'complete');
  assert.deepEqual(state.board, royalBoard);
  assert.equal(state.cursor, 18);
  assert.equal(new Set([...state.holes.flat(), ...state.board]).size, 15);
  assert.deepEqual(
    state.result!.pots.map((pot) => pot.amount),
    [125, 60, 90, 60],
  );
  assert.deepEqual(state.result!.returned, [50, 0, 0, 0, 0]);
  assert.deepEqual(state.stacks, [150, 100, 70, 40, 25]);
  assert.deepEqual(state.result!.payouts, [100, 100, 70, 40, 25]);
  assert.deepEqual(
    state.result!.pots.map((pot) => pot.eligible),
    [
      [0, 1, 2, 3, 4],
      [0, 1, 2, 3],
      [0, 1, 2],
      [0, 1],
    ],
  );
});

void test('仅余一个有筹码玩家时无干边池加注，可跟注或弃牌后自动跑牌', () => {
  let state = newHand({ button: 2, stacks: [100, 30, 40, 50, 1000] });
  state = action(state, { type: 'raise', to: 100 });
  for (let i = 0; i < 3; i++) state = action(state, { type: 'call' });
  assert.equal(state.toAct, 4);
  assert.equal(legalActions(state)!.canRaise, false);
  assert.throws(() => act(state, { type: 'raise', to: 200 }), /加注/);
  assert.equal(action(state, { type: 'call' }).street, 'complete');
  assert.equal(action(state, { type: 'fold' }).street, 'complete');
});

void test('短大盲不改变其他可下注席位的完整入池额；仅余一人时只匹配实际全下', () => {
  let state = newHand({ button: 2, stacks: [100, 100, 100, 3, 4] });
  assert.equal(legalActions(state)!.call, 10);
  assert.equal(state.raiseOpen[3], false);
  assert.equal(state.raiseOpen[4], false);
  state = action(state, { type: 'call' });
  state = action(state, { type: 'fold' });
  state = action(state, { type: 'fold' });
  assert.equal(state.street, 'complete');
  assert.equal(state.result!.returned[0], 6);
  const only = newHand({ button: 2, stacks: [100, 1, 2, 3, 4] });
  const a = action(action(only, { type: 'call' }), { type: 'call' });
  const b = action(a, { type: 'call' });
  assert.equal(b.street, 'complete');
});

void test('弃牌玩家的筹码留在底池，无权获分；每个边池依牌力独立归属', () => {
  // button2: deal order3,4,0,1,2. 0 gets AA, 1 KK, 2 QQ, 3 33, 4 44.
  const deck = makeDeck([
    4, 8, 48, 44, 40, 5, 9, 49, 45, 41, 0, 1, 17, 30, 2, 35, 3, 39,
  ]);
  let state = newHand({ button: 2, stacks: [25, 100, 70, 100, 100], deck });
  state = action(state, { type: 'raise', to: 25 });
  state = action(state, { type: 'raise', to: 100 });
  state = action(state, { type: 'call' });
  state = action(state, { type: 'fold' }); // SB dead5
  state = action(state, { type: 'fold' }); // BB dead10
  assert.equal(state.street, 'complete');
  assert.deepEqual(state.result!.winners, [0, 1]);
  assert.deepEqual(state.result!.payouts, [90, 90, 0, 0, 0]);
  assert.deepEqual(state.result!.returned, [0, 30, 0, 0, 0]);
  assert.deepEqual(
    state.result!.pots.map((pot) => pot.amount),
    [90, 90],
  );
  assert.deepEqual(state.result!.labels.slice(3), ['', '']);
});

void test('弃牌投入的分层合并为同一主池，避免奇数筹码被重复分配', () => {
  // 0,1,2 play the board straight; folded3,4 create an odd15 of dead blind money.
  let state = newHand({ button: 2, stacks: [11, 11, 11, 1000, 1000] });
  state = action(state, { type: 'raise', to: 11 });
  state = action(state, { type: 'call' });
  state = action(state, { type: 'call' });
  state = action(state, { type: 'fold' });
  state = action(state, { type: 'fold' });
  assert.equal(state.result!.pot, 48);
  assert.deepEqual(state.result!.payouts, [16, 16, 16, 0, 0]);
  assert.deepEqual(
    state.result!.pots.map((pot) => pot.amount),
    [48],
  );
});

void test('真实主池奇数筹码从按钮左侧的获胜者开始发放', () => {
  let state = newHand({ button: 2, stacks: [11, 11, 11, 3, 1000] });
  state = action(state, { type: 'raise', to: 11 });
  state = action(state, { type: 'call' });
  state = action(state, { type: 'call' });
  state = action(state, { type: 'fold' }); // BB seat4; SB seat3 remains all-in and ties main pot.
  assert.equal(state.street, 'complete');
  // 主池15由四人分，余数从seat3开始；边池31由三人分，余数从seat0开始。
  assert.deepEqual(
    state.result!.pots.map((pot) => pot.amount),
    [15, 31],
  );
  assert.deepEqual(state.result!.payouts, [15, 14, 13, 4, 0]);
});

void test('选择记录保存行动前公开信息，外部行动对象与之后牌面不能污染记录', () => {
  const state = newHand({ button: 2 });
  const move: PokerAction = { type: 'raise', to: 30 };
  const raised = action(state, move);
  move.to = 900;
  const decision = raised.actions[0];
  assert.deepEqual(decision.action, { type: 'raise', to: 30 });
  assert.deepEqual(decision.board, []);
  assert.deepEqual(decision.activeSeats, [0, 1, 2, 3, 4]);
  assert.deepEqual(decision.stacks, state.stacks);
  assert.deepEqual(decision.committed, state.committed);
  assert.equal(decision.button, 2);
  assert.equal(decision.raiseOpen, true);
  assert.equal(decision.minTo, 20);
  assert.equal(decision.maxTo, 1000);
  assert(!('holes' in decision) && !('deck' in decision));
  const continued = action(raised, { type: 'call' });
  assert.deepEqual(continued.actions[1].history[0], {
    seat: 0,
    street: 'preflop',
    action: { type: 'raise', to: 30 },
    paid: 30,
    streetBet: 0,
  });
  assert(!('board' in continued.actions[1].history[0]));
  checkToEnd(continued);
  assert.deepEqual(decision.board, []);
});

void test('1,000 随机五人多街、多尺度及短筹码手牌无循环且筹码始终守恒', () => {
  let seed = 19237;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const counts = { showdown: 0, fold: 0, sidepot: 0, heroFoldContinued: 0 };
  for (let hand = 1; hand <= 1000; hand++) {
    const stacks = SEATS.map(
      () => 1 + Math.floor(random() * 400),
    ) as SeatValues<number>;
    let state = newHand({
      hand,
      button: (hand % 5) as Seat,
      stacks,
      deck: shuffledDeck(random),
    });
    let moves = 0;
    while (state.street !== 'complete') {
      const legal = legalActions(state)!;
      const chance = random();
      let move: PokerAction;
      if (chance < 0.15) move = { type: 'fold' };
      else if (legal.canRaise && chance > 0.6) {
        const low = Math.min(legal.minTo, legal.maxTo);
        const to =
          chance > 0.92
            ? legal.maxTo
            : low + Math.floor(random() * (legal.maxTo - low + 1));
        move = { type: 'raise', to };
      } else move = legal.canCheck ? { type: 'check' } : { type: 'call' };
      const before = state;
      state = action(state, move);
      if (
        before.toAct === 0 &&
        move.type === 'fold' &&
        state.street !== 'complete'
      )
        counts.heroFoldContinued++;
      assert(++moves < 160, `第 ${hand} 手重复行动`);
    }
    counts[state.result!.reason]++;
    if (state.result!.pots.length > 1) counts.sidepot++;
  }
  assert(
    counts.showdown > 100 &&
      counts.fold > 20 &&
      counts.sidepot > 100 &&
      counts.heroFoldContinued > 50,
  );
  console.log('五人随机手牌覆盖', counts);
});

function royalForTable(tableSize: number) {
  const reserved = new Set([...royalBoard, 50, 51, 47]);
  const holes = Array.from({ length: 52 }, (_, card) => card)
    .filter((card) => !reserved.has(card))
    .slice(0, tableSize * 2);
  return makeDeck([
    ...holes,
    50,
    ...royalBoard.slice(0, 3),
    51,
    royalBoard[3],
    47,
    royalBoard[4],
  ]);
}

void test('桌面配置与各席筹码校验，人数推断和显式人数矛盾有明确错误', () => {
  assert.equal(validateTableConfig({ ...DEFAULT_TABLE_CONFIG }), null);
  assert.equal(
    validateTableConfig({
      tableSize: 9,
      smallBlind: 99999,
      bigBlind: 100000,
      initialStack: 10000000,
    }),
    null,
  );
  for (const tableSize of [1, 10, 2.5, NaN, Infinity])
    assert.match(
      validateTableConfig({ ...DEFAULT_TABLE_CONFIG, tableSize })!,
      /人数/,
    );
  for (const [smallBlind, bigBlind] of [
    [0, 10],
    [5, 5],
    [6, 5],
    [1.5, 10],
    [1, 10.5],
    [1, 100001],
    [1, Infinity],
  ])
    assert.match(
      validateTableConfig({ ...DEFAULT_TABLE_CONFIG, smallBlind, bigBlind })!,
      /盲注/,
    );
  for (const initialStack of [0, 9, 10000001, 10.5, NaN, Infinity])
    assert.match(
      validateTableConfig({ ...DEFAULT_TABLE_CONFIG, initialStack })!,
      /筹码/,
    );
  assert.throws(() => startHand({ tableSize: 1 }), /人数/);
  assert.throws(() => startHand({ tableSize: 10 }), /人数/);
  assert.throws(() => startHand({ smallBlind: 10, bigBlind: 10 }), /盲注/);
  assert.throws(
    () => startHand({ bigBlind: 2000, initialStack: 1000 }),
    /筹码/,
  );
  assert.throws(() => startHand({ initialStack: 10000001 }), /筹码/);
  assert.throws(
    () => startHand({ stacks: [100, 100, 100], tableSize: 2 }),
    /不一致/,
  );
  assert.throws(() => startHand({ stacks: [] }), /人数/);
  assert.throws(() => startHand({ stacks: [100, 0] }), /筹码/);
  const inferred = startHand({ stacks: [30, 40, 50, 60, 70, 80] });
  assert.equal(inferred.tableSize, 6);
  assert.deepEqual(inferred.startingStacks, [30, 40, 50, 60, 70, 80]);
  assert.equal(startHand().tableSize, 5);
  assert.deepEqual(tableSeats(2), [0, 1]);
  assert.deepEqual(tableSeats(inferred), [0, 1, 2, 3, 4, 5]);
  assert.throws(() => tableSeats(10), /人数/);
  assert.equal(nextSeat(8, 1, 9), 0);
  assert.equal(nextSeat(0, -1, 9), 8);
  assert.deepEqual(seatsAfter(8, 9), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  // 已赢来的筹码不受初始买入上限限制，短码也能正常完成下一手。
  assertConserved(
    startHand({ stacks: [10000020, 3], smallBlind: 1000, bigBlind: 2000 }),
  );
});

void test('2、3、6、9 人自定义盲注与筹码：每个按钮位置的发牌、行动和完整牌面正确', () => {
  for (const tableSize of [2, 3, 6, 9])
    for (const button of tableSeats(tableSize)) {
      const smallBlind = tableSize + 1;
      const bigBlind = tableSize * 3 + 2;
      const initialStack = bigBlind * 100;
      const deck = royalForTable(tableSize);
      let state = newHand({
        tableSize,
        button,
        smallBlind,
        bigBlind,
        initialStack,
        deck,
      });
      const blinds = blindSeats(state);
      assert.equal(
        blinds.small,
        tableSize === 2 ? button : nextSeat(button, 1, tableSize),
      );
      assert.equal(
        blinds.big,
        nextSeat(button, tableSize === 2 ? 1 : 2, tableSize),
      );
      assert.equal(
        state.toAct,
        tableSize === 2 ? button : nextSeat(button, 3, tableSize),
      );
      assert.equal(state.streetBets[blinds.small], smallBlind);
      assert.equal(state.streetBets[blinds.big], bigBlind);
      assert.equal(legalActions(state)!.minTo, bigBlind * 2);
      assert.equal(state.lastRaise, bigBlind);
      assert.equal(state.cursor, tableSize * 2);
      assert.deepEqual(
        state.startingStacks,
        Array.from({ length: tableSize }, () => initialStack),
      );
      for (const [index, seat] of seatsAfter(button, tableSize).entries())
        assert.deepEqual(state.holes[seat], [
          deck[index],
          deck[index + tableSize],
        ]);
      let calls = 0;
      while (state.street === 'preflop') {
        state = action(
          state,
          legalActions(state)!.canCheck ? { type: 'check' } : { type: 'call' },
        );
        assert(++calls <= tableSize);
      }
      assert.equal(state.street, 'flop');
      assert.equal(state.toAct, nextSeat(button, 1, tableSize));
      assert.equal(state.lastRaise, bigBlind);
      assert.equal(legalActions(state)!.minTo, bigBlind);
      assert.equal(state.actions[0].tableSize, tableSize);
      assert.equal(state.actions[0].stacks.length, tableSize);
      state = checkToEnd(state);
      assert.equal(state.cursor, tableSize * 2 + 8);
      assert.deepEqual(state.board, royalBoard);
      assert.equal(
        new Set([...state.holes.flat(), ...state.board]).size,
        tableSize * 2 + 5,
      );
      assert.deepEqual(
        state.stacks,
        Array.from({ length: tableSize }, () => initialStack),
      );
      assert.equal(state.result!.pots.length, 1);
      assert.equal(state.result!.pot, bigBlind * tableSize);
    }
});

void test('单挑小盲在按钮：先行动、最后收底牌；短盲全下与加注退款正确', () => {
  const deck = royalForTable(2);
  for (const button of [0, 1]) {
    let state = newHand({
      tableSize: 2,
      button,
      smallBlind: 3,
      bigBlind: 7,
      initialStack: 100,
      deck,
    });
    const bb = nextSeat(button, 1, 2);
    assert.deepEqual(state.holes[bb], [deck[0], deck[2]]);
    assert.deepEqual(state.holes[button], [deck[1], deck[3]]);
    assert.equal(legalActions(state)!.call, 4);
    state = action(state, { type: 'raise', to: 40 });
    assert.equal(state.toAct, bb);
    const folded = action(state, { type: 'fold' });
    assert.equal(folded.result!.returned[button], 33);
    assert.equal(folded.result!.pot, 14);
    assert.equal(folded.stacks[button], 107);
    assert.equal(folded.stacks[bb], 93);
  }
  let short = newHand({ stacks: [100, 4], smallBlind: 3, bigBlind: 7, deck });
  assert.equal(short.toAct, 0);
  assert.equal(legalActions(short)!.call, 1);
  assert.equal(legalActions(short)!.canRaise, false);
  short = action(short, { type: 'call' });
  assert.equal(short.street, 'complete');
  assert.equal(short.result!.pot, 8);
  assert.deepEqual(short.stacks, [100, 4]);
  const already = newHand({ stacks: [2, 3], smallBlind: 3, bigBlind: 7, deck });
  assert.equal(already.street, 'complete');
  assert.deepEqual(already.result!.returned, [0, 1]);
  assert.deepEqual(already.stacks, [2, 3]);
});

void test('九人不同全下金额：多级真实边池资格与退款保持正确', () => {
  const tableSize = 9;
  const stacks = [90, 80, 70, 60, 50, 40, 30, 20, 10];
  let state = newHand({
    tableSize,
    button: 6,
    stacks,
    smallBlind: 2,
    bigBlind: 5,
    deck: royalForTable(tableSize),
  });
  assert.equal(state.toAct, 0);
  state = action(state, { type: 'raise', to: 90 });
  while (state.street !== 'complete') state = action(state, { type: 'call' });
  assert.deepEqual(state.result!.returned, [10, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(state.result!.pots.length, 8);
  assert.deepEqual(
    state.result!.pots.map((pot) => pot.amount),
    [90, 80, 70, 60, 50, 40, 30, 20],
  );
  assert.deepEqual(
    state.result!.pots.map((pot) => pot.eligible.length),
    [9, 8, 7, 6, 5, 4, 3, 2],
  );
  assert.deepEqual(state.stacks, stacks);
});

void test('1,200 随机变量桌：2–9 人、各类盲注与不等筹码，无卡局、重复发牌或筹码丢失', () => {
  let seed = 53731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const coverage = new Map<number, number>();
  let headsup = 0,
    sidepots = 0;
  for (let hand = 1; hand <= 1200; hand++) {
    const tableSize = 2 + (hand % 8);
    const smallBlind = 1 + Math.floor(random() * 50);
    const bigBlind = smallBlind + 1 + Math.floor(random() * 70);
    const stacks = tableSeats(tableSize).map(
      () => 1 + Math.floor(random() * bigBlind * 20),
    );
    let state = newHand({
      hand,
      tableSize,
      button: hand % tableSize,
      stacks,
      smallBlind,
      bigBlind,
      deck: shuffledDeck(random),
    });
    let actions = 0;
    while (state.street !== 'complete') {
      const legal = legalActions(state)!;
      const chance = random();
      let move: PokerAction;
      if (chance < 0.13) move = { type: 'fold' };
      else if (legal.canRaise && chance > 0.65) {
        const low = Math.min(legal.minTo, legal.maxTo);
        move = {
          type: 'raise',
          to:
            chance > 0.93
              ? legal.maxTo
              : low + Math.floor(random() * (legal.maxTo - low + 1)),
        };
      } else move = legal.canCheck ? { type: 'check' } : { type: 'call' };
      state = action(state, move);
      assert(++actions < 240, `第${hand}手${tableSize}人发生重复行动`);
      assert(
        state.actions.every(
          (decision) =>
            decision.tableSize === tableSize &&
            decision.stacks.length === tableSize,
        ),
      );
    }
    assert.equal(
      new Set([...state.holes.flat(), ...state.board]).size,
      tableSize * 2 + state.board.length,
    );
    coverage.set(tableSize, (coverage.get(tableSize) ?? 0) + 1);
    if (tableSize === 2) headsup++;
    if (state.result!.pots.length > 1) sidepots++;
  }
  assert.equal(coverage.size, 8);
  assert.equal(headsup, 150);
  assert(sidepots > 200);
  console.log(
    '变量人数随机覆盖',
    Object.fromEntries(coverage),
    '真实边池',
    sidepots,
  );
});

void test('三人及九人分池的奇数筹码由当前桌按钮左侧顺序决定', () => {
  let three = newHand({
    stacks: [11, 11, 100],
    button: 0,
    smallBlind: 3,
    bigBlind: 5,
    deck: royalForTable(3),
  });
  three = action(three, { type: 'raise', to: 11 });
  three = action(three, { type: 'call' });
  three = action(three, { type: 'fold' });
  assert.deepEqual(three.result!.payouts, [13, 14, 0]);
  assert.equal(three.result!.pots.length, 1);
  assert.equal(three.result!.pot, 27);
  let nine = newHand({
    tableSize: 9,
    stacks: [100, 100, 11, 100, 100, 100, 100, 11, 100],
    button: 8,
    smallBlind: 2,
    bigBlind: 5,
    deck: royalForTable(9),
  });
  nine = action(nine, { type: 'raise', to: 11 }); // seat2
  for (let i = 0; i < 4; i++) nine = action(nine, { type: 'fold' }); // seats3..6
  nine = action(nine, { type: 'call' }); // seat7
  for (let i = 0; i < 3; i++) nine = action(nine, { type: 'fold' }); // seats8,0,1
  assert.deepEqual(nine.result!.payouts, [0, 0, 15, 0, 0, 0, 0, 14, 0]);
  assert.equal(nine.result!.pot, 29);
  assert.deepEqual(nine.result!.winners, [2, 7]);
});
