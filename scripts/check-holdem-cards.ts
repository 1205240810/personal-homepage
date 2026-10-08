import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardRank,
  cardSuit,
  cardLabel,
  rankHand,
  estimateEquity,
} from '../lib/games/holdem-cards.ts';

const card = (rank: number, suit = 0) => (rank - 2) * 4 + suit;
const cards = (...spec: [number, number][]) =>
  spec.map(([rank, suit]) => card(rank, suit));
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

await test('52 张牌的数字编码、显示与输入校验一致', () => {
  for (let rank = 2; rank <= 14; rank++) {
    for (let suit = 0; suit < 4; suit++) {
      assert.equal(cardRank(card(rank, suit)), rank);
      assert.equal(cardSuit(card(rank, suit)), suit);
    }
  }
  assert.equal(cardLabel(48), 'A♠');
  assert.equal(cardLabel(51), 'A♦');
  for (const invalid of [-1, 52, 0.5, NaN, Infinity])
    assert.throws(() => cardLabel(invalid), RangeError);
  assert.throws(() => rankHand([0, 0, 4, 8, 12]), /重复/);
  assert.throws(() => rankHand([0, 4, 8, 12]), RangeError);
  assert.throws(() => rankHand([0, 4, 8, 12, 16, 20, 24, 28]), RangeError);
});

await test('九个牌型顺序正确，同花色不作为平手的裁决因素', () => {
  const examples = [
    cards([14, 0], [11, 1], [9, 2], [6, 3], [3, 0]),
    cards([14, 0], [14, 1], [9, 2], [6, 3], [3, 0]),
    cards([14, 0], [14, 1], [9, 2], [9, 3], [3, 0]),
    cards([14, 0], [14, 1], [14, 2], [6, 3], [3, 0]),
    cards([6, 0], [5, 1], [4, 2], [3, 3], [2, 0]),
    cards([14, 0], [11, 0], [9, 0], [6, 0], [3, 0]),
    cards([14, 0], [14, 1], [14, 2], [6, 3], [6, 0]),
    cards([14, 0], [14, 1], [14, 2], [14, 3], [3, 0]),
    cards([6, 0], [5, 0], [4, 0], [3, 0], [2, 0]),
  ].map(rankHand);
  assert.deepEqual(
    examples.map((hand) => hand.category),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  for (let i = 1; i < examples.length; i++)
    assert(examples[i].value > examples[i - 1].value);
  const first = rankHand(cards([14, 0], [14, 1], [13, 2], [12, 3], [11, 0]));
  const second = rankHand(cards([14, 2], [14, 3], [13, 0], [12, 1], [11, 2]));
  assert.equal(first.value, second.value);
});

await test('A2345 为五高顺子，重复点数与多余 A 不使其错误升级', () => {
  const wheel = rankHand(
    cards([14, 0], [2, 1], [3, 2], [4, 3], [5, 0], [14, 2], [8, 1]),
  );
  assert.equal(wheel.category, 4);
  assert.deepEqual(wheel.kickers, [5]);
  assert(
    rankHand(cards([2, 0], [3, 1], [4, 2], [5, 3], [6, 0])).value > wheel.value,
  );
  const steelWheel = rankHand(
    cards([14, 1], [2, 1], [3, 1], [4, 1], [5, 1], [12, 0], [12, 2]),
  );
  assert.equal(steelWheel.category, 8);
  assert.deepEqual(steelWheel.kickers, [5]);
});

await test('七张牌能选择双三条葫芦、三对中的两对、最大 kicker 和最佳五张同花', () => {
  const doubleTrips = rankHand(
    cards([14, 0], [14, 1], [14, 2], [13, 0], [13, 1], [13, 2], [2, 3]),
  );
  assert.equal(doubleTrips.category, 6);
  assert.deepEqual(doubleTrips.kickers, [14, 13]);
  const threePairs = rankHand(
    cards([14, 0], [14, 1], [13, 0], [13, 1], [12, 0], [12, 1], [3, 3]),
  );
  assert.deepEqual(threePairs.kickers, [14, 13, 12]);
  const flush = rankHand(
    cards([14, 0], [13, 0], [11, 0], [9, 0], [6, 0], [3, 0], [12, 1]),
  );
  assert.equal(flush.category, 5);
  assert.deepEqual(flush.kickers, [14, 13, 11, 9, 6]);
  const lowKicker = rankHand(cards([8, 0], [8, 1], [14, 2], [13, 3], [11, 0]));
  const highKicker = rankHand(cards([8, 0], [8, 1], [14, 2], [13, 3], [12, 0]));
  assert(highKicker.value > lowKicker.value);
});

await test('牌面本身为最佳五张时不同底牌平分', () => {
  const board = cards([10, 0], [11, 0], [12, 0], [13, 0], [14, 0]);
  assert.equal(
    rankHand([...board, ...cards([2, 1], [3, 1])]).value,
    rankHand([...board, ...cards([9, 2], [9, 3])]).value,
  );
  assert.deepEqual(
    estimateEquity(cards([2, 1], [3, 1]), board, 80, seeded(47)),
    {
      equity: 0.5,
      win: 0,
      tie: 1,
      samples: 80,
    },
  );
});

await test('七张直接评估与二十一种五张组合的最佳结果一致', () => {
  const random = seeded(20261008);
  for (let sample = 0; sample < 350; sample++) {
    const deck = Array.from({ length: 52 }, (_, id) => id);
    for (let i = 0; i < 7; i++) {
      const next = i + Math.floor(random() * (52 - i));
      [deck[i], deck[next]] = [deck[next], deck[i]];
    }
    const hand = deck.slice(0, 7);
    let best = -1;
    for (let a = 0; a < 7; a++) {
      for (let b = a + 1; b < 7; b++)
        best = Math.max(
          best,
          rankHand(hand.filter((_, i) => i !== a && i !== b)).value,
        );
    }
    assert.equal(rankHand(hand).value, best);
  }
});

await test('MC 计算胜率含平分份额、排除已知牌、不会更改输入且可重现', () => {
  const hole = Object.freeze(cards([14, 0], [14, 1]));
  const board = Object.freeze(
    cards([14, 2], [14, 3], [13, 0], [12, 1], [11, 2]),
  );
  assert.deepEqual(estimateEquity(hole, board, 120, seeded(24)), {
    equity: 1,
    win: 1,
    tie: 0,
    samples: 120,
  });
  const a = estimateEquity(cards([14, 0], [14, 1]), [], 300, seeded(78));
  const b = estimateEquity(cards([14, 0], [14, 1]), [], 300, seeded(78));
  assert.deepEqual(a, b);
  assert(a.equity > 0.7 && a.equity < 0.95);
  assert.equal(a.equity, a.win + a.tie / 2);
  assert.throws(() => estimateEquity([0, 1], [0, 8, 12]), /重复/);
  assert.throws(() => estimateEquity([0], []), RangeError);
  assert.throws(() => estimateEquity([0, 1], [], 0), RangeError);
  assert.throws(() => estimateEquity([0, 1], [], 2.5), RangeError);
  assert.throws(() => estimateEquity([0, 1], [], 1, () => 1), RangeError);
});
