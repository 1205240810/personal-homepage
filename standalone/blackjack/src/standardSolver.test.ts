import { describe, expect, it } from 'vitest';
import type { Card } from './engine';
import { analyzeStandardDecision } from './standardSolver';
import type { StandardObservation } from './standardTypes';

let serial = 0;
const card = (rank: string): Card => ({
  id: `public-${serial++}`,
  rank,
  suit: 'spades',
});
function observation(
  ranks: string[],
  upcard: string,
  patch: Partial<StandardObservation> = {},
): StandardObservation {
  return {
    cards: ranks.map(card),
    dealerUpcard: card(upcard),
    visibleCards: [],
    fromSplit: false,
    splitAces: false,
    handCount: 1,
    availableChips: 2000,
    wager: 100,
    negativePeek: true,
    legalActions: ['hit', 'stand', 'double', 'split', 'surrender'],
    ...patch,
  };
}

describe('standard S17 replacement Bellman coach', () => {
  it.each([
    [['5', '6'], '6', 'double'],
    [['10', 'Q'], '6', 'stand'],
    [['8', '8'], '6', 'split'],
    [['A', 'A'], '6', 'split'],
    [['10', '6'], '10', 'surrender'],
    [['A', '7'], '6', 'double'],
    [['10', 'K'], '10', 'stand'],
  ] as const)(
    'computes a familiar basic strategy decision for %s vs %s',
    (ranks, upcard, bestAction) => {
      const advice = analyzeStandardDecision(observation([...ranks], upcard));
      expect(advice.bestAction).toBe(bestAction);
      expect(advice.values[bestAction]).toBeTypeOf('number');
      expect(advice.method).toContain('独立抽牌');
      expect(advice.warnings.join(' ')).toContain('不是精确有限牌靴');
      expect(advice.explanation.join(' ')).toContain('近似推荐');
    },
  );

  it('matches independent S17 replacement stand reference values', () => {
    // Published replacement S17 values, not a finite-shoe benchmark:
    // https://wizardofodds.com/games/blackjack/expected-return-infinite-deck/
    const hard16 = analyzeStandardDecision(
      observation(['10', '6'], '6', { legalActions: ['stand'] }),
    );
    const hard20 = analyzeStandardDecision(
      observation(['10', 'Q'], '6', { legalActions: ['stand'] }),
    );
    expect(hard16.values.stand).toBeCloseTo(-0.153699, 5);
    expect(hard20.values.stand).toBeCloseTo(0.703959, 5);
  });

  it('uses negative peek only for the hidden-hole prior, not as clairvoyance', () => {
    const negative = analyzeStandardDecision(
      observation(['10', 'Q'], '10', { legalActions: ['stand'] }),
    );
    const beforePeek = analyzeStandardDecision(
      observation(['10', 'Q'], '10', {
        negativePeek: false,
        legalActions: ['stand'],
      }),
    );
    expect(beforePeek.values.stand).toBeCloseTo(
      (12 / 13) * negative.values.stand! - 1 / 13,
      12,
    );
    const negativeAce = analyzeStandardDecision(
      observation(['10', 'Q'], 'A', { legalActions: ['stand'] }),
    );
    const beforeAcePeek = analyzeStandardDecision(
      observation(['10', 'Q'], 'A', {
        negativePeek: false,
        legalActions: ['stand'],
      }),
    );
    expect(beforeAcePeek.values.stand).toBeCloseTo(
      (9 / 13) * negativeAce.values.stand! - 4 / 13,
      12,
    );
  });

  it('prices insurance at half a wager and recommends decline before an ace peek', () => {
    const advice = analyzeStandardDecision(
      observation(['9', '8'], 'A', {
        negativePeek: false,
        legalActions: ['insurance', 'declineInsurance'],
      }),
    );
    expect(advice.values.insurance).toBeCloseTo(-1 / 26, 12);
    expect(advice.values.declineInsurance).toBe(0);
    expect(advice.bestAction).toBe('declineInsurance');
    const knownNegative = analyzeStandardDecision(
      observation(['9', '8'], 'A', {
        negativePeek: true,
        legalActions: ['insurance', 'declineInsurance'],
      }),
    );
    expect(knownNegative.values.insurance).toBe(-0.5);
  });

  it('values natural 3:2 but split A+10 as an ordinary 21', () => {
    const natural = analyzeStandardDecision(
      observation(['A', 'K'], '6', { legalActions: ['stand'] }),
    );
    const split = analyzeStandardDecision(
      observation(['A', 'K'], '6', {
        fromSplit: true,
        splitAces: true,
        legalActions: ['stand'],
      }),
    );
    expect(natural.values.stand).toBe(1.5);
    expect(split.values.stand).toBeCloseTo(0.902837, 5);
    const beforePeek = analyzeStandardDecision(
      observation(['A', 'K'], 'A', {
        negativePeek: false,
        legalActions: ['stand'],
      }),
    );
    expect(beforePeek.values.stand).toBeCloseTo((1.5 * 9) / 13, 12);
  });

  it('doubles total win/loss exposure and draws exactly one card', () => {
    const dealerSix = analyzeStandardDecision(
      observation(['5', '6'], '6', { legalActions: ['stand', 'double'] }),
    );
    expect(dealerSix.values.double).toBeGreaterThan(0.6);
    const bustHeavy = analyzeStandardDecision(
      observation(['10', '8'], '6', { legalActions: ['stand', 'double'] }),
    );
    expect(bustHeavy.values.double).toBeLessThan(-1);
    expect(dealerSix.bestAction).toBe('double');
    expect(bustHeavy.bestAction).toBe('stand');
  });

  it('filters insufficient funds, max four hands, surrender after split and split-A restrictions', () => {
    const broke = analyzeStandardDecision(
      observation(['5', '6'], '6', { availableChips: 0 }),
    );
    expect(broke.values.double).toBeUndefined();
    expect(broke.values.split).toBeUndefined();
    expect(broke.bestAction).toBe('hit');
    const capped = analyzeStandardDecision(
      observation(['8', '8'], '6', { handCount: 4, fromSplit: true }),
    );
    expect(capped.values.split).toBeUndefined();
    expect(capped.values.surrender).toBeUndefined();
    const aces = analyzeStandardDecision(
      observation(['A', 'A'], '6', { fromSplit: true, splitAces: true }),
    );
    expect(Object.keys(aces.values)).toEqual(['stand']);
    const noInsuranceFunds = analyzeStandardDecision(
      observation(['9', '8'], 'A', {
        availableChips: 49,
        negativePeek: false,
        legalActions: ['insurance', 'declineInsurance'],
      }),
    );
    expect(noInsuranceFunds.values.insurance).toBeUndefined();
    expect(noInsuranceFunds.bestAction).toBe('declineInsurance');
  });

  it('allocates split offspring funds jointly and obeys the global hand cap', () => {
    const pair = observation(['8', '8'], '6');
    const full = analyzeStandardDecision(pair);
    const noExtraDouble = analyzeStandardDecision({
      ...pair,
      availableChips: pair.wager,
    });
    const oneSlot = analyzeStandardDecision({ ...pair, handCount: 3 });
    expect(full.values.split).toBeGreaterThan(noExtraDouble.values.split!);
    expect(full.values.split).toBeGreaterThanOrEqual(oneSlot.values.split!);
    expect(full.values.split).toBeLessThan(2);
    expect(full.warnings.join(' ')).toContain('已存在其他分手');
    expect(full.warnings.join(' ')).toContain('先给两手都补一张');
    const localHand = analyzeStandardDecision(observation(['5', '6'], '6', {
      fromSplit: true, handCount: 4, legalActions: ['hit', 'stand', 'double'],
    }));
    expect(localHand.warnings.join(' ')).toContain('局部收益');
    const aaFull = analyzeStandardDecision(observation(['A', 'A'], '6'));
    const aaBroke = analyzeStandardDecision(
      observation(['A', 'A'], '6', { availableChips: 100 }),
    );
    // Split aces cannot re-split or double regardless of available resources.
    expect(aaFull.values.split).toBe(aaBroke.values.split);
  });

  it('preserves normalized EV when bet and bankroll scale together', () => {
    const base = observation(['8', '8'], '6', { availableChips: 250 });
    const first = analyzeStandardDecision(base);
    const scaled = analyzeStandardDecision({
      ...base,
      wager: 1700,
      availableChips: 4250,
    });
    expect(scaled.values).toEqual(first.values);
    expect(scaled.bestAction).toBe(first.bestAction);
  });

  it('accepts only supplied legal actions and rejects an empty decision mask', () => {
    const advice = analyzeStandardDecision(
      observation(['5', '6'], '6', { legalActions: ['stand'] }),
    );
    expect(advice.bestAction).toBe('stand');
    expect(Object.keys(advice.values)).toEqual(['stand']);
    expect(() =>
      analyzeStandardDecision(
        observation(['5', '6'], '6', { legalActions: [] }),
      ),
    ).toThrow('没有可评估');
  });

  it('has a public observation firewall, is deterministic, and never mutates the input', () => {
    const source = observation(['8', '8'], '6');
    const before = JSON.stringify(source);
    const extra = Object.assign({}, source);
    for (const key of [
      'deck',
      'seed',
      'dealerHole',
      'hiddenCards',
      'futureCards',
    ])
      Object.defineProperty(extra, key, {
        get() {
          throw new Error('Hidden information accessed');
        },
      });
    const advice = analyzeStandardDecision(extra);
    expect(analyzeStandardDecision(source)).toEqual(advice);
    expect(JSON.stringify(source)).toBe(before);
    // Explicitly ignore shoe composition in this disclosed replacement model.
    expect(
      analyzeStandardDecision({
        ...source,
        visibleCards: ['A', 'K', 'Q'].map(card),
      }).values,
    ).toEqual(advice.values);
  });
});
