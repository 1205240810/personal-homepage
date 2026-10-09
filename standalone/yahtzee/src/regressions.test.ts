import { describe, expect, it } from 'vitest';
import {
  categories,
  type Card,
  bonusFor,
  initial,
  options,
  restore,
  roll,
  score,
  total,
} from './logic';

// Independent oracle: consecutive-run scan rather than the production slices,
// and sorted multiplicities rather than the production max-count predicates.
function ordinaryOracle(dice: number[]): Card {
  const frequency = new Map<number, number>();
  for (const value of dice)
    frequency.set(value, (frequency.get(value) ?? 0) + 1);
  const multiplicity = [...frequency.values()].sort((a, b) => b - a);
  const faces = [...frequency.keys()].sort((a, b) => a - b);
  let run = 1,
    longest = 1;
  for (let index = 1; index < faces.length; index++) {
    run = faces[index] === faces[index - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const sum = dice.reduce((a, b) => a + b, 0);
  return {
    ...Object.fromEntries(
      categories
        .slice(0, 6)
        .map((category, index) => [
          category,
          (frequency.get(index + 1) ?? 0) * (index + 1),
        ]),
    ),
    three: multiplicity[0] >= 3 ? sum : 0,
    four: multiplicity[0] >= 4 ? sum : 0,
    house: multiplicity.join(',') === '3,2' ? 25 : 0,
    small: longest >= 4 ? 30 : 0,
    large: longest === 5 ? 40 : 0,
    yahtzee: frequency.size === 1 ? 50 : 0,
    chance: sum,
  };
}

describe('release scoring and persistence regressions', () => {
  it('all 7,776 ordered rolls agree with an independent ordinary-scoring oracle', () => {
    for (let code = 0; code < 6 ** 5; code++) {
      let current = code;
      const dice = Array.from({ length: 5 }, () => {
        const value = (current % 6) + 1;
        current = Math.floor(current / 6);
        return value;
      });
      expect(options(dice, {})).toEqual(ordinaryOracle(dice));
    }
  });
  it('every repeated face obeys forced upper, joker lower and last upper fallback', () => {
    for (let face = 1; face <= 6; face++)
      for (const yahtzee of [0, 50]) {
        const dice = Array(5).fill(face),
          matching = categories[face - 1];
        expect(options(dice, { yahtzee })).toEqual({ [matching]: face * 5 });
        const upperFilled = { yahtzee, [matching]: face * 3 };
        const joker = options(dice, upperFilled);
        expect(Object.keys(joker)).toEqual(
          categories.slice(6).filter((category) => category !== 'yahtzee'),
        );
        expect(joker).toMatchObject({
          house: 25,
          small: 30,
          large: 40,
          three: face * 5,
          four: face * 5,
          chance: face * 5,
        });
        const lowerFilled: Card = {
          ...upperFilled,
          three: 0,
          four: 0,
          house: 0,
          small: 0,
          large: 0,
          chance: 5,
        };
        expect(options(dice, lowerFilled)).toEqual(
          Object.fromEntries(
            categories
              .slice(0, 6)
              .filter((category) => category !== matching)
              .map((category) => [category, 0]),
          ),
        );
        expect(bonusFor(dice, upperFilled)).toBe(yahtzee === 50 ? 100 : 0);
      }
  });
  it('a complete 13-round match terminates once, records 26 scores and restores without replaying bonuses', () => {
    let state = initial();
    for (const category of categories) {
      state = score(
        roll(state, () => 0.2),
        category,
      );
      state = score(
        roll(state, () => 0.2),
        category,
      );
    }
    expect(state.turn).toBe('done');
    expect(state.bonus).toEqual([100, 100]);
    expect(state.log).toHaveLength(26);
    expect(total(state.cards[0], state.bonus[0])).toBe(190);
    expect(restore(JSON.stringify(state))).toEqual(state);
    expect(score(state, 'chance')).toBe(state);
    expect(
      roll(state, () => {
        throw new Error('completed games cannot draw');
      }),
    ).toBe(state);
  });
  it('rejects invalid dice RNG atomically and never awards a bonus to invalid faces', () => {
    const state = initial(),
      before = JSON.stringify(state);
    for (const invalid of [-0.1, 1, Infinity, NaN])
      expect(() => roll(state, () => invalid)).toThrow('随机数');
    expect(JSON.stringify(state)).toBe(before);
    expect(bonusFor([7, 7, 7, 7, 7], { yahtzee: 50 })).toBe(0);
  });
  it('rejects oversized checkpoints before parsing irrelevant payloads', () => {
    expect(
      restore(JSON.stringify({ ...initial(), unrelated: 'x'.repeat(30000) })),
    ).toBeNull();
  });
});
