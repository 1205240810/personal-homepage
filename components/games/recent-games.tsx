'use client';
/* oxlint-disable nextjs/no-html-link-for-pages -- Full-document navigation matches the game room cards. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { History } from 'lucide-react';
import { getGame, type GameId } from '@/lib/games/catalog';
import {
  RECENT_GAMES_KEY,
  markRecent,
  parseRecent,
  readRecentRaw,
  relativeDay,
} from '@/lib/games/recent';

/** Mount on a game page to remember the visit for the game room. */
export function RecentGameMark({ gameId }: { gameId: GameId }) {
  useEffect(() => {
    markRecent(gameId, Date.now());
  }, [gameId]);
  return null;
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === RECENT_GAMES_KEY) notify();
  };
  // pageshow covers returning through the back/forward cache.
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', notify);
  };
}
const serverSnapshot = () => null;

export function RecentGames({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  // The raw string is a stable snapshot; it is parsed during render.
  const raw = useSyncExternalStore(subscribe, readRecentRaw, serverSnapshot);
  const [now] = useState(() => Date.now());
  const recent = parseRecent(raw);
  if (!recent.length) return null;
  return (
    <section className="room-recent" aria-labelledby="room-recent-title">
      <h2 id="room-recent-title">
        <History size={15} strokeWidth={1.6} aria-hidden="true" />
        最近玩过
      </h2>
      <ul>
        {recent.map((item) => {
          const game = getGame(item.id);
          return (
            <li key={item.id}>
              <a href={`${game.href}${fromExplore ? '?from=explore' : ''}`}>
                <strong>{game.title}</strong>
                <span>{relativeDay(item.at, now)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
