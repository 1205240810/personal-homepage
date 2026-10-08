import { describe, expect, it } from 'vitest';
import { handValue, type Card } from './engine';
import { createStandardShoe, initialStandardGame, legalStandardActions, standardObservation, standardReducer } from './standardGame';
import type { StandardAction, StandardState } from './standardTypes';

function deck(...ranks: string[]): Card[] {
  return ranks.map((rank, index) => ({ rank, suit: 'spades', id: `test-${index}-${rank}` }));
}
function dealt(ranks: string[], options = { initialBankroll: 1_000, bet: 20 }): StandardState {
  let state = standardReducer(initialStandardGame(options), { type: 'START', deck: deck(...ranks) });
  for (let index = 0; index < 4; index++) state = standardReducer(state, { type: 'DEAL_STEP' });
  return state;
}
const act = (state: StandardState, action: StandardAction) => standardReducer(state, { type: 'ACTION', action });
function finish(state: StandardState): StandardState {
  for (let count = 0; state.phase === 'dealer' && count < 100; count++) state = standardReducer(state, { type: 'DEALER_STEP' });
  expect(state.phase).toBe('settled');
  return state;
}
function conservation(state: StandardState, before: number) {
  expect(Number.isSafeInteger(state.bankroll)).toBe(true);
  expect(state.bankroll).toBeGreaterThanOrEqual(0);
  if (state.phase === 'settled') expect(state.bankroll).toBe(before + state.net);
  else expect(state.bankroll + state.hands.reduce((sum, hand) => sum + hand.wager, 0) + state.insuranceBet).toBe(before);
}

describe('standard six-deck blackjack engine', () => {
  it('creates 312 uniquely identified cards, six copies of every rank/suit', () => {
    const shoe = createStandardShoe(() => .4);
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map(card => card.id)).size).toBe(312);
    const counts = new Map<string, number>();
    for (const card of shoe) counts.set(`${card.suit}-${card.rank}`, (counts.get(`${card.suit}-${card.rank}`) ?? 0) + 1);
    expect(counts.size).toBe(52);
    expect([...counts.values()].every(count => count === 6)).toBe(true);
  });

  it('rejects invalid initial chips/bets while restoring zero, odd and historical balances', () => {
    for (const initialBankroll of [0, 99, 101, 1_000_002, NaN, Infinity]) expect(() => initialStandardGame({ initialBankroll })).toThrow(RangeError);
    for (const bet of [0, 1, 3, 1_002, NaN, Infinity]) expect(() => initialStandardGame({ bet })).toThrow(RangeError);
    expect(initialStandardGame({ bankroll: 0 }).bankroll).toBe(0);
    expect(initialStandardGame({ bankroll: 1_009 }).bankroll).toBe(1_009);
    expect(initialStandardGame({ initialBankroll: 1_000, bet: 2_000, bankroll: 500 }).baseBet).toBe(2_000);
    expect(() => initialStandardGame({ bankroll: -1 })).toThrow(RangeError);
  });

  it('escrows the base bet exactly once and deals P,D,P,D with no source mutation', () => {
    const cards = deck('3', '4', '5', '6', '7');
    const before = initialStandardGame();
    let state = standardReducer(before, { type: 'START', deck: cards });
    expect(state.bankroll).toBe(980);
    expect(standardReducer(state, { type: 'START' })).toBe(state);
    expect(standardReducer(state, { type: 'CONFIGURE', initialBankroll: 2_000, bet: 40 })).toBe(state);
    for (let index = 0; index < 4; index++) state = standardReducer(state, { type: 'DEAL_STEP' });
    expect(state.hands[0].cards.map(card => card.rank)).toEqual(['3', '5']);
    expect(state.dealer.map(card => card.rank)).toEqual(['4', '6']);
    expect(cards).toHaveLength(5);
    expect(before.hands).toEqual([]);
    expect(state.phase).toBe('player');
    conservation(state, 1_000);
  });

  it('uses true 3:2 natural payout including integer odd profits', () => {
    const state = dealt(['A', '9', 'K', '8'], { initialBankroll: 100, bet: 6 });
    expect(state.phase).toBe('settled');
    expect(state.hands[0]).toMatchObject({ status: 'natural', outcome: 'win', profit: 9 });
    expect(state.bankroll).toBe(109);
    expect(state.net).toBe(9);
    conservation(state, 100);
  });

  it('peeks at ten-valued upcards before actions; equal naturals push', () => {
    const loss = dealt(['9', 'K', '9', 'A']);
    expect(loss.phase).toBe('settled');
    expect(loss.net).toBe(-20);
    expect(legalStandardActions(loss)).toEqual([]);
    const push = dealt(['A', '10', 'K', 'A']);
    expect(push.hands[0].outcome).toBe('push');
    expect(push.net).toBe(0);
    expect(push.bankroll).toBe(1_000);
  });

  it('offers insurance before the ace peek and pays net 2:1 exactly once', () => {
    let state = dealt(['9', 'A', '9', 'K'], { initialBankroll: 100, bet: 6 });
    expect(state.phase).toBe('insurance');
    expect(state.hidden).toBe(true);
    expect(state.bankroll).toBe(94);
    expect(standardObservation(state)?.negativePeek).toBe(false);
    state = act(state, 'insurance');
    expect(state.phase).toBe('settled');
    expect(state.insuranceBet).toBe(3);
    expect(state.insuranceProfit).toBe(6);
    expect(state.hands[0].profit).toBe(-6);
    expect(state.bankroll).toBe(100);
    expect(state.net).toBe(0);
    expect(act(state, 'insurance')).toBe(state);
    conservation(state, 100);
  });

  it('checks player natural after insurance, allowing natural push and insurance win together', () => {
    const state = act(dealt(['A', 'A', 'K', '10'], { initialBankroll: 100, bet: 6 }), 'insurance');
    expect(state.hands[0].outcome).toBe('push');
    expect(state.net).toBe(6);
    expect(state.bankroll).toBe(106);
    conservation(state, 100);
  });

  it('charges a losing insurance only once while the main hand still wins', () => {
    let state = act(dealt(['10', 'A', '8', '6'], { initialBankroll: 100, bet: 6 }), 'insurance');
    expect(state.phase).toBe('player');
    expect(state.bankroll).toBe(91);
    expect(state.insuranceProfit).toBe(-3);
    expect(standardObservation(state)?.negativePeek).toBe(true);
    state = finish(act(state, 'stand'));
    expect(state.dealer.map(card => card.rank)).toEqual(['A', '6']);
    expect(state.net).toBe(3);
    expect(state.bankroll).toBe(103);
    conservation(state, 100);
  });

  it('does not expose insurance, double or split if their extra wagers cannot be covered', () => {
    let state = dealt(['8', 'A', '8', '6'], { initialBankroll: 100, bet: 100 });
    expect(legalStandardActions(state)).toEqual(['declineInsurance']);
    expect(act(state, 'insurance')).toBe(state);
    state = act(state, 'declineInsurance');
    expect(legalStandardActions(state)).toEqual(['hit', 'stand', 'surrender']);
    expect(act(state, 'double')).toBe(state);
    expect(act(state, 'split')).toBe(state);
    conservation(state, 100);
  });

  it('late surrender refunds half the original bet without forcing dealer draws', () => {
    const state = act(dealt(['10', '2', '6', '3']), 'surrender');
    expect(state.phase).toBe('settled');
    expect(state.hidden).toBe(false);
    expect(state.dealer).toHaveLength(2);
    expect(state.hands[0]).toMatchObject({ status: 'surrendered', outcome: 'surrender', profit: -10 });
    expect(state.bankroll).toBe(990);
    expect(act(state, 'surrender')).toBe(state);
    conservation(state, 1_000);
  });

  it('removes double, split and surrender after hitting and skips dealer drawing after all bust', () => {
    let state = act(dealt(['5', '2', '6', '3', '2', 'K']), 'hit');
    expect(legalStandardActions(state)).toEqual(['hit', 'stand']);
    expect(act(state, 'surrender')).toBe(state);
    state = act(state, 'hit');
    expect(state.phase).toBe('settled');
    expect(state.dealer).toHaveLength(2);
    expect(state.hands[0].status).toBe('bust');
    conservation(state, 1_000);
  });

  it('doubles on initial two cards, draws exactly once and doubles the financial result', () => {
    let state = act(dealt(['5', '10', '6', '7', '10', '2']), 'double');
    expect(state.phase).toBe('dealer');
    expect(state.hands[0]).toMatchObject({ wager: 40, status: 'stood' });
    expect(state.hands[0].cards).toHaveLength(3);
    expect(state.bankroll).toBe(960);
    conservation(state, 1_000);
    state = finish(state);
    expect(state.net).toBe(40);
    expect(state.bankroll).toBe(1_040);
    expect(state.deck).toHaveLength(1);
    conservation(state, 1_000);
  });

  it('permits equal point-value face cards to split, sequentially plays hands and allows DAS', () => {
    let state = act(dealt(['K', '10', 'Q', '7', '2', '8', '9']), 'split');
    expect(state.hands.map(hand => hand.cards.map(card => card.rank))).toEqual([['K', '2'], ['Q', '8']]);
    expect(state.hands.map(hand => hand.id)).toEqual([0, 1]);
    expect(state.activeHand).toBe(0);
    expect(legalStandardActions(state)).toContain('double');
    expect(legalStandardActions(state)).not.toContain('surrender');
    state = act(state, 'double');
    expect(state.hands[0]).toMatchObject({ wager: 40, status: 'stood' });
    expect(state.activeHand).toBe(1);
    state = finish(act(state, 'stand'));
    expect(state.hands.map(hand => hand.profit)).toEqual([40, 20]);
    expect(state.net).toBe(60);
    conservation(state, 1_000);
  });

  it('caps repeated splits at four hands and preserves unique hand identity', () => {
    let state = dealt(['8', '10', '8', '7', '8', '8', '8', '8', '8', '8']);
    for (let count = 0; count < 3; count++) state = act(state, 'split');
    expect(state.hands).toHaveLength(4);
    expect(new Set(state.hands.map(hand => hand.id)).size).toBe(4);
    expect(legalStandardActions(state)).not.toContain('split');
    expect(act(state, 'split')).toBe(state);
    conservation(state, 1_000);
    for (let count = 0; state.phase === 'player' && count < 4; count++) state = act(state, 'stand');
    conservation(finish(state), 1_000);
  });

  it('split aces get exactly one card each, cannot resplit, and 21 pays only 1:1', () => {
    let state = act(dealt(['A', '10', 'A', '7', '10', 'A', '9']), 'split');
    expect(state.phase).toBe('dealer');
    expect(state.hands.every(hand => hand.splitAces && hand.fromSplit && hand.status === 'stood')).toBe(true);
    expect(state.hands[0].status).not.toBe('natural');
    expect(legalStandardActions(state)).toEqual([]);
    expect(act(state, 'hit')).toBe(state);
    state = finish(state);
    expect(state.hands[0].profit).toBe(20);
    expect(state.hands[1].profit).toBe(-20);
    expect(state.deck).toHaveLength(1);
    conservation(state, 1_000);
  });

  it('non-ace split 21 automatically stands but is never a natural', () => {
    let state = act(dealt(['K', '9', 'Q', '8', 'A', '2']), 'split');
    expect(state.hands[0]).toMatchObject({ status: 'stood', fromSplit: true });
    expect(state.activeHand).toBe(1);
    state = finish(act(state, 'stand'));
    expect(state.hands[0].profit).toBe(20);
    conservation(state, 1_000);
  });

  it('dealer obeys S17 regardless of player terminal values', () => {
    for (const player of [['10', '8'], ['10', '5']]) {
      const afterInsurance = act(dealt([player[0], 'A', player[1], '6', 'K']), 'declineInsurance');
      const state = finish(act(afterInsurance, 'stand'));
      expect(state.dealer.map(card => card.rank)).toEqual(['A', '6']);
      expect(handValue(state.dealer)).toEqual({ total: 17, soft: true });
      expect(state.deck).toHaveLength(1);
    }
    const drawn = finish(act(dealt(['10', '6', '8', '10', '2']), 'stand'));
    expect(drawn.dealer.map(card => card.rank)).toEqual(['6', '10', '2']);
    expect(drawn.net).toBe(0);
  });

  it.each(['dealing', 'hit', 'double', 'split', 'dealer', 'insured'] as const)('fully refunds an exhausted deck during %s', (stage) => {
    let state: StandardState;
    if (stage === 'dealing') state = dealt(['8', '10']);
    else if (stage === 'hit') state = act(dealt(['8', '10', '8', '7']), 'hit');
    else if (stage === 'double') state = act(dealt(['5', '10', '6', '7']), 'double');
    else if (stage === 'split') state = act(dealt(['8', '10', '8', '7', '8']), 'split');
    else if (stage === 'dealer') state = finish(act(dealt(['10', '2', '8', '3']), 'stand'));
    else state = finish(act(act(dealt(['10', 'A', '8', '4']), 'insurance'), 'stand'));
    expect(state.phase).toBe('settled');
    expect(state.reason).toContain('作废');
    expect(state.bankroll).toBe(1_000);
    expect(state.net).toBe(0);
    expect(state.insuranceProfit).toBe(0);
    expect(state.hands.every(hand => hand.profit === 0)).toBe(true);
    conservation(state, 1_000);
  });

  it('public observations are independent copies, include every visible hand, and never reveal hole/deck', () => {
    const one = dealt(['8', '10', '8', '7', '3', '4', '2']);
    const other = { ...one, dealer: [one.dealer[0], deck('A')[0]], deck: deck('K', 'K', 'A') };
    expect(standardObservation(one)).toEqual(standardObservation(other));
    const snapshot = standardObservation(one)!;
    expect(snapshot.visibleCards.map(card => card.rank)).toEqual(['8', '8', '10']);
    expect(snapshot.negativePeek).toBe(true);
    expect(Object.keys(snapshot)).not.toContain('deck');
    expect(Object.keys(snapshot)).not.toContain('dealer');
    snapshot.cards[0].rank = 'A';
    snapshot.visibleCards[0].rank = 'K';
    expect(one.hands[0].cards[0].rank).toBe('8');
    const split = act(one, 'split');
    expect(standardObservation(split)?.visibleCards).toHaveLength(5);
    expect(standardObservation(initialStandardGame())).toBeNull();
    expect(standardObservation(finish(act(one, 'stand')))).toBeNull();
  });

  it('rejects malformed decks and phase-invalid actions without altering chips', () => {
    const state = initialStandardGame();
    const duplicate = deck('8', '8'); duplicate[1].id = duplicate[0].id;
    expect(standardReducer(state, { type: 'START', deck: duplicate })).toBe(state);
    expect(standardReducer(state, { type: 'START', deck: deck('invalid') })).toBe(state);
    expect(act(state, 'stand')).toBe(state);
    expect(standardReducer(state, { type: 'DEALER_STEP' })).toBe(state);
    expect(standardReducer(state, { type: 'DEAL_STEP' })).toBe(state);
  });

  it('updates only the next bet, permits affordable even bets from odd balances, and rebuilds chips explicitly', () => {
    let state = dealt(['A', '9', 'K', '8'], { initialBankroll: 100, bet: 6 });
    const round = state.round;
    state = standardReducer(state, { type: 'SET_BET', bet: 108 });
    expect(state.bankroll).toBe(109);
    expect(state.round).toBe(round);
    expect(state.baseBet).toBe(108);
    for (const bet of [0, 1, 3, 110, NaN]) expect(standardReducer(state, { type: 'SET_BET', bet })).toBe(state);
    state = standardReducer(state, { type: 'START', deck: deck('10', '10', '9', '8') });
    expect(standardReducer(state, { type: 'SET_BET', bet: 2 })).toBe(state);
    for (let count = 0; count < 4; count++) state = standardReducer(state, { type: 'DEAL_STEP' });
    state = finish(act(state, 'stand'));
    state = standardReducer(state, { type: 'CONFIGURE', initialBankroll: 200, bet: 10 });
    expect(state.phase).toBe('ready'); expect(state.bankroll).toBe(200); expect(state.baseBet).toBe(10); expect(state.round).toBe(round + 1);
  });

  it('preserves integer escrow and exact settled net through 200 deterministic mixed-action rounds', () => {
    let seed = 87_421;
    const rng = () => { seed = (seed * 16_807) % 2_147_483_647; return seed / 2_147_483_647; };
    let state = initialStandardGame({ initialBankroll: 100_000, bet: 20 });
    for (let round = 0; round < 200; round++) {
      const before = state.bankroll;
      state = standardReducer(state, { type: 'START', deck: createStandardShoe(rng) });
      for (let tick = 0; state.phase !== 'settled' && tick < 100; tick++) {
        if (state.phase === 'dealing') state = standardReducer(state, { type: 'DEAL_STEP' });
        else if (state.phase === 'dealer') state = standardReducer(state, { type: 'DEALER_STEP' });
        else {
          const legal = legalStandardActions(state);
          const action = legal[Math.floor(rng() * legal.length)];
          state = act(state, action);
        }
        conservation(state, before);
      }
      expect(state.phase).toBe('settled');
      expect(state.net).toBe(state.hands.reduce((sum, hand) => sum + hand.profit, 0) + state.insuranceProfit);
      const repeated = standardReducer(state, { type: 'DEALER_STEP' });
      expect(repeated).toBe(state);
    }
  });
});
