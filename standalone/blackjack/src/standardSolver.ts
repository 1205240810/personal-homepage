import type { Card } from './engine';
import {
  STANDARD_RULES,
  type StandardAction,
  type StandardAdvice,
  type StandardObservation,
} from './standardTypes';

/**
 * Bellman values for the disclosed replacement model, not the finite six-deck shoe.
 * Six fresh decks have the same rank frequencies as one fresh deck; every later
 * draw deliberately keeps those frequencies. We never read the engine's deck,
 * hidden card, seed, or a later observation.
 * S17 replacement benchmarks: https://wizardofodds.com/games/blackjack/expected-return-infinite-deck/
 */
const DRAWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const probability = (rank: number) => (rank === 10 ? 4 / 13 : 1 / 13);
const METHOD =
  '6 副初始频率 · 独立抽牌 DP 近似（S17、peek 条件、非有限牌靴精确解）';
const LABELS: Record<StandardAction, string> = {
  hit: '要牌',
  stand: '停牌',
  double: '加倍',
  split: '分牌',
  surrender: '晚投降',
  insurance: '买保险',
  declineInsurance: '不买保险',
};
const BASE_WARNINGS = [
  '使用六副新牌的初始点数频率并独立抽牌，忽略可见牌移除、牌靴耗尽与计牌信息；不是精确有限牌靴 EV。',
  'EV 为当前这手一份基础下注的预期净收益；正值表示长期模型平均盈利，负值表示平均损失，不是本手输赢概率。',
  '建议只适用于此处公布的 S17、3:2、DAS、最多四手及晚投降规则；不是赌场通用胜率、GTO 或保证获利的策略。',
];

function rankOf(card: Card): number {
  if (!card || typeof card.rank !== 'string')
    throw new Error('教练需要有效的公开牌');
  if (card.rank === 'A') return 1;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  const rank = Number(card.rank);
  if (!Number.isInteger(rank) || rank < 2 || rank > 9)
    throw new Error('教练需要有效的公开牌');
  return rank;
}
function stateOf(cards: readonly Card[]) {
  const ranks = cards.map(rankOf);
  return {
    ranks,
    low: ranks.reduce((sum, rank) => sum + rank, 0),
    ace: ranks.includes(1),
  };
}
const totalOf = (low: number, ace: boolean) =>
  low + (ace && low <= 11 ? 10 : 0);
type DealerDistribution = { bust: number; blackjack: number; totals: number[] };
type Model = {
  dealer: DealerDistribution;
  stand: (low: number, ace: boolean, natural?: boolean) => number;
  bestHitStand: (low: number, ace: boolean) => number;
  hit: (low: number, ace: boolean) => number;
  double: (low: number, ace: boolean) => number;
};
const models = new Map<string, Model>();

function modelFor(upcard: number, negativePeek: boolean): Model {
  const key = `${upcard}:${Number(negativePeek)}`;
  const cached = models.get(key);
  if (cached) return cached;
  const dealerMemo = new Map<number, number[]>();
  // Indices 0..4 are totals 17..21; index 5 is bust.
  function dealerFrom(low: number, ace: boolean): number[] {
    if (low > 21) return [0, 0, 0, 0, 0, 1];
    const total = totalOf(low, ace);
    if (total >= 17) {
      const result = [0, 0, 0, 0, 0, 0];
      result[total - 17] = 1;
      return result;
    }
    const cacheKey = low * 2 + Number(ace);
    const previous = dealerMemo.get(cacheKey);
    if (previous) return previous;
    const result = [0, 0, 0, 0, 0, 0];
    for (const rank of DRAWS) {
      const next = dealerFrom(low + rank, ace || rank === 1);
      for (let index = 0; index < result.length; index++)
        result[index] += probability(rank) * next[index];
    }
    dealerMemo.set(cacheKey, result);
    return result;
  }
  const excluded = negativePeek
    ? upcard === 1
      ? 10
      : upcard === 10
        ? 1
        : 0
    : 0;
  const holeNormalizer = 1 - (excluded ? probability(excluded) : 0);
  const dealer: DealerDistribution = {
    bust: 0,
    blackjack: 0,
    totals: [0, 0, 0, 0, 0],
  };
  for (const hole of DRAWS) {
    if (hole === excluded) continue;
    const p = probability(hole) / holeNormalizer;
    if ((upcard === 1 && hole === 10) || (upcard === 10 && hole === 1)) {
      dealer.blackjack += p;
      continue;
    }
    const outcome = dealerFrom(upcard + hole, upcard === 1 || hole === 1);
    dealer.bust += p * outcome[5];
    outcome.slice(0, 5).forEach((chance, index) => {
      dealer.totals[index] += p * chance;
    });
  }
  const stand = (low: number, ace: boolean, natural = false) => {
    if (low > 21) return -1;
    if (natural) return STANDARD_RULES.blackjackPayout * (1 - dealer.blackjack);
    const total = totalOf(low, ace);
    return (
      dealer.bust -
      dealer.blackjack +
      dealer.totals.reduce(
        (sum, chance, index) => sum + Math.sign(total - (index + 17)) * chance,
        0,
      )
    );
  };
  const playerMemo = new Map<number, number>();
  const hit = (low: number, ace: boolean): number =>
    DRAWS.reduce((sum, rank) => {
      const nextLow = low + rank;
      return (
        sum +
        probability(rank) *
          (nextLow > 21 ? -1 : bestHitStand(nextLow, ace || rank === 1))
      );
    }, 0);
  function bestHitStand(low: number, ace: boolean): number {
    if (low > 21) return -1;
    if (totalOf(low, ace) === 21) return stand(low, ace);
    const cacheKey = low * 2 + Number(ace);
    const previous = playerMemo.get(cacheKey);
    if (previous !== undefined) return previous;
    const value = Math.max(stand(low, ace), hit(low, ace));
    playerMemo.set(cacheKey, value);
    return value;
  }
  const double = (low: number, ace: boolean) =>
    2 *
    DRAWS.reduce(
      (sum, rank) =>
        sum + probability(rank) * stand(low + rank, ace || rank === 1),
      0,
    );
  const model = { dealer, stand, hit, double, bestHitStand };
  models.set(key, model);
  return model;
}

/**
 * Solves the offspring of THIS pair as a sequential replacement-draw queue.
 * Extra bets are reserved, not recycled before settlement. Existing other hands
 * are not observed, so their future demand on shared funds is outside this model.
 */
function splitValue(
  rank: number,
  observation: StandardObservation,
  model: Model,
): number {
  const initialCash = Math.min(
    7,
    Math.floor(observation.availableChips / observation.wager),
  );
  const queueMemo = new Map<string, number>();
  const playMemo = new Map<string, number>();
  function queue(pending: number, cash: number, count: number): number {
    if (pending === 0) return 0;
    const key = `${pending}:${cash}:${count}`;
    const cached = queueMemo.get(key);
    if (cached !== undefined) return cached;
    const value = DRAWS.reduce((sum, draw) => {
      const low = rank + draw;
      const ace = rank === 1 || draw === 1;
      const result =
        rank === 1
          ? model.stand(low, ace) + queue(pending - 1, cash, count)
          : play(low, ace, true, draw === rank, pending - 1, cash, count);
      return sum + probability(draw) * result;
    }, 0);
    queueMemo.set(key, value);
    return value;
  }
  function play(
    low: number,
    ace: boolean,
    twoCards: boolean,
    pair: boolean,
    pending: number,
    cash: number,
    count: number,
  ): number {
    const tail = queue(pending, cash, count);
    if (low > 21) return -1 + tail;
    if (totalOf(low, ace) === 21) return model.stand(low, ace) + tail;
    const key = `${low}:${Number(ace)}:${Number(twoCards)}:${Number(pair)}:${pending}:${cash}:${count}`;
    const cached = playMemo.get(key);
    if (cached !== undefined) return cached;
    let value = model.stand(low, ace) + tail;
    const hit = DRAWS.reduce(
      (sum, draw) =>
        sum +
        probability(draw) *
          play(
            low + draw,
            ace || draw === 1,
            false,
            false,
            pending,
            cash,
            count,
          ),
      0,
    );
    value = Math.max(value, hit);
    if (twoCards && STANDARD_RULES.doubleAfterSplit && cash >= 1)
      value = Math.max(
        value,
        model.double(low, ace) + queue(pending, cash - 1, count),
      );
    if (pair && cash >= 1 && count < STANDARD_RULES.maxHands)
      value = Math.max(value, queue(pending + 2, cash - 1, count + 1));
    playMemo.set(key, value);
    return value;
  }
  return queue(2, initialCash - 1, observation.handCount + 1);
}

function eligibleActions(
  observation: StandardObservation,
  ranks: readonly number[],
) {
  const insurancePhase =
    observation.legalActions.includes('insurance') ||
    observation.legalActions.includes('declineInsurance');
  if (insurancePhase)
    return observation.legalActions.filter(
      (action) =>
        action === 'declineInsurance' ||
        (action === 'insurance' &&
          observation.availableChips >= observation.wager / 2),
    );
  const pair = ranks.length === 2 && ranks[0] === ranks[1];
  return observation.legalActions.filter((action) => {
    if (action === 'stand') return true;
    if (action === 'hit') return !observation.splitAces;
    if (action === 'double')
      return (
        ranks.length === 2 &&
        !observation.splitAces &&
        observation.availableChips >= observation.wager
      );
    if (action === 'split')
      return (
        pair &&
        !observation.splitAces &&
        observation.handCount < STANDARD_RULES.maxHands &&
        observation.availableChips >= observation.wager &&
        !(ranks[0] === 1 && observation.fromSplit)
      );
    if (action === 'surrender')
      return (
        ranks.length === 2 && !observation.fromSplit && observation.negativePeek
      );
    return false;
  });
}

export function analyzeStandardDecision(
  observation: StandardObservation,
): StandardAdvice {
  if (
    !observation ||
    !Array.isArray(observation.cards) ||
    observation.cards.length === 0 ||
    !Array.isArray(observation.legalActions) ||
    !Number.isFinite(observation.wager) ||
    observation.wager <= 0 ||
    !Number.isFinite(observation.availableChips) ||
    observation.availableChips < 0 ||
    !Number.isInteger(observation.handCount) ||
    observation.handCount < 1 ||
    observation.handCount > STANDARD_RULES.maxHands
  )
    throw new Error('教练需要有效的公开决策快照');
  const hand = stateOf(observation.cards);
  const upcard = rankOf(observation.dealerUpcard);
  const actions = [...new Set(eligibleActions(observation, hand.ranks))];
  if (actions.length === 0) throw new Error('当前没有可评估的合法动作');
  const model = modelFor(upcard, observation.negativePeek);
  const natural =
    !observation.fromSplit &&
    observation.cards.length === 2 &&
    totalOf(hand.low, hand.ace) === 21;
  const values: StandardAdvice['values'] = {};
  const insurancePhase = actions.some(
    (action) => action === 'insurance' || action === 'declineInsurance',
  );
  for (const action of actions) {
    if (action === 'declineInsurance') values[action] = 0;
    else if (action === 'insurance')
      values[action] = (3 * model.dealer.blackjack - 1) / 2;
    else if (action === 'stand')
      values[action] = model.stand(hand.low, hand.ace, natural);
    else if (action === 'hit') values[action] = model.hit(hand.low, hand.ace);
    else if (action === 'double')
      values[action] = model.double(hand.low, hand.ace);
    else if (action === 'surrender') values[action] = -0.5;
    else if (action === 'split')
      values[action] = splitValue(hand.ranks[0], observation, model);
  }
  // Near numerical ties prefer smaller extra exposure; never invent an action
  // absent from the supplied, resource-filtered legal list.
  const preference: StandardAction[] = insurancePhase
    ? ['declineInsurance', 'insurance']
    : ['stand', 'hit', 'surrender', 'double', 'split'];
  const ordered = preference.filter((action) => values[action] !== undefined);
  const bestAction = ordered.reduce(
    (best, action) => (values[action]! > values[best]! + 1e-10 ? action : best),
    ordered[0],
  );
  const best = values[bestAction]!;
  const explanation: string[] = [];
  if (insurancePhase) {
    explanation.push(
      `保险按半份下注购买，命中庄家天然 21 点净赚一份下注，未命中损失半份。模型中庄家天然概率约 ${(model.dealer.blackjack * 100).toFixed(1)}%，需要超过 33.3% 才有正保险 EV。`,
    );
  } else {
    const total = totalOf(hand.low, hand.ace);
    explanation.push(
      `你现在是${hand.ace && hand.low <= 11 ? '软' : '硬'} ${total} 点，庄家明牌 ${upcard === 1 ? 'A' : upcard}；${observation.negativePeek ? '已排除庄家天然 21 点，暗牌分布按窥牌阴性条件重算' : '尚未排除庄家天然 21 点'}。`,
    );
    if (bestAction === 'hit')
      explanation.push(
        '要牌价值由每种下一张牌及之后最优要牌/停牌递推得到，已经扣除立即爆牌损失；不是只看补到好牌的概率。',
      );
    if (bestAction === 'stand')
      explanation.push(
        natural
          ? '这是未分牌的天然 21 点：按 3:2 盈利，庄家也为天然时平局。'
          : '停牌直接比较庄家 S17 的终局分布，不再承担自己的爆牌风险；在当前合法选择中模型净收益最高或数值接近。',
      );
    if (bestAction === 'double')
      explanation.push(
        '加倍只再抽一张并停牌，盈利和损失均按两份下注计算；当前余额足够承担额外一份风险，不能把两倍回报当作免费优势。',
      );
    if (bestAction === 'split')
      explanation.push(
        hand.ranks[0] === 1
          ? '分 A 后每手只补一张、不能再分 A，A 加 10 点按普通 21 点而非天然 3:2 结算；EV 已合计两手。'
          : '分牌 EV 合计由这一对产生的后续手牌；队列 DP 限制最多四手，允许规则内再分与 DAS，额外下注从当前可用余额共同预留。',
      );
    if (bestAction === 'surrender')
      explanation.push(
        '晚投降固定损失半份下注。当前牌的继续期望更差；之前投入不是必须继续追逐的理由，且此动作只用于已完成窥牌检查的原始两张牌。',
      );
  }
  explanation.push(
    `近似推荐${LABELS[bestAction]}，模型预期净收益 ${best >= 0 ? '+' : ''}${best.toFixed(3)} 份当前下注。EV 差很小时应视为对模型假设敏感，而非绝对正确答案。`,
  );
  for (const action of ordered.filter((action) => action !== bestAction)) {
    const delta = Math.max(0, best - values[action]!);
    explanation.push(
      `${LABELS[action]}约 ${values[action]! >= 0 ? '+' : ''}${values[action]!.toFixed(3)} 份；与推荐相差约 ${delta.toFixed(3)} 份（约 ${(delta * observation.wager).toFixed(2)} 虚拟筹码）。`,
    );
  }
  const warnings = [...BASE_WARNINGS];
  if (actions.includes('split'))
    warnings.push('实际牌桌会先给两手都补一张，队列模型按手依次抽牌，未利用另一手已经发出的第二张牌共同规划后续行动。');
  if (observation.handCount > 1)
    warnings.push('当前局已有其他分手：本步只比较这手的局部收益，没有联合优化其他手后续加倍或分牌对共享筹码的需求。');
  if (actions.includes('split'))
    warnings.push(
      '分牌队列使用独立抽牌，并只优化这一对产生的分手；已存在其他分手未来会怎样使用共享余额不在快照内，未作联合优化。牌靴移除与庄家共享结果的相关性未作有限牌精确展开，边缘分牌选择仍属近似。',
    );
  if (
    !observation.negativePeek &&
    !insurancePhase &&
    (upcard === 1 || upcard === 10)
  )
    warnings.push(
      '此快照尚未确认庄家窥牌阴性；标准美式规则应先完成 peek 再行动，此处的行动 EV 仅作未排除天然的条件比较。',
    );
  return { bestAction, values, method: METHOD, explanation, warnings };
}
