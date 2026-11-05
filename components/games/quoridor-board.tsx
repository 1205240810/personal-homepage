'use client';

import { useRef, useState } from 'react';
import {
  A,
  N,
  cellName,
  pawnMoves,
  wallLegal,
  type Move,
  type Orient,
  type QuoridorState,
  type Side,
} from '@/lib/games/quoridor';
import { useBoardViewport } from './kit';
import './quoridor.css';

const G = 0.28; // groove width relative to a cell
const U = 100 / (N + (N - 1) * G);
const pos = (i: number) => i * (1 + G) * U;

export type BoardMode = 'move' | Orient;

/** 步步为营棋盘：走子模式高亮可达格；放墙模式点交叉点预览，再点一次落墙。 */
export function QuoridorBoard({
  state,
  mode,
  disabled,
  onMove,
  hint,
  you,
  label = '步步为营棋盘',
}: {
  state: QuoridorState;
  mode: BoardMode;
  disabled?: boolean;
  onMove: (m: Move) => void;
  hint?: Move | null;
  you?: Side | null;
  label?: string;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  useBoardViewport(ref);
  const live = !disabled && state.winner === null;
  const [draft, setDraft] = useState<{
    state: QuoridorState;
    mode: BoardMode;
    live: boolean;
    ghost: { x: number; y: number } | null;
  }>(() => ({ state, mode, live, ghost: null }));
  const pointerType = useRef('');
  // Invalidate a preview on every position/mode/connection transition, including
  // disconnect → reconnect to the same board. Keep the board DOM for motion.
  if (draft.state !== state || draft.mode !== mode || draft.live !== live)
    setDraft({ state, mode, live, ghost: null });
  const ghost =
    draft.state === state && draft.mode === mode && draft.live === live
      ? draft.ghost
      : null;
  const setGhost = (ghost: { x: number; y: number } | null) =>
    setDraft({ state, mode, live, ghost });
  const targets =
    live && mode === 'move' ? new Set(pawnMoves(state)) : new Set<number>();
  const last = state.history[state.history.length - 1];
  const walls: { o: Orient; x: number; y: number; k: string }[] = [];
  for (let k = 0; k < A * A; k++) {
    if (state.h[k])
      walls.push({ o: 'h', x: k % A, y: Math.floor(k / A), k: `h${k}` });
    if (state.v[k])
      walls.push({ o: 'v', x: k % A, y: Math.floor(k / A), k: `v${k}` });
  }
  const wallStyle = (o: Orient, x: number, y: number) =>
    o === 'h'
      ? {
          left: `${pos(x)}%`,
          top: `${pos(y + 1) - G * U}%`,
          width: `${(2 + G) * U}%`,
          height: `${G * U}%`,
        }
      : {
          left: `${pos(x + 1) - G * U}%`,
          top: `${pos(y)}%`,
          width: `${G * U}%`,
          height: `${(2 + G) * U}%`,
        };
  const isLast = (o: Orient, x: number, y: number) =>
    last?.t === 'w' && last.o === o && last.x === x && last.y === y;
  return (
    <div className="qd-scene">
      <svg
        className="qd-backdrop"
        viewBox="0 0 400 120"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <circle cx="300" cy="40" r="16" className="qd-sun" />
        <path
          d="M0 120V78l40-22 34 16 52-38 46 30 38-20 56 34 44-26 50 28 40-14v112z"
          className="qd-hill far"
        />
        <path
          d="M0 120V96l60-14 50 10 70-22 60 18 52-12 58 16 50-8v36z"
          className="qd-hill near"
        />
      </svg>
      <fieldset
        ref={ref}
        className={`qd-board is-${mode}${live ? '' : ' is-idle'}`}
        aria-label={`${label}。${mode === 'move' ? '点高亮的格子走棋' : '点交叉点预览墙，再点一次放下'}`}
      >
        {Array.from({ length: N * N }, (_, i) => {
          const x = i % N;
          const y = Math.floor(i / N);
          const goal = y === 0 ? ' is-goal-0' : y === N - 1 ? ' is-goal-1' : '';
          const target = targets.has(i);
          const hinted = hint?.t === 'm' && hint.to === i;
          return (
            <button
              key={i}
              type="button"
              className={`qd-cell${goal}${target ? ' is-target' : ''}${hinted ? ' is-hint' : ''}`}
              style={{
                left: `${pos(x)}%`,
                top: `${pos(y)}%`,
                width: `${U}%`,
                height: `${U}%`,
              }}
              tabIndex={target ? 0 : -1}
              aria-disabled={!target || undefined}
              aria-label={`${cellName(i)}${state.pawns[0] === i ? ' 朱方棋子' : state.pawns[1] === i ? ' 黛方棋子' : ''}${target ? ' 可走' : ''}`}
              onClick={() => target && onMove({ t: 'm', to: i })}
            />
          );
        })}
        {walls.map(({ o, x, y, k }) => (
          <i
            key={k}
            className={`qd-wall is-${o}${isLast(o, x, y) ? ' is-last' : ''}`}
            style={wallStyle(o, x, y)}
          />
        ))}
        {hint?.t === 'w' && (
          <i
            className="qd-wall is-hint"
            style={wallStyle(hint.o, hint.x, hint.y)}
          />
        )}
        {([0, 1] as Side[]).map((p) => {
          const i = state.pawns[p];
          return (
            <span
              key={p}
              className={`qd-pawn p${p}${state.toPlay === p && state.winner === null ? ' is-turn' : ''}${you === p ? ' is-you' : ''}`}
              style={{
                left: `${pos(i % N)}%`,
                top: `${pos(Math.floor(i / N))}%`,
                width: `${U}%`,
                height: `${U}%`,
              }}
              aria-hidden="true"
            >
              <svg key={i} viewBox="0 0 40 40" className="qd-piece">
                <ellipse
                  cx="20"
                  cy="35.5"
                  rx="11"
                  ry="3"
                  className="qd-shadow"
                />
                <path
                  d="M9 33c0-3 5-4.5 11-4.5S31 30 31 33s-5 3-11 3-11 0-11-3z"
                  className="qd-base"
                />
                <path
                  d="M13 31c1-7 3-12 3.5-15h7c.5 3 2.5 8 3.5 15-2 1.4-4.6 2-7 2s-5-.6-7-2z"
                  className="qd-body"
                />
                <circle cx="20" cy="11.5" r="6.5" className="qd-head" />
                <path d="M16 9.5a5 5 0 0 1 6-2.6" className="qd-gloss" />
                <text x="20" y="27.5" className="qd-mark">
                  {p ? '黛' : '朱'}
                </text>
              </svg>
            </span>
          );
        })}
        {live && mode !== 'move' && state.left[state.toPlay] > 0 && (
          <>
            {ghost && (
              <i
                className={`qd-wall is-ghost${wallLegal(state, mode, ghost.x, ghost.y) ? '' : ' is-bad'}`}
                style={wallStyle(mode, ghost.x, ghost.y)}
              />
            )}
            {Array.from({ length: A * A }, (_, k) => {
              const x = k % A;
              const y = Math.floor(k / A);
              const c = pos(x + 1) - (G * U) / 2;
              const r = pos(y + 1) - (G * U) / 2;
              const s = (1 + G) * U;
              const ok = wallLegal(state, mode, x, y);
              return (
                <button
                  key={k}
                  type="button"
                  className="qd-anchor"
                  style={{
                    left: `${c - s / 2}%`,
                    top: `${r - s / 2}%`,
                    width: `${s}%`,
                    height: `${s}%`,
                  }}
                  aria-label={`${mode === 'h' ? '横' : '竖'}墙 ${'abcdefgh'[x]}${N - 1 - y}${ok ? '' : ' 不可放'}`}
                  aria-disabled={!ok || undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setGhost({ x, y });
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse') setGhost(null);
                  }}
                  onPointerDown={(e) => {
                    pointerType.current = e.pointerType;
                  }}
                  onKeyDown={() => {
                    pointerType.current = '';
                  }}
                  onFocus={() => {
                    // A touch focus precedes click: it must not count as tap one.
                    if (
                      pointerType.current !== 'touch' &&
                      pointerType.current !== 'pen'
                    )
                      setGhost({ x, y });
                  }}
                  onClick={() => {
                    if (!ok) return setGhost({ x, y });
                    // Touch: first tap previews, second tap places.
                    if (ghost?.x === x && ghost.y === y) {
                      setGhost(null);
                      onMove({ t: 'w', o: mode, x, y });
                    } else setGhost({ x, y });
                  }}
                />
              );
            })}
          </>
        )}
      </fieldset>
    </div>
  );
}
