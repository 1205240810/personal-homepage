'use client';

import { coord } from '@/lib/games/gomoku';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useBoardViewport } from './kit';
import './go.css';
import './gomoku.css';

const STARS = new Set([
  3 * 15 + 3,
  3 * 15 + 11,
  11 * 15 + 3,
  11 * 15 + 11,
  7 * 15 + 7,
]);

export function GomokuBoard({
  cells,
  size = 15,
  last,
  line,
  forbidden,
  disabled,
  onPlay,
  label = '五子棋棋盘',
  hint,
}: {
  cells: readonly number[];
  size?: number;
  last?: number;
  line?: readonly number[] | null;
  forbidden?: ReadonlySet<number>;
  disabled?: boolean;
  onPlay: (i: number) => void;
  label?: string;
  hint?: number | null;
}) {
  const board = useRef<HTMLFieldSetElement>(null);
  const [focus, setFocus] = useState(Math.floor(cells.length / 2));
  useBoardViewport(board);
  const win = new Set(line ?? []);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const x = i % size;
    const y = Math.floor(i / size);
    const next =
      e.key === 'ArrowLeft'
        ? y * size + Math.max(0, x - 1)
        : e.key === 'ArrowRight'
          ? y * size + Math.min(size - 1, x + 1)
          : e.key === 'ArrowUp'
            ? Math.max(0, y - 1) * size + x
            : e.key === 'ArrowDown'
              ? Math.min(size - 1, y + 1) * size + x
              : e.key === 'Home'
                ? y * size
                : e.key === 'End'
                  ? y * size + size - 1
                  : null;
    if (next === null) return;
    e.preventDefault();
    board.current
      ?.querySelector<HTMLButtonElement>(`[data-pt="${next}"]`)
      ?.focus();
  };
  return (
    <fieldset
      ref={board}
      className="go-board gomoku-board"
      style={{ '--n': size } as React.CSSProperties}
      aria-label={`${label}。方向键移动，回车或空格落子。`}
    >
      {cells.map((c, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const cls = [
          'go-pt',
          x === 0 && 'is-l',
          x === size - 1 && 'is-r',
          y === 0 && 'is-t',
          y === size - 1 && 'is-b',
          STARS.has(i) && 'is-star',
          !c && forbidden?.has(i) && 'is-forbidden',
          !c && hint === i && 'is-hint',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={i}
            type="button"
            data-pt={i}
            className={cls}
            tabIndex={focus === i ? 0 : -1}
            aria-disabled={
              disabled || c !== 0 || forbidden?.has(i) || undefined
            }
            aria-label={`${coord(i, size)}${c === 1 ? ' 黑' : c === 2 ? ' 白' : ''}${!c && forbidden?.has(i) ? ' 禁手' : ''}`}
            onClick={() => {
              if (!disabled && c === 0 && !forbidden?.has(i)) onPlay(i);
            }}
            onKeyDown={(e) => onKey(e, i)}
            onFocus={() => setFocus(i)}
          >
            {c !== 0 && (
              <span
                className={`go-stone ${c === 1 ? 'is-black' : 'is-white'}${i === last && !win.size ? ' is-last' : ''}${win.has(i) ? ' is-win' : ''}`}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
