'use client';
// Shared client hooks for the newer games: hydration flag, reduced motion,
// theme changes (for canvas colours) and validated local records.
import { useSyncExternalStore } from 'react';
import { loadJson, saveJson } from '@/lib/games/kit';
import { THEME_EVENT } from '@/lib/theme';

const noop = () => () => {};
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const MOTION = '(prefers-reduced-motion: reduce)';
function subscribeMotion(cb: () => void) {
  if (typeof matchMedia === 'undefined') return () => {};
  const mq = matchMedia(MOTION);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeMotion,
    () => typeof matchMedia !== 'undefined' && matchMedia(MOTION).matches,
    () => false,
  );

function subscribeTheme(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    mo.disconnect();
  };
}
/** Current data-theme; canvases re-read their CSS colours when it changes. */
export const useThemeName = () =>
  useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme ?? 'default',
    () => 'default',
  );

export function cssColors<T extends Record<string, string>>(
  el: Element,
  fallbacks: T,
): T {
  const s = getComputedStyle(el);
  const out = { ...fallbacks };
  for (const name of Object.keys(fallbacks) as (keyof T & string)[]) {
    const v = s.getPropertyValue(`--${name}`).trim();
    if (v) (out as Record<string, string>)[name] = v;
  }
  return out;
}

const RECORD_EVENT = 'tscjj-kit-records';
type Store = { raw: string | null; value: unknown };
const cache = new Map<string, Store>();

/**
 * Local records as an external store: one validated snapshot per key, shared
 * across components and tabs. Returns [records, save].
 */
export function useLocalRecords<T>(
  key: string,
  validate: (value: unknown) => T | null,
  empty: T,
): [T, (next: T) => 'saved' | 'unavailable'] {
  const value = useSyncExternalStore(
    (cb) => {
      window.addEventListener('storage', cb);
      window.addEventListener(RECORD_EVENT, cb);
      return () => {
        window.removeEventListener('storage', cb);
        window.removeEventListener(RECORD_EVENT, cb);
      };
    },
    () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        raw = null;
      }
      const hit = cache.get(key);
      if (hit && hit.raw === raw) return hit.value as T;
      const next = loadJson(key, validate, () => empty);
      cache.set(key, { raw, value: next });
      return next;
    },
    () => empty,
  );
  const save = (next: T) => {
    const r = saveJson(key, next);
    window.dispatchEvent(new Event(RECORD_EVENT));
    return r;
  };
  return [value, save];
}
