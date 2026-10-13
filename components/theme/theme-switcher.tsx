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
  window.addEventListener(THEME_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(THEME_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
};
const readTheme = (): ThemeId => {
  try {
    const stored = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
    // Another tab changed it: keep this document in sync.
    if (document.documentElement.getAttribute('data-theme') !== stored)
      applyTheme(stored);
    return stored;
  } catch {
    return normalizeTheme(document.documentElement.getAttribute('data-theme'));
  }
};
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
