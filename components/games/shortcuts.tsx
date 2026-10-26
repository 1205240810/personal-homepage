'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Shared single-key shortcuts for every game page. A game opts a button in
 * with `data-shortcut="r"` (space-separated for several keys); pressing the
 * key clicks the first enabled match inside this stage. Disabled buttons,
 * typing in form fields, modifier chords and keys a game already handled
 * (`preventDefault`) are left alone, so games with their own key handling
 * keep working unchanged.
 */
export function GameStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, select, textarea, [contenteditable="true"]'))
        return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : '';
      if (!key || !/^[a-z]$/.test(key)) return;
      const btn = ref.current?.querySelector<HTMLButtonElement>(
        `button[data-shortcut~="${key}"]:not(:disabled)`,
      );
      if (!btn) return;
      e.preventDefault();
      btn.click();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="game-stage" ref={ref}>
      {children}
    </div>
  );
}
