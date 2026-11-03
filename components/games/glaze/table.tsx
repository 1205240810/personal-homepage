'use client';

import { useState, type ReactNode } from 'react';
import {
  COLORS,
  FLOOR,
  lineAccepts,
  wallColor,
  type Board,
  type Color,
  type GlazeView,
  type Move,
  type Side,
} from '@/lib/games/glaze';
import './glaze.css';

export function Tile({
  c,
  ghost,
  className = '',
}: {
  c: Color | 'first';
  ghost?: boolean;
  className?: string;
}) {
  if (c === 'first')
    return (
      <span className={`gz-tile is-first ${className}`} aria-label="开窑令">
        令
      </span>
    );
  return (
    <span
      className={`gz-tile c${c}${ghost ? ' is-ghost' : ''} ${className}`}
      aria-label={COLORS[c].name}
    />
  );
}

function BoardView({
  b,
  name,
  me,
  pick,
  onLine,
  placed,
  small,
}: {
  b: Board;
  name: ReactNode;
  me?: boolean;
  pick?: Color | null;
  onLine?: (line: number) => void;
  placed?: number[][];
  small?: boolean;
}) {
  const fresh = new Set((placed ?? []).map(([r, c]) => r * 5 + c));
  return (
    <section
      className={`gz-board${small ? ' is-small' : ''}${me ? ' is-me' : ''}`}
      aria-label={`${typeof name === 'string' ? name : ''}的工坊`}
    >
      <header>
        <strong>{name}</strong>
        <span className="gz-score">{b.score} 分</span>
      </header>
      <div className="gz-work">
        <div className="gz-lines">
          {b.lines.map((l, r) => {
            const ok = pick != null && onLine && lineAccepts(b, r, pick);
            return (
              <button
                key={r}
                type="button"
                className={`gz-line${ok ? ' can-drop' : ''}`}
                disabled={!ok}
                aria-label={`料架第 ${r + 1} 层（${l.n}/${r + 1}${l.color !== null ? ` ${COLORS[l.color].name}` : ''}）${ok ? '：放这里' : ''}`}
                onClick={() => ok && onLine!(r)}
              >
                {Array.from({ length: r + 1 }, (_, k) =>
                  k < l.n && l.color !== null ? (
                    <Tile key={k} c={l.color} />
                  ) : (
                    <span key={k} className="gz-slot" />
                  ),
                )}
              </button>
            );
          })}
        </div>
        <div className="gz-wall" aria-label="照壁">
          {b.wall.map((row, r) =>
            row.map((on, c) => (
              <span key={`${r}${c}`} className="gz-cell">
                <Tile
                  c={wallColor(r, c)}
                  ghost={!on}
                  className={fresh.has(r * 5 + c) ? 'is-fresh' : ''}
                />
              </span>
            )),
          )}
        </div>
      </div>
      <button
        type="button"
        className={`gz-floor${pick != null && onLine ? ' can-drop' : ''}`}
        disabled={pick == null || !onLine}
        onClick={() => onLine?.(-1)}
        aria-label={`碎瓷区（${b.floor.length} 块）${pick != null && onLine ? '：直接扔这里' : ''}`}
      >
        {FLOOR.map((p, k) => (
          <span key={k} className="gz-floor-slot">
            {b.floor[k] !== undefined ? <Tile c={b.floor[k]} /> : null}
            <i>{p}</i>
          </span>
        ))}
      </button>
    </section>
  );
}

/** 琉璃坊牌桌：先点窑口或案台上的一块釉砖（选中同色全部），再点自己料架的一层或碎瓷区。 */
export function GlazeTable({
  v,
  disabled,
  names,
  onMove,
  status,
  footer,
}: {
  v: GlazeView;
  disabled?: boolean;
  names: [string, string];
  onMove: (m: Move) => void;
  status?: ReactNode;
  footer?: ReactNode;
}) {
  const me = (v.you ?? 0) as Side;
  const opp = (1 - me) as Side;
  const live = !disabled && v.phase === 'play' && v.toPlay === me;
  const [pick, setPick] = useState<{ src: number; color: Color } | null>(null);
  const sel = live ? pick : null;
  const choose = (src: number, color: Color) =>
    setPick(
      sel && sel.src === src && sel.color === color ? null : { src, color },
    );
  const place = (line: number) => {
    if (!sel) return;
    setPick(null);
    onMove({ src: sel.src, color: sel.color, line });
  };
  const lastOpp = v.last?.side === opp ? v.last.move : null;
  const tileBtn = (src: number, c: Color, k: number) => (
    <button
      key={k}
      type="button"
      className={`gz-pick${sel && sel.src === src && sel.color === c ? ' is-selected' : ''}`}
      disabled={!live}
      aria-label={`${src === -1 ? '案台' : `第 ${src + 1} 窑`}的${COLORS[c].name}`}
      onClick={() => choose(src, c)}
    >
      <Tile c={c} />
    </button>
  );
  return (
    <div className="gz-table">
      <BoardView
        b={v.boards[opp]}
        name={names[opp]}
        small
        placed={v.lastRound?.placed[opp]}
      />
      <div className="gz-market">
        <div className="gz-kilns">
          {v.factories.map((f, i) => (
            <div
              key={i}
              className={`gz-kiln${lastOpp && lastOpp.src === i ? ' was-taken' : ''}`}
              aria-label={`第 ${i + 1} 窑`}
            >
              {f.map((c, k) => tileBtn(i, c, k))}
            </div>
          ))}
        </div>
        <div className="gz-center" aria-label="案台">
          {v.firstInCenter && <Tile c="first" />}
          {v.center.map((c, k) => tileBtn(-1, c, k))}
          {!v.center.length && !v.firstInCenter && (
            <span className="kit-help">案台空了</span>
          )}
        </div>
        <p className="gz-meta">
          第 {v.round} 轮 · 袋中 {v.bagCount} 块
        </p>
      </div>
      {status && (
        <p className="gz-status" aria-live="polite">
          {status}
        </p>
      )}
      <BoardView
        b={v.boards[me]}
        name={names[me]}
        me
        pick={sel?.color ?? null}
        onLine={live ? place : undefined}
        placed={v.lastRound?.placed[me]}
      />
      {footer}
    </div>
  );
}
