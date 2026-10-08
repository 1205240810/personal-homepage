import { cardRank, cardSuit, estimateEquity } from './holdem-cards.ts';
import {
  legalActions,
  otherSeat,
  type HoldemState,
  type PokerAction,
  type Decision,
  type Seat,
} from './holdem-engine.ts';

export type BotStyle = 'balanced' | 'careful' | 'active';
export const BOT_STYLES = {
  balanced: { label: '均衡', description: '混合价值下注与适量诈唬。' },
  careful: { label: '稳健', description: '少做边缘跟注，偏好强牌。' },
  active: { label: '积极', description: '更频繁地下注，施加压力。' },
} as const;

// A local mixed heuristic policy. These frequencies are not solver output.
export function chooseBotAction(
  state: HoldemState,
  equity: number,
  style: BotStyle,
  random = Math.random,
): PokerAction {
  const legal = legalActions(state);
  if (!legal) throw new Error('没有可行动的玩家');
  const aggression = style === 'active' ? 1.2 : style === 'careful' ? 0.65 : 1;
  const margin = style === 'careful' ? 0.1 : style === 'active' ? 0.02 : 0.06;
  const roll = random();
  const bigValue = equity > (state.street === 'preflop' ? 0.68 : 0.74);
  const semiValue = equity > 0.56;
  const bluff = roll < 0.1 * aggression;
  const raiseTo = () => {
    const size =
      state.street === 'preflop'
        ? Math.max(state.bigBlind * 2.5, Math.max(...state.streetBets) * 2.6)
        : Math.max(...state.streetBets) +
          Math.max(
            state.bigBlind,
            Math.round((legal.pot + legal.call) * (bigValue ? 0.7 : 0.45)),
          );
    return Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(size)));
  };
  if (legal.call > 0) {
    const smallBlindPrice =
      state.street === 'preflop' && legal.owed <= state.bigBlind;
    if (!smallBlindPrice && equity < legal.potOdds + margin && !bluff)
      return { type: 'fold' };
    if (
      legal.canRaise &&
      ((bigValue && roll < 0.78 * aggression) ||
        (semiValue && roll < 0.2 * aggression) ||
        bluff)
    )
      return { type: 'raise', to: raiseTo() };
    return { type: 'call' };
  }
  if (legal.canRaise && ((semiValue && roll < 0.68 * aggression) || bluff))
    return { type: 'raise', to: raiseTo() };
  return { type: 'check' };
}

export function quickEquity(hole: readonly number[]) {
  const ranks = hole.map(cardRank).sort((a, b) => b - a);
  if (ranks[0] === ranks[1]) return 0.5 + ranks[0] / 38;
  return Math.min(
    0.75,
    0.25 +
      (ranks[0] + ranks[1]) / 70 +
      (cardSuit(hole[0]) === cardSuit(hole[1]) ? 0.04 : 0),
  );
}

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
};

export function reviewHand(
  state: HoldemState,
  samples = 360,
  random = Math.random,
): ReviewPoint[] {
  return state.actions.flatMap((decision, index) => {
    if (decision.seat !== 0) return [];
    const estimate = estimateEquity(
      state.holes[0],
      decision.board,
      samples,
      random,
    );
    const equity = estimate.equity;
    const threshold =
      decision.call > 0 ? decision.call / (decision.pot + decision.call) : null;
    let title = '观察下注范围';
    let advice =
      '先想清楚哪些更弱的牌会跟注、哪些更强的牌会弃牌，再选择是否下注。';
    let principle = '牌力优势、范围优势与位置共同影响决策，不能只看这一手牌。';
    let action = '过牌';
    if (decision.action.type === 'fold') {
      action = '弃牌';
      title =
        threshold !== null && equity < threshold
          ? '赔率偏紧，弃牌有依据'
          : '检查是否放弃了过多权益';
      advice =
        threshold === null
          ? '没有面临下注时，可以免费过牌。弃牌会直接放弃底池。'
          : `随机对手范围下估计权益约 ${pct(equity)}，本次跟注的静态门槛是 ${pct(threshold)}。${equity > threshold + 0.1 ? '可以复盘对手是否真的代表很强的范围，而不是只因担心输牌就弃牌。' : '还需结合对手范围、后续下注和位置判断。'}`;
      principle =
        '弃牌不等于失误。对手范围越强，真实权益可能比随机范围估计低得多。';
    } else if (decision.action.type === 'call') {
      action = `跟注 ${decision.paid}`;
      title = equity >= (threshold || 0) ? '跟注先看价格' : '跟注价格值得复查';
      advice = `跟注 ${decision.call} 争夺跟注后 ${decision.pot + decision.call} 的底池，需要约 ${pct(threshold || 0)} 的权益。随机范围估计为 ${pct(equity)}；${equity < (threshold || 0) ? '单看这个基准，跟注偏贵。' : '赔率达标只是起点，还要考虑能否实现这些权益。'}`;
      principle =
        '翻牌与转牌的权益并不能自动兑现；未来下注、位置和隐含赔率会改变跟注价值。';
    } else if (decision.action.type === 'raise') {
      action = `加注到 ${decision.action.to}`;
      const risk = decision.effectiveRisk ?? decision.paid;
      const bluffThreshold = risk / (decision.pot + risk);
      title = equity > 0.65 ? '明确价值下注的对象' : '给下注一个明确目的';
      advice =
        equity > 0.65
          ? `随机范围下约 ${pct(equity)} 权益。想一想：哪些更弱的组合愿意跟注？大尺度会得到多少跟注，小尺度又会保留哪些牌？`
          : `如果这次投入 ${risk} 是零权益的纯诈唬，需要对手至少约 ${pct(bluffThreshold)} 的弃牌率才能保本。带有听牌的半诈唬还会有摊牌权益，但不能把“有机会赢”当作加注的充分理由。`;
      principle =
        decision.street === 'river' && decision.call === 0
          ? `河牌单次下注模型：底池 ${decision.pot}、下注 ${risk}，理论最低防守频率约 ${pct(decision.pot / (decision.pot + risk))}。这只是模型基准，不是对所有对手都必须执行的频率。`
          : 'GTO 会在完整范围内平衡价值与诈唬。当前建议只提供尺度和赔率基准，不给出未经求解的最优频率。';
    } else {
      title = equity > 0.7 ? '强牌也可以选择过牌' : '保留免费观察的机会';
      advice =
        equity > 0.7
          ? '过牌可以保护你的过牌范围，也可能让对手继续投入。复盘时比较主动取值与诱导下注的效果，不要因为最终输牌就倒推当时必须下注。'
          : '过牌保留了当前权益。留意公共牌是否让对手范围明显受益，再决定下一轮是防守还是施压。';
    }
    return [
      {
        index,
        street: decision.street,
        action,
        equity,
        samples: estimate.samples,
        pot: decision.pot,
        call: decision.call,
        threshold,
        title,
        advice,
        principle,
        board: decision.board,
      },
    ];
  });
}

export const pct = (value: number) => `${Math.round(value * 100)}%`;
export const positionLabel = (state: HoldemState, seat: Seat) =>
  state.button === seat ? '按钮 / 小盲' : '大盲';
export const nextButton = (state: HoldemState) => otherSeat(state.button);
