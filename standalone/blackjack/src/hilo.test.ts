import { describe, expect, it } from 'vitest';
import { createDeck } from './engine';
import { createShoe, emptyHiLoRecord, hiLoValue, readHiLoRecord, runningCount, saveHiLoRecord, scoreHiLo, trueCount, HILO_KEY } from './hilo';

describe('Hi-Lo counting', () => {
  it('tags ranks and balances to zero over a full deck', () => {
    expect(['2', '3', '4', '5', '6'].map(hiLoValue)).toEqual([1, 1, 1, 1, 1]);
    expect(['7', '8', '9'].map(hiLoValue)).toEqual([0, 0, 0]);
    expect(['10', 'J', 'Q', 'K', 'A'].map(hiLoValue)).toEqual([-1, -1, -1, -1, -1]);
    expect(runningCount(createDeck())).toBe(0);
  });
  it('builds shoes with unique card ids that also balance', () => {
    for (const decks of [1, 2, 6] as const) {
      const shoe = createShoe(decks);
      expect(shoe).toHaveLength(52 * decks);
      expect(new Set(shoe.map((c) => c.id)).size).toBe(shoe.length);
      expect(runningCount(shoe)).toBe(0);
    }
  });
  it('converts running count to true count by half-deck estimates', () => {
    expect(trueCount(6, 156)).toBe(2);
    expect(trueCount(-3, 78)).toBe(-2);
    expect(trueCount(4, 10)).toBe(8);
    expect(trueCount(5, 0)).toBe(10);
  });
  it('scores streaks and validates stored records', () => {
    let r = emptyHiLoRecord();
    r = scoreHiLo(r, true); r = scoreHiLo(r, true); r = scoreHiLo(r, false); r = scoreHiLo(r, true);
    expect(r).toEqual({ rounds: 4, correct: 3, streak: 1, bestStreak: 2 });
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(saveHiLoRecord(r, storage)).toBe(true);
    expect(readHiLoRecord(storage)).toEqual(r);
    for (const bad of ['{', '[]', '{"rounds":1,"correct":2,"streak":0,"bestStreak":0}', '{"rounds":-1,"correct":0,"streak":0,"bestStreak":0}']) {
      mem.set(HILO_KEY, bad);
      expect(readHiLoRecord(storage)).toEqual(emptyHiLoRecord());
    }
    expect(saveHiLoRecord(r, { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
});
