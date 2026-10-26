'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Shared single-key shortcuts for every game page. A game opts a button in
 * with `data-shortcut="r"` (space-separated for several keys); pressing the
 * key while focus is in this stage clicks the first enabled match. Site
 * controls, dialogs, composition, disabled buttons, editable fields,
 * modifier chords and keys a game already handled
 * (`preventDefault`) are left alone, so games with their own key handling
 * keep working unchanged.
 */
export function GameStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.keyCode === 229)
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (!(t instanceof HTMLElement) || !ref.current?.contains(t)) return;
      if (
        t.isContentEditable ||
        t.closest(
          'input, select, textarea, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [aria-modal="true"], [data-slot="popover-content"]',
        )
      )
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
