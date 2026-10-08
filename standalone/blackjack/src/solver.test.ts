import { describe, expect, it } from 'vitest';
import type { Card } from './engine';
import { coach, coachWithCounts, FULL_COUNTS, holePosterior, playerDrawProbabilities, strategicDealer, type CoachSnapshot, type Mode } from './solver';
const card = (rank: string): Card => ({ id: rank, rank, suit: 'spades' });
const snapshot = (ranks: string[], up: string, mode: Mode = 'classic'): CoachSnapshot => ({ playerCards: ranks.map(card), dealerUpcard: card(up), mode, negativePeek: true });
const count = (ranks: number[]) => Array.from({ length: 10 }, (_, i) => ranks.filter(r => r === i + 1).length);
// Independent oracle enumerates all equally likely labelled-card permutations.
// Beliefs are grouped by observation before choosing an action: no hole clairvoyance.
function permutations(xs: number[]): number[][] {
  if (!xs.length) return [[]];
  return xs.flatMap((x, i) => permutations(xs.filter((_, j) => j !== i)).map(rest => [x, ...rest]));
}
const points = (xs: number[]) => { const low = xs.reduce((a, b) => a + b, 0); return low + (xs.includes(1) && low <= 11 ? 10 : 0); };
function groups(worlds: number[][]): Map<number, number[][]> {
  const result = new Map<number, number[][]>();
  for (const w of worlds) { const g = result.get(w[0]) ?? []; g.push(w.slice(1)); result.set(w[0], g); }
  return result;
}
function oracle(player: number[], up: number, unseen: number[], mode: Mode) {
  const worlds = permutations(unseen).filter(w => !(up === 1 && w[0] === 10 || up === 10 && w[0] === 1));
  function dealer(hand: number[], shoes: number[][], target: number): number {
    const t = points(hand), stand = t > 21 ? -1 : Math.sign(t - target);
    if (t > 21 || !shoes[0].length || mode === 'classic' && t >= 17) return stand;
    let hit = 0;
    for (const [r, rest] of groups(shoes)) hit += rest.length / shoes.length * dealer([...hand, r], rest, target);
    return mode === 'classic' ? hit : Math.max(hit, stand);
  }
  function actions(hand: number[], belief: number[][]): { hit: number; stand: number; bust: number } {
    let stand = 0;
    for (const [hole, shoes] of groups(belief)) stand -= shoes.length / belief.length * dealer([up, hole], shoes, points(hand));
    if (belief[0].length === 1) return { hit: stand, stand, bust: 0 };
    // Keep hole at index 0 while grouping by the observed shoe draw at index 1.
    const obs = new Map<number, number[][]>();
    for (const w of belief) { const g = obs.get(w[1]) ?? []; g.push([w[0], ...w.slice(2)]); obs.set(w[1], g); }
    let hit = 0, bust = 0;
    for (const [r, next] of obs) {
      const p = next.length / belief.length;
      if (points([...hand, r]) > 21) { hit -= p; bust += p; }
      else { const a = actions([...hand, r], next); hit += p * Math.max(a.hit, a.stand); }
    }
    return { hit, stand, bust };
  }
  return actions(player, worlds);
}
describe('finite hidden-hole Bellman coach', () => {
  for (const mode of ['classic', 'strategic'] as const) {
    for (const [player, up, unseen] of [
      [[10, 2], 6, [1, 2, 3, 7, 10]],
      [[1, 1, 3], 1, [1, 2, 4, 10]],
      [[10, 6], 10, [1, 2, 4, 8]],
      [[9, 8], 5, [2, 2, 6, 10]],
    ] as [number[], number, number[]][]) {
      it(`matches independent permutation oracle: ${mode} ${player}/${up}`, () => {
        const r = (n: number) => n === 1 ? 'A' : String(n);
        const actual = coachWithCounts(snapshot(player.map(r), r(up), mode), count(unseen), { maxMs: 10000 });
        const expected = oracle(player, up, unseen, mode);
        expect(actual.method).toBe('exact-finite');
        expect(actual.hitEV).toBeCloseTo(expected.hit, 12);
        expect(actual.standEV).toBeCloseTo(expected.stand, 12);
        expect(actual.bustProbability).toBeCloseTo(expected.bust, 12);
      });
    }
  }
  it('conditions the hole and next-card marginals on negative peek', () => {
    const c = count([1, 2, 10, 10]);
    expect(holePosterior(c, card('A'))).toEqual([.5, .5, 0, 0, 0, 0, 0, 0, 0, 0]);
    const p = playerDrawProbabilities(c, card('A'));
    expect(p[0]).toBeCloseTo(1 / 6); expect(p[1]).toBeCloseTo(1 / 6); expect(p[9]).toBeCloseTo(2 / 3);
  });
  it('forces stand on exhausted shoe, including dealer exhaustion', () => {
    const x = coachWithCounts(snapshot(['10', '8'], '6', 'strategic'), count([10]));
    expect(x.recommendation).toBe('stand'); expect(x.hitEV).toBe(x.standEV); expect(x.standEV).toBe(1);
    expect(x.bustProbability).toBe(0);
    expect(strategicDealer({ ownCards: [card('6'), card('10')], playerCards: [card('10'), card('8')], remainingCounts: count([]) }).action).toBe('stand');
  });
  it('settles player natural after negative peek and handles multiple aces', () => {
    expect(coach(snapshot(['A', 'K'], 'A'))).toMatchObject({ terminal: true, standEV: 1, recommendation: 'stand' });
    const x = coachWithCounts(snapshot(['A', 'A', '9'], '6'), count([2, 10]));
    expect(x.bustProbability).toBe(0);
    expect(x.terminal).toBe(true);
    expect(x.recommendation).toBe('stand');
  });
  it('settles dealer natural precedence without further actions', () => {
    const both = strategicDealer({ ownCards: [card('A'),card('K')], playerCards: [card('A'),card('10')], remainingCounts: count([2]) });
    expect(both).toMatchObject({terminal:true,action:'stand',standEV:0});
    const drawn = strategicDealer({ ownCards: [card('A'),card('K')], playerCards: [card('7'),card('7'),card('7')], remainingCounts: count([2]) });
    expect(drawn.standEV).toBe(1);
  });
  it('never accepts future hidden state through extra snapshot fields', () => {
    const s = snapshot(['10', '6'], '10', 'strategic');
    const options = { maxNodes: 0 };
    const a = coach({ ...s, dealerHole: card('2'), deck: [card('3')] } as CoachSnapshot, options);
    const b = coach({ ...s, dealerHole: card('K'), deck: [card('A')] } as CoachSnapshot, options);
    expect(a).toEqual(b); expect(a.method).toBe('replacement-model');
  });
  it('discards partial finite EVs on either cap and replacement solves optimal future actions', () => {
    const s = snapshot(['10', '6'], '6');
    const a = coach(s, { maxNodes: 0 }), b = coach(s, { maxNodes: 10 });
    expect(a.method).toBe('replacement-model'); expect(a.fallbackReason).toBe('node-cap');
    expect(a.hitEV).toBe(b.hitEV); expect(a.standEV).toBe(b.standEV);
    expect(coach(s, { maxMs: -1 }).fallbackReason).toBe('time-cap');
    expect(a.bustProbability).toBeCloseTo(8 / 13);
    // Classical infinite-deck S17 hard 16 vs 6: standard EV benchmark.
    expect(a.standEV).toBeCloseTo(-0.153699, 5);
  });
  it('validates inconsistent posterior and count inputs', () => {
    expect(() => holePosterior(count([10, 10]), card('A'))).toThrow();
    expect(() => coachWithCounts(snapshot(['2','3'], '6'), [1])).toThrow();
    expect(FULL_COUNTS.reduce((a,b)=>a+b,0)).toBe(52);
  });
});
