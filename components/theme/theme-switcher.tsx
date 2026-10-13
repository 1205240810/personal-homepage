'use client';
import { useSyncExternalStore } from 'react';
import { Cpu } from 'lucide-react';
import {
  normalizeTheme,
  THEME_EVENT,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  type ThemeId,
} from '@/lib/theme';

const subscribe = (notify: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    try {
      if (event.storageArea !== localStorage) return;
    } catch {
      return;
    }
    applyTheme(normalizeTheme(event.newValue));
    notify();
  };
  window.addEventListener(THEME_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
};
// The boot script initializes the document. Keep its current theme as the
// snapshot so a failed persistence write cannot undo a user's local choice.
const readTheme = (): ThemeId =>
  normalizeTheme(document.documentElement.getAttribute('data-theme'));
function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme === 'tech' ? 'dark' : '';
}
export function setTheme(theme: ThemeId) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Toggle between the default look and the 科技 theme; persisted per browser. */
export function ThemeSwitcher({ className = '' }: { className?: string }) {
  // Server snapshot is always `default`; the boot script already painted the
  // real theme, and React reconciles to it right after hydration.
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'default');
  const tech = theme === 'tech';
  return (
    <button
      type="button"
      className={`theme-switcher ${className}`}
      aria-pressed={tech}
      aria-label={`科技主题：${tech ? '已开启' : '已关闭'}`}
      title={
        tech
          ? `切换到${THEME_LABELS.default}主题`
          : `切换到${THEME_LABELS.tech}主题`
      }
      onClick={() => setTheme(tech ? 'default' : 'tech')}
    >
      <Cpu size={14} strokeWidth={1.6} aria-hidden="true" />
      <span>{THEME_LABELS.tech}</span>
    </button>
  );
}
