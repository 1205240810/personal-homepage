import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEquity } from '../lib/games/holdem-cards.ts';
import {
  act,
  legalActions,
  otherSeat,
  shuffledDeck,
  startHand,
  type HoldemState,
  type PokerAction,
} from '../lib/games/holdem-engine.ts';
import {
  chooseBotAction,
  quickEquity,
  reviewHand,
  type BotStyle,
} from '../lib/games/holdem-strategy.ts';

const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const styles: BotStyle[] = ['balanced', 'careful', 'active'];
const stacks: [number, number][] = [
  [1000, 1000],
  [80, 700],
  [300, 150],
  [3, 1000],
  [7, 600],
  [1000, 2],
  [1000, 400],
  [10, 10],
  [19, 21],
];
const SAMPLE_HANDS = 500;
const MAX_ACTIONS = 120;

function assertState(state: HoldemState, message: string) {
  const total = state.startingStacks[0] + state.startingStacks[1];
  for (const chip of [
    ...state.stacks,
    ...state.committed,
    ...state.streetBets,
  ]) {
    assert(
      Number.isSafeInteger(chip) && chip >= 0,
      `${message}: 筹码必须是非负整数`,
    );
  }
  assert.equal(state.deck.length, 52, `${message}: 牌组长度`);
  assert.equal(new Set(state.deck).size, 52, `${message}: 牌组重复`);
  const visible = [...state.holes[0], ...state.holes[1], ...state.board];
  assert.equal(
    new Set(visible).size,
    visible.length,
    `${message}: 底牌/公共牌重复`,
  );
  assert(
    visible.every((card) => Number.isInteger(card) && card >= 0 && card < 52),
    `${message}: 无效牌`,
  );
  assert(state.cursor >= 4 && state.cursor <= 12, `${message}: 发牌游标`);
  if (state.street === 'complete') {
    assert.equal(state.toAct, null, `${message}: 结束后不能继续行动`);
    assert(state.result, `${message}: 缺少结果`);
    assert.equal(
      state.stacks[0] + state.stacks[1],
      total,
      `${message}: 结算筹码不守恒`,
    );
    assert.equal(
      state.result.pot,
      Math.min(...state.committed) * 2,
      `${message}: 可争夺底池`,
    );
    if (state.result.reason === 'showdown')
      assert.equal(state.board.length, 5, `${message}: 摊牌公共牌不足`);
    assert.equal(legalActions(state), null, `${message}: 结束后仍有合法行动`);
  } else {
    assert.equal(
      state.stacks[0] +
        state.stacks[1] +
        state.committed[0] +
        state.committed[1],
      total,
      `${message}: 行动中筹码不守恒`,
    );
    assert(state.toAct === 0 || state.toAct === 1, `${message}: 无行动者`);
    assert.equal(
      state.board.length,
      { preflop: 0, flop: 3, turn: 4, river: 5 }[state.street],
      `${message}: 公共牌和街道不一致`,
    );
    assert(state.stacks[state.toAct] > 0, `${message}: 无筹码玩家仍需行动`);
  }
}

function assertAction(
  state: HoldemState,
  action: PokerAction,
  message: string,
) {
  const legal = legalActions(state);
  assert(legal, `${message}: 没有可行动玩家`);
  assert.equal(legal.seat, state.toAct);
  assert(legal.pot >= 0 && legal.call >= 0);
  assert(legal.potOdds >= 0 && legal.potOdds <= 1);
  if (action.type === 'check') assert(legal.canCheck, `${message}: 不能过牌`);
  if (action.type === 'call') assert(legal.call > 0, `${message}: 无需跟注`);
  if (action.type === 'raise') {
    assert(legal.canRaise, `${message}: 加注权关闭`);
    assert(Number.isSafeInteger(action.to), `${message}: 加注必须是整数`);
    assert(
      action.to > Math.max(...state.streetBets) && action.to <= legal.maxTo,
      `${message}: 加注超出范围`,
    );
    assert(
      action.to >= legal.minTo || action.to === legal.maxTo,
      `${message}: 非全下的小于最小加注`,
    );
  }
}

await test('500 手固定种子策略对打：三种风格、不同筹码与按钮，逐行动验证规则和守恒', () => {
  const actionCounts = { fold: 0, check: 0, call: 0, raise: 0 };
  const streetCounts = { preflop: 0, flop: 0, turn: 0, river: 0 };
  const endings = { fold: 0, showdown: 0 };
  let maxActions = 0;
  for (let hand = 0; hand < SAMPLE_HANDS; hand++) {
    const deckRandom = seeded(9127 + hand * 79);
    const actionRandom = seeded(7717 + hand * 97);
    const equityRandom = seeded(3127 + hand * 101);
    let state = startHand({
      hand: hand + 1,
      button: (hand % 2) as 0 | 1,
      stacks: stacks[hand % stacks.length],
      deck: shuffledDeck(deckRandom),
    });
    assertState(state, `手 ${hand + 1} 初始`);
    let count = 0;
    while (state.street !== 'complete') {
      assert(
        count++ < MAX_ACTIONS,
        `手 ${hand + 1} 超过 ${MAX_ACTIONS} 次行动，疑似死循环`,
      );
      const legal = legalActions(state)!;
      const seat = legal.seat;
      const equity =
        state.street === 'preflop' && hand % 2 === 0
          ? quickEquity(state.holes[seat])
          : estimateEquity(state.holes[seat], state.board, 32, equityRandom)
              .equity;
      const style =
        styles[
          (hand + seat * Math.floor(hand / styles.length + 1)) % styles.length
        ];
      const action = chooseBotAction(state, equity, style, actionRandom);
      assertAction(state, action, `手 ${hand + 1} 行动 ${count}`);
      actionCounts[action.type]++;
      streetCounts[state.street]++;
      const previous = JSON.stringify(state);
      const next = act(state, action);
      assert.equal(
        JSON.stringify(state),
        previous,
        `手 ${hand + 1}: act 修改了旧状态`,
      );
      assert.equal(
        next.actions.length,
        state.actions.length + 1,
        `手 ${hand + 1}: 行动日志不递增`,
      );
      if (action.type === 'raise') {
        const opponent = otherSeat(seat);
        const decision = next.actions.at(-1)!;
        assert.equal(decision.effectiveRisk, Math.min(
          decision.paid,
          state.streetBets[opponent] + state.stacks[opponent] - state.streetBets[seat],
        ), `手 ${hand + 1}: 加注风险应扣除对手无法匹配的投入`);
      }
      assertState(next, `手 ${hand + 1} 行动 ${count} 后`);
      state = next;
    }
    endings[state.result!.reason]++;
    maxActions = Math.max(maxActions, count);
    assert.throws(() => act(state, { type: 'check' }), /不能行动/);
    if (hand % 50 === 0) {
      const review = reviewHand(state, 32, seeded(871 + hand));
      const decisions = state.actions.filter((decision) => decision.seat === 0);
      assert.equal(review.length, decisions.length);
      for (let i = 0; i < review.length; i++) {
        assert(review[i].equity >= 0 && review[i].equity <= 1);
        assert.equal(review[i].samples, 32);
        const decision = decisions[i];
        assert.equal(
          review[i].threshold,
          decision.call ? decision.call / (decision.pot + decision.call) : null,
        );
      }
    }
  }
  for (const [type, count] of Object.entries(actionCounts))
    assert(count > 0, `未覆盖 ${type}`);
  for (const [street, count] of Object.entries(streetCounts))
    assert(count > 0, `未覆盖 ${street}`);
  assert(
    endings.fold > 0 && endings.showdown > 0,
    '必须覆盖弃牌结束和摊牌结束',
  );
  console.log(
    `策略动态验收：${SAMPLE_HANDS} 手；${JSON.stringify(actionCounts)}；${JSON.stringify(endings)}；最大 ${maxActions} 次行动`,
  );
});

await test('覆盖对手筹码的全下复盘只计算有效风险；面对下注的风险包含跟注部分', () => {
  // Button gets 7♠ / 2♦; its equity against random unknown cards is modest.
  const prefix = [48, 20, 44, 3];
  const deck = [...prefix, ...Array.from({ length: 52 }, (_, id) => id).filter(id => !prefix.includes(id))];
  let state = startHand({ stacks: [1000, 45], deck });
  state = act(state, { type: 'raise', to: 1000 });
  const decision = state.actions[0];
  assert.equal(decision.call, 5);
  assert.equal(decision.paid, 995);
  assert.equal(decision.effectiveRisk, 40, '最终最多只能匹配到45，本次新增风险为45-已有5');
  const point = reviewHand(state, 120, seeded(697))[0];
  assert(point.equity < 0.65, '固定弱牌用例应走尺度/诈唬参考分支');
  assert.match(point.advice, /投入 40/);
  assert.match(point.advice, /73%/, '40/(当前底池15+新增有效投入40)，相对弃牌基准');
  assert.doesNotMatch(point.advice, /投入 995/);
  state = act(state, { type: 'call' });
  assert.equal(state.result?.pot, 90);
  assert.deepEqual(state.result?.returned, [955, 0]);
});

await test('复盘只估算决策当时的信息，不读取对手真实底牌或未来已发公共牌', () => {
  let state = startHand({ deck: shuffledDeck(seeded(610)) });
  state = act(state, { type: 'call' });
  state = act(state, { type: 'check' });
  state = act(state, { type: 'check' });
  state = act(state, { type: 'check' });
  const baseline = reviewHand(state, 32, seeded(777));
  const hiddenHoles = new Proxy(state.holes, {
    get(target, key, receiver) {
      if (key === '1') throw new Error('复盘读取了对手真实底牌');
      return Reflect.get(target, key, receiver);
    },
  });
  const censored = new Proxy({ ...state, holes: hiddenHoles }, {
    get(target, key, receiver) {
      if (key === 'deck' || key === 'board') throw new Error('复盘读取了决策后的未来牌面');
      return Reflect.get(target, key, receiver);
    },
  });
  assert.deepEqual(reviewHand(censored, 32, seeded(777)), baseline);
  assert.equal(baseline[0].board.length, 0);
  assert.equal(baseline[1].board.length, 3);
});

await test('策略只使用显式权益与公开行动信息，不读取双方底牌或未来牌组', () => {
  const state = startHand({ deck: shuffledDeck(seeded(373)) });
  const hole = state.holes[state.toAct!];
  const equity = estimateEquity(hole, state.board, 32, seeded(151)).equity;
  const privateKeys = new Set(['holes', 'deck']);
  const censored = new Proxy(state, {
    get(target, key, receiver) {
      if (typeof key === 'string' && privateKeys.has(key))
        throw new Error(`策略读取隐蔽信息: ${key}`);
      return Reflect.get(target, key, receiver);
    },
  });
  for (const style of styles) {
    for (let roll = 0; roll < 10; roll++) {
      const action = chooseBotAction(censored, equity, style, () => roll / 10);
      assertAction(state, action, `${style} / ${roll}`);
    }
  }
  // Swapping the opponent's unknown hole cards cannot alter a fixed-equity decision.
  const opponent = otherSeat(state.toAct!);
  const altered: HoldemState = {
    ...state,
    holes: [...state.holes] as [number[], number[]],
  };
  altered.holes[opponent] = [50, 51];
  for (const style of styles) {
    assert.deepEqual(
      chooseBotAction(state, equity, style, seeded(112)),
      chooseBotAction(altered, equity, style, seeded(112)),
    );
  }
});
