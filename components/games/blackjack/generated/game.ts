// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.
import { createDeck, shuffle, handValue, isNatural, type Card } from './engine';

export type Mode = 'classic' | 'strategic';
export type Phase = 'ready' | 'dealing' | 'player' | 'dealer' | 'settled';
export type Action = 'hit' | 'stand';
export interface State {
  phase: Phase;
  deck: Card[];
  player: Card[];
  opponent: Card[];
  mode: Mode;
  round: number;
  outcome: 'win' | 'loss' | 'tie' | null;
  reason: string;
  hidden: boolean;
}
export type GameAction =
  | { type: 'START'; deck?: Card[] }
  | { type: 'DEAL_STEP' | 'HIT' | 'STAND' | 'RESET' }
  | { type: 'DEALER_ACT'; action: Action }
  | { type: 'SET_MODE'; mode: Mode };

export function initialGame(mode: Mode = 'classic'): State {
  return {
    phase: 'ready', deck: [], player: [], opponent: [], mode, round: 0,
    outcome: null, reason: '', hidden: true,
  };
}

function settle(state: State): State {
  const p = handValue(state.player).total;
  const d = handValue(state.opponent).total;
  let outcome: State['outcome'];
  let reason: string;
  if (p > 21) { outcome = 'loss'; reason = '你爆牌了，庄家获胜'; }
  else if (d > 21) { outcome = 'win'; reason = '庄家爆牌，你赢了'; }
  else if (isNatural(state.player) !== isNatural(state.opponent)) {
    outcome = isNatural(state.player) ? 'win' : 'loss';
    reason = outcome === 'win' ? '你的黑杰克获胜' : '庄家的黑杰克获胜';
  } else if (p === d) { outcome = 'tie'; reason = '双方点数相同，平局'; }
  else {
    outcome = p > d ? 'win' : 'loss';
    reason = outcome === 'win' ? '你的点数更高，你赢了' : '庄家的点数更高';
  }
  return { ...state, phase: 'settled', outcome, reason, hidden: false };
}

function exhausted(state: State): State {
  return { ...state, phase: 'settled', outcome: 'tie', reason: '牌堆已空，本局作废', hidden: false };
}

/** The deck is consumed strictly from the front, player first on every deal.
 * `hidden` is a rendering flag, not a security boundary: player-facing observations
 * must omit the hole card and deck. The strategic dealer acts only after reveal.
 */
export function gameReducer(state: State, event: GameAction): State {
  switch (event.type) {
    case 'RESET':
      return { ...initialGame(state.mode), round: state.round };
    case 'SET_MODE':
      if (state.phase !== 'ready' && state.phase !== 'settled') return state;
      if (event.mode !== 'classic' && event.mode !== 'strategic') return state;
      return { ...initialGame(event.mode), round: state.round };
    case 'START':
      if (state.phase !== 'ready' && state.phase !== 'settled') return state;
      return {
        ...initialGame(state.mode), phase: 'dealing', round: state.round + 1,
        deck: event.deck ? [...event.deck] : shuffle(createDeck()),
      };
    case 'DEAL_STEP': {
      if (state.phase !== 'dealing') return state;
      const card = state.deck[0];
      if (!card) return exhausted(state);
      const count = state.player.length + state.opponent.length;
      const toPlayer = count % 2 === 0;
      const next: State = {
        ...state, deck: state.deck.slice(1),
        player: toPlayer ? [...state.player, card] : state.player,
        opponent: toPlayer ? state.opponent : [...state.opponent, card],
      };
      if (count < 3) return next;
      if (isNatural(next.player) || isNatural(next.opponent)) return settle(next);
      return { ...next, phase: 'player' };
    }
    case 'HIT': {
      if (state.phase !== 'player') return state;
      const card = state.deck[0];
      if (!card) return exhausted(state);
      const next = { ...state, deck: state.deck.slice(1), player: [...state.player, card] };
      const total = handValue(next.player).total;
      if (total > 21) return settle(next);
      return total === 21 ? { ...next, phase: 'dealer', hidden: false } : next;
    }
    case 'STAND':
      return state.phase === 'player' ? { ...state, phase: 'dealer', hidden: false } : state;
    case 'DEALER_ACT': {
      if (state.phase !== 'dealer' || (event.action !== 'hit' && event.action !== 'stand')) return state;
      const action = state.mode === 'classic'
        ? (handValue(state.opponent).total < 17 ? 'hit' : 'stand')
        : event.action;
      if (action === 'stand') return settle(state);
      const card = state.deck[0];
      if (!card) return exhausted(state);
      const next = { ...state, deck: state.deck.slice(1), opponent: [...state.opponent, card] };
      return handValue(next.opponent).total >= 21 ? settle(next) : next;
    }
    default: return state;
  }
}
