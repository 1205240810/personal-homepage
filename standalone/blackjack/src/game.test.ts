import { describe, expect, it } from 'vitest';
import { gameReducer as reduce, initialGame, type State, type GameAction } from './game';
import { type Card, handValue } from './engine';

const cards = (...ranks: string[]): Card[] => ranks.map((rank, i) => ({ id: `${i}-${rank}`, rank, suit: 'hearts' }));
function deal(ranks: string[], previous = initialGame()): State {
  let state = reduce(previous, { type: 'START', deck: cards(...ranks) });
  for (let i = 0; i < 4; i++) state = reduce(state, { type: 'DEAL_STEP' });
  return state;
}
const stand = (state: State) => reduce(state, { type: 'STAND' });
const dealer = (state: State, action: 'hit' | 'stand' = 'stand') => reduce(state, { type: 'DEALER_ACT', action });

describe('two-mode sequential blackjack', () => {
  it('defaults to classic and deals player first on every round without mutating input', () => {
    const deck = cards('2','3','4','5','6');
    let state = reduce(initialGame(), { type: 'START', deck });
    expect(state.mode).toBe('classic');
    for (let i = 0; i < 4; i++) state = reduce(state, { type: 'DEAL_STEP' });
    expect(state.player.map(c => c.rank)).toEqual(['2','4']);
    expect(state.opponent.map(c => c.rank)).toEqual(['3','5']);
    expect(state.phase).toBe('player');
    expect(state.hidden).toBe(true);
    expect(deck).toHaveLength(5);
    const next = deal(['7','8','9','10'], reduce(state, { type: 'RESET' }));
    expect(next.round).toBe(2);
    expect(next.player.map(c => c.rank)).toEqual(['7','9']);
  });

  it.each([
    [['A','5','K','6','10'], 'win'],
    [['5','A','6','K','10'], 'loss'],
    [['A','A','K','Q','10'], 'tie'],
  ])('peeks and settles opening naturals %j as %s only after fourth card', (ranks, outcome) => {
    let state = reduce(initialGame(), { type: 'START', deck: cards(...ranks) });
    for (let i = 0; i < 3; i++) state = reduce(state, { type: 'DEAL_STEP' });
    expect(state.phase).toBe('dealing');
    expect(state.outcome).toBeNull();
    state = reduce(state, { type: 'DEAL_STEP' });
    expect(state).toMatchObject({ phase: 'settled', outcome, hidden: false });
    expect(state.deck).toHaveLength(1);
  });

  it('settles player bust immediately without giving dealer a draw', () => {
    const state = reduce(deal(['10','10','8','6','K','9']), { type: 'HIT' });
    expect(state).toMatchObject({ phase: 'settled', outcome: 'loss', hidden: false });
    expect(state.opponent).toHaveLength(2);
    expect(state.deck.map(c => c.rank)).toEqual(['9']);
    expect(dealer(state, 'hit')).toBe(state);
  });

  it('keeps ordinary player hits hidden and auto-reveals at 21', () => {
    let state = deal(['5','10','6','6','2','8','5']);
    state = reduce(state, { type: 'HIT' });
    expect(state).toMatchObject({ phase: 'player', hidden: true, outcome: null });
    state = reduce(state, { type: 'HIT' });
    expect(state).toMatchObject({ phase: 'dealer', hidden: false, outcome: null });
    expect(handValue(state.player).total).toBe(21);
    state = dealer(state, 'hit');
    expect(state).toMatchObject({ phase: 'settled', outcome: 'tie' });
  });

  it('reveals after stand and dealer bust is an immediate player win', () => {
    const state = stand(deal(['10','10','8','6','K']));
    expect(state).toMatchObject({ phase: 'dealer', hidden: false });
    expect(dealer(state, 'hit')).toMatchObject({ phase: 'settled', outcome: 'win' });
  });

  it.each([
    [['10','10','8','7'], 'win'],
    [['10','10','7','8'], 'loss'],
    [['10','10','8','8'], 'tie'],
  ])('compares standing totals %j as %s', (ranks, outcome) => {
    expect(dealer(stand(deal(ranks))).outcome).toBe(outcome);
  });

  it('classic normalizes caller choices: hit below 17, stand on soft 17', () => {
    const low = dealer(stand(deal(['10','2','8','4','10','K'])), 'stand');
    expect(low.phase).toBe('dealer');
    expect(handValue(low.opponent).total).toBe(16);
    expect(dealer(low, 'stand').outcome).toBe('win');
    const soft = stand(deal(['10','A','8','6','K']));
    const result = dealer(soft, 'hit');
    expect(handValue(result.opponent)).toEqual({ total: 17, soft: true });
    expect(result).toMatchObject({ phase: 'settled', outcome: 'win' });
    expect(result.deck).toEqual(soft.deck);
  });

  it('strategic dealer can stand below 17 or hit above it', () => {
    const low = stand(deal(['10','2','8','4','10'], initialGame('strategic')));
    expect(dealer(low)).toMatchObject({ phase: 'settled', outcome: 'win' });
    const high = stand(deal(['10','10','9','8','2'], initialGame('strategic')));
    const hit = dealer(high, 'hit');
    expect(handValue(hit.opponent).total).toBe(20);
    expect(hit.phase).toBe('dealer');
    expect(dealer(hit).outcome).toBe('loss');
  });

  it('handles multiple aces and soft-to-hard transitions for both sides', () => {
    let state = deal(['A','A','A','5','9','10','10']);
    expect(handValue(state.player)).toEqual({ total: 12, soft: true });
    state = reduce(state, { type: 'HIT' });
    expect(handValue(state.player)).toEqual({ total: 21, soft: true });
    state = dealer(state, 'hit');
    expect(handValue(state.opponent)).toEqual({ total: 16, soft: false });
    expect(dealer(state, 'hit').outcome).toBe('win');
  });

  it('guards empty decks on deal, player hit, and dealer hit', () => {
    for (const state of [deal([]), reduce(deal(['2','3','4','5']), { type: 'HIT' }), dealer(stand(deal(['2','3','4','5'])), 'hit')]) {
      expect(state).toMatchObject({ phase: 'settled', outcome: 'tie', hidden: false });
      expect(state.reason).toContain('牌堆已空');
    }
  });

  it('ignores out-of-phase and post-settlement duplicate actions', () => {
    const ready = initialGame();
    const inactive: GameAction[] = [{ type: 'HIT' }, { type: 'STAND' }, { type: 'DEAL_STEP' }, { type: 'DEALER_ACT', action: 'hit' }];
    for (const event of inactive) expect(reduce(ready, event)).toBe(ready);
    const player = deal(['10','10','8','7','2']);
    for (const event of [{ type: 'START' }, { type: 'DEAL_STEP' }, { type: 'DEALER_ACT', action: 'stand' }] as GameAction[]) expect(reduce(player, event)).toBe(player);
    const revealing = stand(player);
    expect(stand(revealing)).toBe(revealing);
    expect(reduce(revealing, { type: 'HIT' })).toBe(revealing);
    const settled = dealer(revealing);
    for (const event of inactive) expect(reduce(settled, event)).toBe(settled);
  });

  it('switches mode only when inactive and clears prior round state', () => {
    const ready = reduce(initialGame(), { type: 'SET_MODE', mode: 'strategic' });
    expect(ready).toEqual(initialGame('strategic'));
    const dealing = reduce(ready, { type: 'START', deck: cards('10','10','8','7') });
    expect(reduce(dealing, { type: 'SET_MODE', mode: 'classic' })).toBe(dealing);
    const player = deal(['10','10','8','7'], ready);
    const revealing = stand(player);
    for (const state of [player, revealing]) expect(reduce(state, { type: 'SET_MODE', mode: 'classic' })).toBe(state);
    const switched = reduce(dealer(revealing), { type: 'SET_MODE', mode: 'classic' });
    expect(switched).toEqual({ ...initialGame(), round: 1 });
  });

  it('reset cleans every phase while retaining selected mode and monotonic round', () => {
    const player = deal(['10','10','8','7'], initialGame('strategic'));
    for (const state of [player, stand(player), dealer(stand(player))]) {
      const reset = reduce(state, { type: 'RESET' });
      expect(reset).toEqual({ ...initialGame('strategic'), round: 1 });
      const started = reduce(reset, { type: 'START' });
      expect(started.round).toBe(2);
      expect(started.deck).toHaveLength(52);
      expect(new Set(started.deck.map(c => c.id)).size).toBe(52);
    }
  });
});
