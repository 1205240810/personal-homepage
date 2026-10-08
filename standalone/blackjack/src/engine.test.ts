import { describe, expect, it } from 'vitest';
import { createDeck, shuffle, handValue, isNatural, visibleDealerTotal, type Card } from './engine';
const cards = (...ranks: string[]): Card[] => ranks.map((rank, i) => ({ id: `${rank}-${i}`, rank, suit: 'spades' }));

describe('cards and scoring', () => {
  it('creates 52 unique cards with four suits', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(card => card.id)).size).toBe(52);
    expect(new Set(deck.map(card => card.suit)).size).toBe(4);
  });
  it('shuffles reproducibly without mutating or losing cards', () => {
    const deck = createDeck();
    const original = [...deck];
    const shuffled = shuffle(deck, () => 0);
    expect(deck).toEqual(original);
    expect(shuffled).not.toEqual(deck);
    expect([...shuffled].sort((a,b) => a.id.localeCompare(b.id))).toEqual([...deck].sort((a,b) => a.id.localeCompare(b.id)));
    expect(shuffle([], () => 0)).toEqual([]);
  });
  it.each([
    [[], 0, false], [['A'], 11, true], [['A','6'], 17, true],
    [['A','A','9'], 21, true], [['A','A','9','K'], 21, false],
    [['A','A','A','9'], 12, false], [['K','Q','2'], 22, false],
  ])('scores %j as %i (soft=%s)', (ranks, total, soft) => {
    expect(handValue(cards(...ranks as string[]))).toEqual({ total, soft });
  });
  it('requires two cards for a natural', () => {
    expect(isNatural(cards('A','K'))).toBe(true);
    expect(isNatural(cards('7','7','7'))).toBe(false);
    expect(isNatural(cards('10','10'))).toBe(false);
  });
  it('never leaks the hole card into the visible total', () => {
    expect(visibleDealerTotal(cards('A','K'), true)).toBe(11);
    expect(visibleDealerTotal(cards('A','K'), false)).toBe(21);
    expect(visibleDealerTotal([], true)).toBe(0);
  });
});

