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
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const live = !disabled && state.winner === null;
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
            aria-label={`${cellName(i)}${target ? ' 可走' : ''}`}
            onClick={() => target && onMove({ t: 'm', to: i })}
          />
        );
      })}
      {walls.map(({ o, x, y, k }) => (
        <i
          key={k}
          className={`qd-wall${isLast(o, x, y) ? ' is-last' : ''}`}
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
          />
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
                onFocus={() => setGhost({ x, y })}
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
  );
}
