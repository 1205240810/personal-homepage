'use client';

import { CircleAlert, PartyPopper } from 'lucide-react';
import type { ReactNode } from 'react';
import './result.css';

export type ResultAction = {
  label: string;
  onClick: () => void;
  /** Shown as a keycap, e.g. "N". The game owns the actual key handler. */
  shortcut?: string;
  primary?: boolean;
};

/**
 * One result card for every game: win, loss or a neutral note, with the same
 * title / detail / actions layout. Inline (never a modal) so the finished
 * board stays visible for review.
 */
export function GameResult({
  tone,
  title,
  children,
  actions = [],
}: {
  tone: 'win' | 'lose';
  title: ReactNode;
  children?: ReactNode;
  actions?: ResultAction[];
}) {
  const Icon = tone === 'win' ? PartyPopper : CircleAlert;
  return (
    <output className={`game-result is-${tone}`} aria-live="polite">
      <Icon className="game-result-icon" size={20} aria-hidden="true" />
      <span className="game-result-text">
        <strong>{title}</strong>
        {children && <span>{children}</span>}
      </span>
      {actions.length > 0 && (
        <span className="game-result-actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={a.primary ? 'kit-primary' : undefined}
              onClick={a.onClick}
            >
              {a.label}
              {a.shortcut && <kbd>{a.shortcut}</kbd>}
            </button>
          ))}
        </span>
      )}
    </output>
  );
}
