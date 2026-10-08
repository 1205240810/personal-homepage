// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.
import { createDeck, handValue, isNatural, shuffle, type Card } from './engine';
import { STANDARD_RULES, type StandardAction, type StandardEvent, type StandardHand, type StandardObservation, type StandardState } from './standardTypes';

const RANKS = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const SUITS = new Set(['spades', 'hearts', 'clubs', 'diamonds']);
const idle = (state: StandardState) => state.phase === 'ready' || state.phase === 'settled';
const evenInteger = (value: number) => Number.isSafeInteger(value) && value % 2 === 0;
const initialConfigValid = (initialBankroll: number, bet: number) =>
  evenInteger(initialBankroll) && initialBankroll >= 100 && initialBankroll <= 1_000_000
  && evenInteger(bet) && bet >= 2 && bet <= initialBankroll;
const point = (card: Card) => card.rank === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(card.rank) ? 10 : Number(card.rank);
const copyCard = (card: Card): Card => ({ id: card.id, rank: card.rank, suit: card.suit });

/** Six decks, fresh-shuffled each round. Each physical card has a distinct ID. */
export function createStandardShoe(rng: () => number = Math.random): Card[] {
  return shuffle(Array.from({ length: STANDARD_RULES.decks }, (_, deck) =>
    createDeck().map(card => ({ ...card, id: `deck-${deck}-${card.id}` }))).flat(), rng);
}

export function initialStandardGame(options: { initialBankroll?: number; bet?: number; bankroll?: number } = {}): StandardState {
  const initialBankroll = options.initialBankroll ?? 1_000;
  const bet = options.bet ?? 20;
  const bankroll = options.bankroll ?? initialBankroll;
  if (!evenInteger(initialBankroll) || initialBankroll < 100 || initialBankroll > 1_000_000
    || !evenInteger(bet) || bet < 2 || (options.bankroll === undefined && bet > initialBankroll)) {
    throw new RangeError('初始筹码须为 100–1,000,000 的偶整数，下注须为正偶整数；新练习的下注不得超过初始筹码。');
  }
  // 3:2 wins may make a settled balance odd or greater than its starting value.
  if (!Number.isSafeInteger(bankroll) || bankroll < 0) throw new RangeError('当前筹码须为非负安全整数。');
  return {
    phase: 'ready', deck: [], hands: [], activeHand: 0, dealer: [], hidden: true,
    round: 0, bankroll, initialBankroll, baseBet: bet, insuranceBet: 0,
    insuranceProfit: 0, net: 0, reason: '',
  };
}

function newHand(id: number, cards: Card[], wager: number, fromSplit = false, splitAces = false): StandardHand {
  return { id, cards, wager, fromSplit, splitAces, status: 'playing', outcome: null, profit: 0 };
}

export function legalStandardActions(state: StandardState): StandardAction[] {
  if (state.phase === 'insurance') return state.bankroll >= state.baseBet / 2
    ? ['insurance', 'declineInsurance'] : ['declineInsurance'];
  if (state.phase !== 'player') return [];
  const hand = state.hands[state.activeHand];
  if (!hand || hand.status !== 'playing' || hand.splitAces || handValue(hand.cards).total >= 21) return [];
  const legal: StandardAction[] = ['hit', 'stand'];
  if (hand.cards.length === 2) {
    if (state.bankroll >= hand.wager) legal.push('double');
    if (state.bankroll >= hand.wager && state.hands.length < STANDARD_RULES.maxHands
      && point(hand.cards[0]) === point(hand.cards[1])) legal.push('split');
    if (!hand.fromSplit) legal.push('surrender');
  }
  return legal;
}

/** No dealer hole card, future deck, RNG seed, or concealed identity is exposed. */
export function standardObservation(state: StandardState): StandardObservation | null {
  if (state.phase !== 'player' && state.phase !== 'insurance') return null;
  const hand = state.hands[state.activeHand];
  if (!hand || !state.dealer[0]) return null;
  return {
    cards: hand.cards.map(copyCard), dealerUpcard: copyCard(state.dealer[0]),
    visibleCards: [...state.hands.flatMap(item => item.cards), state.dealer[0]].map(copyCard),
    fromSplit: hand.fromSplit, splitAces: hand.splitAces, handCount: state.hands.length,
    availableChips: state.bankroll, wager: hand.wager,
    negativePeek: state.phase === 'player', legalActions: legalStandardActions(state),
  };
}

function settle(state: StandardState, dealerNatural = false): StandardState {
  const dealerTotal = handValue(state.dealer).total;
  const hands = state.hands.map((hand): StandardHand => {
    let outcome: StandardHand['outcome'];
    let profit: number;
    if (hand.status === 'surrendered') { outcome = 'surrender'; profit = -hand.wager / 2; }
    else if (hand.status === 'bust') { outcome = 'loss'; profit = -hand.wager; }
    else if (dealerNatural) {
      outcome = hand.status === 'natural' ? 'push' : 'loss';
      profit = outcome === 'push' ? 0 : -hand.wager;
    } else if (hand.status === 'natural') { outcome = 'win'; profit = hand.wager * STANDARD_RULES.blackjackPayout; }
    else {
      const total = handValue(hand.cards).total;
      outcome = dealerTotal > 21 || total > dealerTotal ? 'win' : total === dealerTotal ? 'push' : 'loss';
      profit = outcome === 'win' ? hand.wager : outcome === 'loss' ? -hand.wager : 0;
    }
    return { ...hand, outcome, profit };
  });
  const net = hands.reduce((sum, hand) => sum + hand.profit, 0) + state.insuranceProfit;
  const returned = hands.reduce((sum, hand) => sum + hand.wager + hand.profit, 0)
    + state.insuranceBet + state.insuranceProfit;
  const summaries = hands.map((hand, index) => `第 ${index + 1} 手${hand.outcome === 'win' ? '获胜' : hand.outcome === 'push' ? '平局' : hand.outcome === 'surrender' ? '投降退回半注' : '落败'}`);
  const reason = dealerNatural ? '庄家天然 21，已完成检查结算。'
    : hands.some(hand => hand.status === 'natural') ? '你的天然 21 按 3:2 支付。'
    : `${dealerTotal > 21 ? '庄家爆牌。' : ''}${summaries.join('；')}。`;
  return { ...state, hands, phase: 'settled', hidden: false, net, bankroll: state.bankroll + returned,
    reason: `${reason}${state.insuranceBet ? `保险净${state.insuranceProfit > 0 ? '赢' : '输'} ${Math.abs(state.insuranceProfit)}。` : ''}` };
}

/** An incomplete round is fully refunded, including any already-resolved insurance. */
function exhausted(state: StandardState): StandardState {
  return { ...state, phase: 'settled', hidden: false, net: 0, insuranceProfit: 0,
    bankroll: state.bankroll + state.hands.reduce((sum, hand) => sum + hand.wager, 0) + state.insuranceBet,
    hands: state.hands.map(hand => ({ ...hand, status: hand.status === 'playing' ? 'stood' : hand.status, outcome: 'push', profit: 0 })),
    reason: '牌堆已空，本局作废；全部下注与保险已退回。' };
}

function afterPeek(state: StandardState): StandardState {
  const natural = isNatural(state.dealer);
  const next = { ...state, insuranceProfit: state.insuranceBet ? natural ? state.insuranceBet * 2 : -state.insuranceBet : 0 };
  if (natural || state.hands[0].status === 'natural') return settle(next, natural);
  return { ...next, phase: 'player' };
}

function advance(state: StandardState): StandardState {
  const next = state.hands.findIndex((hand, index) => index >= state.activeHand && hand.status === 'playing');
  if (next >= 0) return { ...state, activeHand: next };
  const finished = { ...state, phase: 'dealer' as const, hidden: false };
  return state.hands.every(hand => hand.status === 'bust' || hand.status === 'surrendered') ? settle(finished) : finished;
}

function deckValid(deck: Card[]): boolean {
  if (!Array.isArray(deck)) return false;
  const ids = new Set<string>();
  return deck.every(card => {
    if (!card || typeof card.id !== 'string' || !card.id || !RANKS.has(card.rank) || !SUITS.has(card.suit) || ids.has(card.id)) return false;
    ids.add(card.id);
    return true;
  });
}

export function standardReducer(state: StandardState, event: StandardEvent): StandardState {
  switch (event.type) {
    case 'CONFIGURE':
      if (!idle(state) || !initialConfigValid(event.initialBankroll, event.bet)) return state;
      return { ...initialStandardGame({ initialBankroll: event.initialBankroll, bet: event.bet }), round: state.round };
    case 'SET_BET':
      if (!idle(state) || !evenInteger(event.bet) || event.bet < 2 || event.bet > state.bankroll) return state;
      return { ...state, baseBet: event.bet };
    case 'START': {
      if (!idle(state) || state.bankroll < state.baseBet) return state;
      const deck = event.deck ?? createStandardShoe();
      if (!deckValid(deck)) return state;
      return { ...state, phase: 'dealing', deck: deck.map(copyCard), hands: [newHand(0, [], state.baseBet)],
        activeHand: 0, dealer: [], hidden: true, round: state.round + 1,
        bankroll: state.bankroll - state.baseBet, insuranceBet: 0, insuranceProfit: 0, net: 0, reason: '' };
    }
    case 'DEAL_STEP': {
      if (state.phase !== 'dealing') return state;
      const card = state.deck[0];
      if (!card) return exhausted(state);
      const count = state.hands[0].cards.length + state.dealer.length;
      const hand = state.hands[0];
      const next: StandardState = { ...state, deck: state.deck.slice(1),
        hands: count % 2 === 0 ? [{ ...hand, cards: [...hand.cards, card] }] : state.hands,
        dealer: count % 2 === 1 ? [...state.dealer, card] : state.dealer };
      if (count < 3) return next;
      if (isNatural(next.hands[0].cards)) next.hands = [{ ...next.hands[0], status: 'natural' }];
      if (next.dealer[0].rank === 'A') return { ...next, phase: 'insurance' };
      return afterPeek(next);
    }
    case 'ACTION': {
      if (!legalStandardActions(state).includes(event.action)) return state;
      if (state.phase === 'insurance') {
        const insuranceBet = event.action === 'insurance' ? state.baseBet / 2 : 0;
        return afterPeek({ ...state, insuranceBet, bankroll: state.bankroll - insuranceBet });
      }
      const hand = state.hands[state.activeHand];
      const hands = [...state.hands];
      if (event.action === 'stand' || event.action === 'surrender') {
        hands[state.activeHand] = { ...hand, status: event.action === 'stand' ? 'stood' : 'surrendered' };
        return advance({ ...state, hands });
      }
      if (event.action === 'split') {
        const splitAces = hand.cards[0].rank === 'A';
        const secondId = Math.max(...state.hands.map(item => item.id)) + 1;
        const splitHands = [newHand(hand.id, [hand.cards[0]], hand.wager, true, splitAces), newHand(secondId, [hand.cards[1]], hand.wager, true, splitAces)];
        hands.splice(state.activeHand, 1, ...splitHands);
        const next = { ...state, hands, bankroll: state.bankroll - hand.wager };
        if (state.deck.length < 2) return exhausted(next);
        const dealt = splitHands.map((item, index): StandardHand => {
          const cards = [...item.cards, state.deck[index]];
          return { ...item, cards, status: splitAces || handValue(cards).total === 21 ? 'stood' : 'playing' };
        });
        hands.splice(state.activeHand, 2, ...dealt);
        return advance({ ...next, hands, deck: state.deck.slice(2) });
      }
      const doubled = event.action === 'double';
      const next = doubled ? { ...state, bankroll: state.bankroll - hand.wager } : state;
      const wager = doubled ? hand.wager * 2 : hand.wager;
      const card = state.deck[0];
      hands[state.activeHand] = { ...hand, wager };
      if (!card) return exhausted({ ...next, hands });
      const cards = [...hand.cards, card];
      const total = handValue(cards).total;
      hands[state.activeHand] = { ...hand, cards, wager, status: total > 21 ? 'bust' : doubled || total === 21 ? 'stood' : 'playing' };
      return advance({ ...next, hands, deck: state.deck.slice(1) });
    }
    case 'DEALER_STEP': {
      if (state.phase !== 'dealer') return state;
      if (handValue(state.dealer).total >= 17) return settle(state);
      const card = state.deck[0];
      if (!card) return exhausted(state);
      const next = { ...state, dealer: [...state.dealer, card], deck: state.deck.slice(1) };
      return handValue(next.dealer).total >= 17 ? settle(next) : next;
    }
    default: return state;
  }
}
