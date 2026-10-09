import { GAMES, type GameId } from './catalog.ts';

// Browser-local "recently played" list for the game room. Only game IDs and
// visit times are stored; nothing leaves the browser.
export const RECENT_GAMES_KEY = 'tscjj:games:recent:v1';
export const MAX_RECENT = 4;
export type RecentGame = { id: GameId; at: number };

const IDS = new Set<string>(GAMES.map((game) => game.id));
export const isGameId = (value: unknown): value is GameId =>
  typeof value === 'string' && IDS.has(value);

/** Drops unknown, duplicate or malformed entries instead of rejecting the list. */
export function validateRecent(value: unknown): RecentGame[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: RecentGame[] = [];
  for (const item of value.slice(0, 50)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { id, at } = item as Record<string, unknown>;
    if (
      !isGameId(id) ||
      seen.has(id) ||
      typeof at !== 'number' ||
      !Number.isSafeInteger(at) ||
      at <= 0
    )
      continue;
    seen.add(id);
    list.push({ id, at });
  }
  return list.sort((a, b) => b.at - a.at).slice(0, MAX_RECENT);
}

export function pushRecent(
  list: readonly RecentGame[],
  id: GameId,
  now: number,
): RecentGame[] {
  return [{ id, at: now }, ...list.filter((item) => item.id !== id)].slice(
    0,
    MAX_RECENT,
  );
}

export function parseRecent(raw: string | null): RecentGame[] {
  if (!raw || raw.length > 10_000) return [];
  try {
    return validateRecent(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function readRecentRaw(storage?: Pick<Storage, 'getItem'>) {
  try {
    return (storage ?? window.localStorage).getItem(RECENT_GAMES_KEY);
  } catch {
    return null;
  }
}

/** Records a visit; storage failures are ignored (the list is a convenience). */
export function markRecent(
  id: GameId,
  now: number,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
) {
  try {
    const store = storage ?? window.localStorage;
    const next = pushRecent(
      parseRecent(store.getItem(RECENT_GAMES_KEY)),
      id,
      now,
    );
    store.setItem(RECENT_GAMES_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

/** Calendar-day distance in the visitor's local time zone. */
export function relativeDay(at: number, now: number) {
  const day = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const diff = Math.max(0, Math.round(day(now) - day(at)));
  return diff === 0 ? '今天' : diff === 1 ? '昨天' : `${diff} 天前`;
}
