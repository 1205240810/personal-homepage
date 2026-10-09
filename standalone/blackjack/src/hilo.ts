import { createDeck, shuffle, type Card } from './engine';

/** Hi-Lo tag: 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1. */
export function hiLoValue(rank: string): -1 | 0 | 1 {
  if (['2', '3', '4', '5', '6'].includes(rank)) return 1;
  if (['7', '8', '9'].includes(rank)) return 0;
  return -1;
}

export function runningCount(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + hiLoValue(card.rank), 0);
}

export const HILO_DECKS = [1, 2, 6] as const;
export type HiLoDecks = (typeof HILO_DECKS)[number];
export const HILO_SPEEDS = [
  { id: 'manual', label: '手动翻牌', ms: 0 },
  { id: 'slow', label: '慢 · 1.5 秒', ms: 1500 },
  { id: 'medium', label: '中 · 0.9 秒', ms: 900 },
  { id: 'fast', label: '快 · 0.5 秒', ms: 500 },
] as const;
export type HiLoSpeed = (typeof HILO_SPEEDS)[number]['id'];
export const HILO_ROUND_SIZES = [10, 20, 30] as const;

export function createShoe(decks: HiLoDecks, rng: () => number = Math.random): Card[] {
  return shuffle(
    Array.from({ length: decks }, (_, deck) =>
      createDeck().map((card) => ({ ...card, id: `${deck}-${card.id}` })),
    ).flat(),
    rng,
  );
}

/**
 * True count = running count ÷ decks remaining, with the remaining decks
 * estimated to the nearest half deck (minimum half a deck), as at a real table.
 */
export function trueCount(running: number, cardsRemaining: number): number {
  const decks = Math.max(0.5, Math.round((cardsRemaining / 52) * 2) / 2);
  return Math.round((running / decks) * 10) / 10;
}

export function remainingDecksLabel(cardsRemaining: number): string {
  const decks = Math.max(0.5, Math.round((cardsRemaining / 52) * 2) / 2);
  return `${decks}`;
}

export const HILO_KEY = 'twenty-one:hilo:v1';
export type HiLoRecord = { rounds: number; correct: number; bestStreak: number; streak: number };
export const emptyHiLoRecord = (): HiLoRecord => ({ rounds: 0, correct: 0, bestStreak: 0, streak: 0 });

const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 10_000_000;

export function readHiLoRecord(storage?: Pick<Storage, 'getItem'>): HiLoRecord {
  try {
    const source = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const value: unknown = JSON.parse(source?.getItem(HILO_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return emptyHiLoRecord();
    const r = value as Record<string, unknown>;
    if (![r.rounds, r.correct, r.bestStreak, r.streak].every(count)) return emptyHiLoRecord();
    const rec = r as unknown as HiLoRecord;
    if (rec.correct > rec.rounds || rec.streak > rec.bestStreak || rec.bestStreak > rec.correct) return emptyHiLoRecord();
    return { rounds: rec.rounds, correct: rec.correct, bestStreak: rec.bestStreak, streak: rec.streak };
  } catch {
    return emptyHiLoRecord();
  }
}

export function saveHiLoRecord(record: HiLoRecord, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.setItem(HILO_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function scoreHiLo(record: HiLoRecord, correct: boolean): HiLoRecord {
  const streak = correct ? record.streak + 1 : 0;
  return {
    rounds: record.rounds + 1,
    correct: record.correct + (correct ? 1 : 0),
    streak,
    bestStreak: Math.max(record.bestStreak, streak),
  };
}
