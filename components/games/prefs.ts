'use client';

import { useEffect, useRef } from 'react';

const PREFIX = 'tscjj-pref:';

/**
 * Remember a game setting (difficulty, board size…) across visits. The first
 * render keeps the server default so hydration matches; the stored value is
 * applied right after mount, and later changes are written back.
 */
export function usePersistedSetting<T>(
  key: string,
  value: T,
  setValue: (v: T) => void,
  isValid: (v: unknown) => v is T,
) {
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) setValue(parsed);
      }
    } catch {
      /* storage unavailable or corrupt: keep the default */
    }
    loaded.current = true;
    // Only on mount (per key): callers pass stable setters and validators.
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* ignore quota / private mode */
    }
  }, [key, value]);
}
