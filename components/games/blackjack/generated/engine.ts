// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.
export type Suit = 'spades' | 'hearts' | 'clubs' | 'diamonds';
export interface Card { id: string; rank: string; suit: Suit }
export function createDeck(): Card[] {
  const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
  return suits.flatMap(suit => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    .map(rank => ({ id: `${suit}-${rank}`, rank, suit })));
}

/** Fisher–Yates; never mutates the supplied deck. */
export function shuffle(deck: Card[], rng: () => number = Math.random): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.max(0, Math.min(i, Math.floor(rng() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let highAces = 0;
  for (const card of cards) {
    if (card.rank === 'A') { total += 11; highAces++; }
    else total += ['J', 'Q', 'K'].includes(card.rank) ? 10 : Number(card.rank);
  }
  while (total > 21 && highAces > 0) { total -= 10; highAces--; }
  return { total, soft: highAces > 0 };
}

export function isNatural(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}
export function visibleDealerTotal(cards: Card[], hidden: boolean): number {
  return handValue(hidden ? cards.slice(0, 1) : cards).total;
}
