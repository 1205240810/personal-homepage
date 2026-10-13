// Small shared helpers for the newer puzzle/sandbox games: seeded random,
// daily seeds and validated local records. Pure and framework-free.

export type Today = { year: number; month: number; day: number };

/** Deterministic 32-bit PRNG in [0, 1). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** FNV-1a hash of a string to an unsigned 32-bit seed. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export function dailyKey(t: Today) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
}
/** Seed for a game's daily puzzle; differs per game and per variant. */
export const dailySeed = (game: string, t: Today, variant = '') =>
  hashSeed(`${game}:${dailyKey(t)}:${variant}`);
export function todayParts(now = new Date()): Today {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}
export function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
export function loadJson<T>(
  key: string,
  validate: (value: unknown) => T | null,
  empty: () => T,
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): T {
  try {
    const raw = storage?.getItem(key);
    if (!raw || raw.length > 100_000) return empty();
    return validate(JSON.parse(raw)) ?? empty();
  } catch {
    return empty();
  }
}
export function saveJson(
  key: string,
  value: unknown,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): 'saved' | 'unavailable' {
  try {
    if (!storage) return 'unavailable';
    storage.setItem(key, JSON.stringify(value));
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export const isDateKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
