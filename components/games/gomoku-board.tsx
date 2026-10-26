'use client';

import { coord } from '@/lib/games/gomoku';
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
  const win = new Set(line ?? []);
  return (
    <div
      className="go-board gomoku-board"
      style={{ '--n': size } as React.CSSProperties}
      role="grid"
      aria-label={label}
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
            className={cls}
            disabled={disabled || c !== 0 || forbidden?.has(i)}
            aria-label={`${coord(i, size)}${c === 1 ? ' 黑' : c === 2 ? ' 白' : ''}${!c && forbidden?.has(i) ? ' 禁手' : ''}`}
            onClick={() => onPlay(i)}
          >
            {c !== 0 && (
              <span
                className={`go-stone ${c === 1 ? 'is-black' : 'is-white'}${i === last && !win.size ? ' is-last' : ''}${win.has(i) ? ' is-win' : ''}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
