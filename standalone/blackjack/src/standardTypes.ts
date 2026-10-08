import type { Card } from './engine';

export const STANDARD_RULES = {
  decks: 6,
  soft17: 'stand',
  blackjackPayout: 1.5,
  doubleAfterSplit: true,
  maxHands: 4,
  resplitAces: false,
  splitAcesOneCard: true,
  lateSurrender: true,
  dealerPeek: true,
} as const;

export type StandardAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance' | 'declineInsurance';
export type StandardPhase = 'ready' | 'dealing' | 'insurance' | 'player' | 'dealer' | 'settled';
export interface StandardHand {
  id: number;
  cards: Card[];
  wager: number;
  fromSplit: boolean;
  splitAces: boolean;
  status: 'playing' | 'stood' | 'bust' | 'surrendered' | 'natural';
  outcome: 'win' | 'loss' | 'push' | 'surrender' | null;
  profit: number;
}
export interface StandardState {
  phase: StandardPhase;
  deck: Card[];
  hands: StandardHand[];
  activeHand: number;
  dealer: Card[];
  hidden: boolean;
  round: number;
  bankroll: number;
  initialBankroll: number;
  baseBet: number;
  insuranceBet: number;
  insuranceProfit: number;
  net: number;
  reason: string;
}
export type StandardEvent =
  | { type: 'CONFIGURE'; initialBankroll: number; bet: number }
  | { type: 'SET_BET'; bet: number }
  | { type: 'START'; deck?: Card[] }
  | { type: 'DEAL_STEP' | 'DEALER_STEP' }
  | { type: 'ACTION'; action: StandardAction };

/** Only public information at the decision time. No deck, seed or hole card. */
export interface StandardObservation {
  cards: Card[];
  dealerUpcard: Card;
  visibleCards: Card[];
  fromSplit: boolean;
  splitAces: boolean;
  handCount: number;
  availableChips: number;
  wager: number;
  negativePeek: boolean;
  legalActions: StandardAction[];
}
export interface StandardDecision {
  action: StandardAction;
  observation: StandardObservation;
  handId: number;
}
export interface StandardAdvice {
  bestAction: StandardAction;
  values: Partial<Record<StandardAction, number>>;
  method: string;
  explanation: string[];
  warnings: string[];
}
