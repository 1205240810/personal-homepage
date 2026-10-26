'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  PlayClient,
  browserTokens,
  type PlaySnapshot,
} from '@/lib/multiplayer/client';

const IDLE: PlaySnapshot = {
  status: 'idle',
  code: null,
  seat: null,
  seats: [],
  view: null,
  version: 0,
  error: null,
};

/** One PlayClient per mounted game; closes on unmount. */
export function useRoom<V>(game?: string) {
  const [client] = useState(() => new PlayClient<V>({ tokens: browserTokens, game }));
  useEffect(() => () => client.close(), [client]);
  const snap = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    () => IDLE as PlaySnapshot<V>,
  );
  return [snap, client] as const;
}

/** Room code from `?room=XXXXXX`, read after mount. */
export function roomFromUrl(): string | null {
  const v = new URLSearchParams(location.search).get('room');
  return v ? v.toUpperCase() : null;
}

export function inviteLink(code: string) {
  const u = new URL(location.href);
  u.searchParams.set('room', code);
  return u.toString();
}
