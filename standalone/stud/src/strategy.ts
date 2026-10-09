import { actionLabel, compare, evaluate, rank, suit } from './engine';
import type { Action, Card, Review, View } from './engine';

type Difficulty = 'easy' | 'normal';
export interface RangeEntry {
  card: Card;
  weight: number;
  quality: number;
}
type World = { share: number; response: number; quality: number };
type Candidate = {
  action: Action;
  paid: number;
  ev: number;
  error: number;
  robust: number;
  reason: string;
};
const clamp = (n: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, n));
const sigmoid = (n: number) => 1 / (1 + Math.exp(-n));
const rounded = (n: number) => Math.round(n * 10) / 10 || 0;
const key = (a: Action) => (a.type === 'raise' ? `raise:${a.to}` : a.type);
const mean = (xs: number[]) => xs.reduce((sum, n) => sum + n, 0) / xs.length;
const roll = (rng: () => number) => {
  const n = rng();
  if (!Number.isFinite(n) || n < 0 || n >= 1)
    throw new RangeError('随机函数必须返回 [0,1) 内的数。');
  return n;
};
export function viewLimits(v: View) {
  const current = Math.max(v.paid, v.otherPaid);
  return {
    call: Math.max(0, v.otherPaid - v.paid),
    current,
    min: current + v.minRaise,
    max: Math.min(v.paid + v.stack, v.otherPaid + v.opponentStack),
  };
}
export function legalDecision(v: View, a: Action): boolean {
  const l = viewLimits(v);
  if (a.type === 'fold') return true;
  if (a.type === 'check') return l.call === 0;
  if (a.type === 'call') return l.call > 0 && l.call <= v.stack;
  return (
    a.type === 'raise' &&
    Number.isInteger(a.to) &&
    a.to > l.current &&
    a.to <= l.max &&
    (a.to >= l.min || a.to === l.max)
  );
}
function validate(v: View) {
  const known = [...v.own, ...v.exposed];
  if (
    !Number.isInteger(v.street) ||
    v.street < 1 ||
    v.street > 4 ||
    v.own.length !== v.street + 1 ||
    v.exposed.length !== v.street ||
    known.some((c) => !Number.isInteger(c) || c < 0 || c >= 52) ||
    new Set(known).size !== known.length
  )
    throw new RangeError('分析需要行动当时的合法可见牌。');
  for (const n of [
    v.pot,
    v.stack,
    v.opponentStack,
    v.paid,
    v.otherPaid,
    v.minRaise,
  ])
    if (!Number.isInteger(n) || n < 0 || n > 1000)
      throw new RangeError('分析筹码必须为合法整数。');
  if (!v.minRaise || viewLimits(v).call > v.stack)
    throw new RangeError('分析局面没有合法跟注范围。');
}

/** Relative potential, not a showdown probability or solved hand-strength table. */
function potential(cards: Card[], opposingExposed: Card[]) {
  const hand = evaluate(cards);
  const category = hand[0];
  const early = (5 - cards.length) / 3;
  let q =
    category === 0
      ? 0.12 + ((hand[1] - 2) / 12) * (0.28 + 0.12 * early)
      : category === 1
        ? 0.46 + ((hand[1] - 2) / 12) * 0.2 + 0.1 * early
        : category === 2
          ? 0.76 + ((hand[1] - 2) / 12) * 0.05
          : category === 3
            ? 0.86 + ((hand[1] - 2) / 12) * 0.04
            : category === 4
              ? 0.93
              : category === 5
                ? 0.95
                : category === 6
                  ? 0.975
                  : category === 7
                    ? 0.99
                    : 0.998;
  if (cards.length < 5 && cards.length >= 3 && category === 0) {
    const suits = cards.map(suit);
    const maxSuit = Math.max(
      ...suits.map((s) => suits.filter((other) => other === s).length),
    );
    const rs = [...new Set(cards.map(rank))];
    const straightDraw =
      rs.length === cards.length &&
      (Math.max(...rs) - Math.min(...rs) <= 4 ||
        (rs.includes(14) && Math.max(...rs.filter((r) => r !== 14)) <= 5));
    if (maxSuit === cards.length) q += 0.045;
    if (straightDraw) q += 0.025;
  }
  // A hidden card may improve the hand, but the other player's public lead is known.
  if (
    opposingExposed.length &&
    compare(evaluate(cards.slice(1), true), evaluate(opposingExposed, true)) < 0
  )
    q -= 0.025;
  return clamp(q);
}

/** A soft likelihood over the ONE unknown current downcard. All cards remain possible. */
export function opponentRange(
  v: View,
  difficulty: Difficulty = 'normal',
): RangeEntry[] {
  const known = new Set([...v.own, ...v.exposed]);
  const observations = (v.history ?? [])
    .filter((h) => h.actor === 'opponent')
    .slice(-24);
  const range: RangeEntry[] = [];
  for (let card = 0; card < 52; card++) {
    if (known.has(card)) continue;
    let logWeight = 0;
    for (const h of observations) {
      const quality = potential([card, ...h.opponentExposed], h.ownExposed);
      const price = h.call / Math.max(1, h.potBefore + h.call);
      let likelihood = 1;
      if (h.action.type === 'raise') {
        const extra = Math.max(0, h.paid - h.call);
        const multiple = extra / Math.max(10, h.potBefore + h.call);
        // Small probes, strong value bets and bluffs all retain nonzero support.
        likelihood =
          0.12 +
          0.88 * sigmoid((quality - (0.4 + 0.1 * Math.min(3, multiple))) * 7);
      } else if (h.action.type === 'call') {
        likelihood =
          0.25 + 0.75 * sigmoid((quality - (0.28 + 0.48 * price)) * 7);
      } else if (h.action.type === 'check') {
        likelihood = 0.55 + 0.45 * (1 - sigmoid((quality - 0.7) * 7));
      }
      logWeight += Math.log(likelihood);
    }
    range.push({
      card,
      weight: Math.exp(
        Math.max(-8, logWeight) * (difficulty === 'easy' ? 0.55 : 1),
      ),
      quality: potential([card, ...v.exposed], v.own.slice(1)),
    });
  }
  return range;
}

export function candidateActions(v: View, actual?: Action): Action[] {
  const l = viewLimits(v);
  const actions: Action[] = l.call
    ? [{ type: 'fold' }, { type: 'call' }]
    : [{ type: 'check' }];
  if (l.max > l.current) {
    const pricePot = v.pot + l.call;
    for (const target of [
      l.min,
      l.current + Math.round(pricePot * 0.5),
      l.current + pricePot,
      l.current + pricePot * 2,
      l.max,
    ]) {
      const to = Math.min(l.max, Math.max(l.min, target));
      const action: Action = { type: 'raise', to };
      if (legalDecision(v, action)) actions.push(action);
    }
  }
  if (actual && legalDecision(v, actual)) actions.push(actual);
  return [...new Map(actions.map((a) => [key(a), a])).values()];
}
function sample(
  v: View,
  range: RangeEntry[],
  count: number,
  rng: () => number,
): World[] {
  const total = range.reduce((sum, r) => sum + r.weight, 0);
  const known = new Set([...v.own, ...v.exposed]);
  const worlds: World[] = [];
  for (let n = 0; n < count; n++) {
    let target = roll(rng) * total;
    const hidden =
      range.find((r) => (target -= r.weight) < 0) ?? range[range.length - 1];
    const pool = Array.from({ length: 52 }, (_, c) => c).filter(
      (c) => c !== hidden.card && !known.has(c),
    );
    let remaining = pool.length;
    const take = () => {
      const index = Math.floor(roll(rng) * remaining);
      const card = pool[index];
      pool[index] = pool[--remaining];
      return card;
    };
    const own = [...v.own],
      other = [hidden.card, ...v.exposed];
    while (own.length < 5) own.push(take());
    while (other.length < 5) other.push(take());
    const winner = compare(evaluate(own), evaluate(other));
    worlds.push({
      share: winner > 0 ? 1 : winner === 0 ? 0.5 : 0,
      response: roll(rng),
      quality: hidden.quality,
    });
  }
  return worlds;
}
function defenseReference(range: RangeEntry[], multiple: number) {
  const groups = new Map<number, number>();
  for (const entry of range)
    groups.set(entry.quality, (groups.get(entry.quality) ?? 0) + entry.weight);
  const entries = [...groups].sort((a, b) => b[0] - a[0]);
  const target = range.reduce((sum, r) => sum + r.weight, 0) / (1 + multiple);
  let above = 0;
  for (const [quality, weight] of entries) {
    if (above + weight >= target)
      return { quality, fraction: clamp((target - above) / weight) };
    above += weight;
  }
  return { quality: entries.at(-1)![0], fraction: 1 };
}
function calculate(
  v: View,
  difficulty: Difficulty,
  rng: () => number,
  actual?: Action,
) {
  validate(v);
  const l = viewLimits(v);
  const count = difficulty === 'easy' ? 160 : 480;
  const range = opponentRange(v, difficulty);
  const worlds = sample(v, range, count, rng);
  const quality = potential(v.own, v.exposed);
  const future = (5 - v.own.length) / 3;
  const equity = mean(worlds.map((w) => w.share));
  const options = candidateActions(v, actual).map((action) => {
    const paid =
      action.type === 'raise'
        ? action.to - v.paid
        : action.type === 'call'
          ? l.call
          : 0;
    const otherCost = action.type === 'raise' ? action.to - v.otherPaid : 0;
    const multiple =
      action.type === 'raise'
        ? Math.max(0, action.to - l.current) / Math.max(1, v.pot + l.call)
        : 0;
    const reference =
      action.type === 'raise' ? defenseReference(range, multiple) : null;
    const allIn =
      paid >= v.stack ||
      (action.type === 'raise' && otherCost >= v.opponentStack) ||
      (action.type === 'call' && v.opponentStack === 0);
    const realization = allIn
      ? 1
      : clamp(1 - future * (0.09 + (1 - quality) * 0.12), 0.78, 1);
    const values = worlds.map((world) => {
      if (action.type === 'fold') return 0;
      if (action.type === 'raise') {
        const price = otherCost / Math.max(1, v.pot + paid + otherCost);
        let continuation =
          0.04 + 0.96 * sigmoid((world.quality - (0.35 + price * 0.55)) * 9);
        if (reference)
          continuation = Math.max(
            continuation,
            world.quality > reference.quality
              ? 1
              : world.quality === reference.quality
                ? reference.fraction
                : 0,
          );
        if (world.response > continuation) return v.pot;
      }
      // All earlier contributions are sunk. Only this action's new payment is subtracted.
      return world.share * (v.pot + paid + otherCost) * realization - paid;
    });
    const ev = mean(values);
    const error = Math.sqrt(
      values.reduce((sum, value) => sum + (value - ev) ** 2, 0) /
        Math.max(1, count - 1) /
        count,
    );
    const extraRisk = Math.max(0, paid - l.call);
    const allowance =
      extraRisk * (0.025 + future * 0.065) * (1 - quality * 0.5);
    const reason =
      action.type === 'fold'
        ? '放弃已投入的沉没筹码，不再新增风险；增量 EV 以 0 为参照。'
        : action.type === 'check'
          ? '免费保留争夺底池的机会；未来下注未展开，用保守兑现系数近似。'
          : action.type === 'call'
            ? `新增 ${paid}，结算底池 ${v.pot + paid}；需要将范围权益与成本和后续风险一起比较。`
            : `新增 ${paid}，若被跟再增加对手 ${otherCost}；同时估计弃牌收益与被跟后的结果，大尺度另留模型风险余量。`;
    return {
      action,
      paid,
      ev,
      error,
      robust: ev - 1.96 * error - allowance,
      reason,
    } satisfies Candidate;
  });
  // Early deep-stack shoves rely too much on an unsearched future tree. Keep
  // their EV visible, but choose the training reference from ordinary sizes.
  const ordinaryCeiling = Math.max(l.min, l.current + 2 * (v.pot + l.call));
  const deepEarly = v.street < 4 && l.max > ordinaryCeiling;
  const eligible = options.filter(
    (o) =>
      (l.call || o.action.type !== 'fold') &&
      (!deepEarly ||
        o.action.type !== 'raise' ||
        o.action.to <= ordinaryCeiling),
  );
  const ranked = [...eligible].sort(
    (a, b) => b.robust - a.robust || a.paid - b.paid,
  );
  const tolerance = Math.max(1, v.pot * 0.025);
  const near = eligible
    .filter((o) => o.robust >= ranked[0].robust - tolerance)
    .sort((a, b) => a.paid - b.paid || b.robust - a.robust);
  return {
    equity,
    options,
    best: near[0],
    close: near.length > 1,
    samples: count,
    tolerance,
    deepEarly,
    ordinaryCeiling,
  };
}
type Model = ReturnType<typeof calculate>;
function makeReview(v: View, action: Action, model: Model): Review {
  const l = viewLimits(v);
  const actual = model.options.find((o) => key(o.action) === key(action))!;
  const opponents = (v.history ?? []).filter((h) => h.actor === 'opponent');
  const rangeNote = opponents.length
    ? `依据对手最近 ${Math.min(24, opponents.length)} 次公开动作软修正暗牌范围；下注尺度与当时明牌影响权重，也保留试探、诈唬与慢打的可能。`
    : '尚无可用的对手公开行动，暗牌范围先按合法未知牌均匀起步；旧存档不会用私有复盘补造历史。';
  const recommended = actionLabel(model.best.action, l.call);
  const same = key(action) === key(model.best.action);
  const reason = `${actual.reason} ${same ? '这次选择与稳健参照一致。' : `可优先比较${recommended}，不要只看自己的表面牌型。`} ${model.close ? '候选估值相近，参照偏向少投入；不把这类差距判为明显错误。' : '这是范围和响应假设下的近似比较，不是确定的最优动作。'}`;
  return {
    seat: v.seat ?? 0,
    street: v.street,
    action: actionLabel(action, l.call),
    equity: model.equity,
    odds: l.call / Math.max(1, v.pot + l.call),
    reason,
    advice: {
      recommended,
      rationale: [
        `第 ${v.street} 轮，你有 ${v.own.length} 张牌、对手露出 ${v.exposed.length} 张；范围抽样权益约 ${Math.round(model.equity * 100)}%。`,
        l.call
          ? `跟注新增 ${l.call}，跟注后底池 ${v.pot + l.call}，静态盈亏门槛约 ${Math.round((l.call / (v.pot + l.call)) * 100)}%；提前轮次还要考虑未解决的后续下注。`
          : '当前没有待跟注金额，免费过牌保留权益，通常没有必要免费弃牌。',
        rangeNote,
        `${recommended}作为稳健参照：近似增量 EV ${rounded(model.best.ev)} 筹码；比较时还考虑抽样误差与加注风险，未必是原始 EV 最大的候选。`,
      ],
      alternatives: [...model.options]
        .sort((a, b) => b.robust - a.robust)
        .map((o) => ({
          label: actionLabel(o.action, l.call),
          reason: o.reason,
          ev: rounded(o.ev),
          paid: o.paid,
        })),
      nextStep:
        v.street === 4
          ? '这是最后一轮，没有下一张牌；重点核对对手暗牌范围、跟注成本及有效封顶。'
          : '下一张明牌出现后重新判断公开牌力、范围和筹码；不要把本轮近似权益当成后续必须跟到底的承诺。',
      model: '公开行动范围 · 五张牌无放回抽样 · 一轮响应 EV 近似',
      call: l.call,
      potAfterCall: v.pot + l.call,
      actualEV: rounded(actual.ev),
      recommendedEV: rounded(model.best.ev),
      estimatedLoss: rounded(Math.max(0, model.best.ev - actual.ev)),
      samples: model.samples,
      rangeNote,
      warnings: [
        '不是 GTO 求解或完整多轮最优策略，明牌较少时尤其不确定。',
        '公开动作似然、跟注概率、强端防守参照和未来权益兑现均为启发式；没有拟合真实玩家，也未搜索未来下注树。',
        '候选共用同一批样本；抽样误差与模型偏差不同，筹码差距不是可靠的行动评分。',
        ...(model.deepEarly
          ? [
              '提前轮次且有效筹码较深时，稳健参照只选择常规尺度（约两倍跟注后底池以内）；巨额下注仍保留候选估值，但其未来下注与对手响应假设更敏感。',
            ]
          : []),
      ],
      snapshot: {
        own: [...v.own],
        exposed: [...v.exposed],
        pot: v.pot,
        stack: v.stack,
        opponentStack: v.opponentStack,
      },
    },
  };
}
export function analyzeDecision(
  v: View,
  action: Action,
  difficulty: Difficulty = 'normal',
  rng: () => number = Math.random,
): Review {
  if (!legalDecision(v, action))
    throw new RangeError('只能复盘本局面中的合法行动。');
  return makeReview(v, action, calculate(v, difficulty, rng, action));
}
export function decide(
  v: View,
  difficulty: Difficulty,
  rng: () => number = Math.random,
) {
  const model = calculate(v, difficulty, rng);
  let selected = model.best;
  if (difficulty === 'easy') {
    const nearby = model.options.filter(
      (o) =>
        o.robust >= model.best.robust - model.tolerance &&
        o.ev >= -model.tolerance &&
        (!model.deepEarly ||
          o.action.type !== 'raise' ||
          o.action.to <= model.ordinaryCeiling),
    );
    if (nearby.length > 1)
      selected = nearby[Math.floor(roll(rng) * nearby.length)];
  }
  const review = makeReview(v, selected.action, model);
  return {
    action: selected.action,
    equity: model.equity,
    odds: review.odds,
    reason: review.reason,
    review,
  };
}
