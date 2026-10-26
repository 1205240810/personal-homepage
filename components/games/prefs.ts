'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

const PREFIX = 'tscjj-pref:';

/**
 * Remember a game setting (difficulty, board size…) across visits. The first
 * render keeps the server default so hydration matches; the stored value is
 * applied right after mount, and later changes are written back.
 */
export function usePersistedSetting<T>(
  key: string,
  value: T,
  setValue: Dispatch<SetStateAction<T>>,
  isValid: (v: unknown) => v is T,
) {
  const readKey = useRef<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    // Effect replay must not reread a value that this mount has already restored.
    if (readKey.current === key) return;
    readKey.current = key;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) {
          // A layout effect may already have captured a pre-hydration choice.
          // Preserve that newer value instead of replacing it with an old setting.
          setValue((current) => (Object.is(current, value) ? parsed : current));
        }
      }
    } catch {
      /* storage unavailable or corrupt: keep the default */
    }
    // Wait for the restored state to render before enabling writes. A ref flag
    // would let the following effect overwrite storage with the server default.
    setLoadedKey(key);
  }, [key, value, setValue, isValid]);
  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* ignore quota / private mode */
    }
  }, [key, value, loadedKey]);
}
