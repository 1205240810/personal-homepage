// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.
import type { Card } from './engine';

export type Mode = 'classic' | 'strategic';
export type Method = 'exact-finite' | 'replacement-model';
export interface CoachSnapshot {
  playerCards: Card[];
  dealerUpcard: Card;
  mode: Mode;
  negativePeek: true;
}
export interface SolverOptions { maxNodes?: number; maxMs?: number }
export interface SolverResult {
  recommendation: 'hit' | 'stand';
  hitEV: number;
  standEV: number;
  bustProbability: number;
  gap: number;
  method: Method;
  nodes: number;
  fallbackReason?: 'node-cap' | 'time-cap';
  terminal?: boolean;
}
export const FULL_COUNTS = [4, 4, 4, 4, 4, 4, 4, 4, 4, 16] as const;
const PROBS = FULL_COUNTS.map(n => n / 52);
type Hand = { raw: number; ace: boolean };
function rank(card: Card): number {
  const i = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].indexOf(card.rank);
  if (i < 0) throw new Error('Invalid card rank');
  return Math.min(i, 9);
}
function add(h: Hand, r: number): Hand { return { raw: h.raw + r + 1, ace: h.ace || r === 0 }; }
function hand(cards: Card[]): Hand { return cards.reduce<Hand>((h, c) => add(h, rank(c)), { raw: 0, ace: false }); }
function total(h: Hand): number { return h.raw + (h.ace && h.raw <= 11 ? 10 : 0); }
function sum(c: readonly number[]): number { return c.reduce((a, b) => a + b, 0); }
function checkedCounts(c: readonly number[]): number[] {
  if (c.length !== 10 || c.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('Expected ten nonnegative integer rank counts');
  return [...c];
}
function remove(c: readonly number[], r: number): number[] {
  const next = [...c];
  if (next[r] <= 0) throw new Error('Card counts are inconsistent');
  next[r]--; return next;
}
function allowed(up: number, r: number): boolean { return !(up === 0 && r === 9 || up === 9 && r === 0); }
/** Counts include the hidden hole and undealt shoe. No hidden card identity is accepted. */
export function holePosterior(counts: readonly number[], dealerUpcard: Card): number[] {
  const c = checkedCounts(counts), up = rank(dealerUpcard);
  const weights = c.map((n, r) => allowed(up, r) ? n : 0), e = sum(weights);
  if (!e) throw new Error('No hole card is consistent with the negative peek');
  return weights.map(n => n / e);
}
export function playerDrawProbabilities(counts: readonly number[], dealerUpcard: Card): number[] {
  const posterior = holePosterior(counts, dealerUpcard), n = sum(counts);
  return n <= 1 ? counts.map(() => 0) : counts.map((v, r) => (v - posterior[r]) / (n - 1));
}
class Limit extends Error { constructor(public reason: 'node-cap' | 'time-cap') { super(reason); } }
class Budget {
  nodes = 0; start = performance.now();
  constructor(private options: SolverOptions, private limited: boolean) {}
  visit() {
    this.nodes++;
    if (!this.limited) return;
    if (this.nodes > (this.options.maxNodes ?? 100000)) throw new Limit('node-cap');
    if (performance.now() - this.start > (this.options.maxMs ?? 1000)) throw new Limit('time-cap');
  }
}
const payoff = (dealer: number, player: number): number => dealer > 21 ? -1 : Math.sign(dealer - player);
function dealerSolver(mode: Mode, finite: boolean, budget: Budget) {
  const memo = new Map<string, number>();
  function actions(h: Hand, target: number, c: readonly number[]): { hit: number; stand: number } {
    const t = total(h), stand = payoff(t, target), n = sum(c);
    if (t > 21 || finite && n === 0) return { hit: stand, stand };
    let hit = 0;
    for (let r = 0; r < 10; r++) {
      const p = finite ? c[r] / n : PROBS[r];
      if (p) hit += p * value(add(h, r), target, finite ? remove(c, r) : c);
    }
    return { hit, stand };
  }
  function value(h: Hand, target: number, c: readonly number[]): number {
    const t = total(h);
    if (t > 21) return -1;
    // A guaranteed win is already the maximum utility; do not expand dominated continuations.
    if (mode === 'strategic' && (t > target || t === 21)) return payoff(t, target);
    if (mode === 'classic' && t >= 17) return payoff(t, target);
    const key = `${h.raw}:${+h.ace}:${target}:${finite ? c.join(',') : ''}`;
    const known = memo.get(key); if (known !== undefined) return known;
    budget.visit();
    const a = actions(h, target, c);
    const v = mode === 'classic' ? a.hit : Math.max(a.hit, a.stand);
    memo.set(key, v); return v;
  }
  return { value, actions };
}
function result(hitEV: number, standEV: number, bustProbability: number, method: Method, nodes: number, terminal = false): SolverResult {
  return { recommendation: hitEV > standEV + 1e-12 ? 'hit' : 'stand', hitEV, standEV, bustProbability,
    gap: Math.abs(hitEV - standEV), method, nodes, ...(terminal ? { terminal: true } : {}) };
}
function solveCoach(snapshot: CoachSnapshot, counts: number[], finite: boolean, budget: Budget): SolverResult {
  const { playerCards, dealerUpcard, mode } = snapshot;
  const initial = hand(playerCards), up = rank(dealerUpcard), dealer = dealerSolver(mode, finite, budget);
  const method: Method = finite ? 'exact-finite' : 'replacement-model';
  // Naturals settle at the peek; all other results are ordinary +1/0/-1.
  if (total(initial) > 21) return result(-1, -1, 1, method, budget.nodes, true);
  if (playerCards.length === 2 && total(initial) === 21) return result(1, 1, 0, method, budget.nodes, true);
  const memo = new Map<string, number>();
  const replacementHole = holePosterior(FULL_COUNTS, dealerUpcard);
  function evaluate(h: Hand, c: readonly number[], standOnly = false): { hit: number; stand: number; bust: number } {
    budget.visit();
    const holes = finite ? holePosterior(c, dealerUpcard) : replacementHole;
    let stand = 0;
    for (let r = 0; r < 10; r++) if (holes[r]) {
      stand -= holes[r] * dealer.value(add(add({ raw: 0, ace: false }, up), r), total(h), finite ? remove(c, r) : c);
    }
    if (standOnly || finite && sum(c) === 1) return { hit: stand, stand, bust: 0 };
    const draws = finite ? playerDrawProbabilities(c, dealerUpcard) : PROBS;
    let hit = 0, bust = 0;
    for (let r = 0; r < 10; r++) if (draws[r]) {
      const next = add(h, r);
      if (total(next) > 21) { hit -= draws[r]; bust += draws[r]; }
      else hit += draws[r] * value(next, finite ? remove(c, r) : c);
    }
    return { hit, stand, bust };
  }
  function value(h: Hand, c: readonly number[]): number {
    const key = `${h.raw}:${+h.ace}:${finite ? c.join(',') : ''}`;
    const known = memo.get(key); if (known !== undefined) return known;
    const a = evaluate(h, c, total(h) === 21), v = Math.max(a.hit, a.stand); memo.set(key, v); return v;
  }
  const terminal = total(initial) === 21;
  const a = evaluate(initial, counts, terminal);
  return result(a.hit, a.stand, a.bust, method, budget.nodes, terminal);
}
function withFallback(run: (finite: boolean, budget: Budget) => SolverResult, options: SolverOptions): SolverResult {
  const budget = new Budget(options, true);
  try { return run(true, budget); }
  catch (e) {
    if (!(e instanceof Limit)) throw e;
    // Never mix a partial finite computation with replacement EVs.
    const fallback = new Budget(options, false), answer = run(false, fallback);
    return { ...answer, nodes: budget.nodes + fallback.nodes, fallbackReason: e.reason };
  }
}
/** Production API intentionally rebuilds counts using public cards alone. Extra fields are ignored. */
export function coach(snapshot: CoachSnapshot, options: SolverOptions = {}): SolverResult {
  let counts: number[] = [...FULL_COUNTS];
  for (const card of [...snapshot.playerCards, snapshot.dealerUpcard]) counts = remove(counts, rank(card));
  return coachWithCounts(snapshot, counts, options);
}
/** Oracle/testing API: counts still include the unknown dealer hole. */
export function coachWithCounts(snapshot: CoachSnapshot, counts: readonly number[], options: SolverOptions = {}): SolverResult {
  if (snapshot.negativePeek !== true) throw new Error('Coach requires a completed negative natural peek');
  if (snapshot.mode !== 'classic' && snapshot.mode !== 'strategic') throw new Error('Invalid mode');
  const c = checkedCounts(counts); holePosterior(c, snapshot.dealerUpcard);
  return withFallback((finite, budget) => solveCoach(snapshot, c, finite, budget), options);
}
export interface StrategicDealerInput { ownCards: Card[]; playerCards: Card[]; remainingCounts: readonly number[] }
/** Dealer EVs are from the dealer's perspective; only counts, never future order, are used. */
export function strategicDealer(input: StrategicDealerInput, options: SolverOptions = {}): SolverResult & { action: 'hit' | 'stand' } {
  const counts = checkedCounts(input.remainingCounts), h = hand(input.ownCards), target = total(hand(input.playerCards));
  const answer = withFallback((finite, budget) => {
    const method: Method = finite ? 'exact-finite' : 'replacement-model';
    const ownNatural = input.ownCards.length === 2 && total(h) === 21;
    const playerNatural = input.playerCards.length === 2 && target === 21;
    if (ownNatural || playerNatural) {
      const ev = ownNatural === playerNatural ? 0 : ownNatural ? 1 : -1;
      return result(ev, ev, 0, method, 0, true);
    }
    if (target > 21 || total(h) > 21) return result(target > 21 ? 1 : -1, target > 21 ? 1 : -1, 0, method, 0, true);
    const a = dealerSolver('strategic', finite, budget).actions(h, target, counts);
    const n = sum(counts);
    const bust = Array.from({ length: 10 }, (_, r) => total(add(h, r)) > 21 ? (finite ? n ? counts[r] / n : 0 : PROBS[r]) : 0).reduce((x, y) => x + y, 0);
    return result(a.hit, a.stand, bust, method, budget.nodes);
  }, options);
  return { ...answer, action: answer.recommendation };
}
