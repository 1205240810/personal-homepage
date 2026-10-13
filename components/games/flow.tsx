'use client';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as RPointerEvent,
} from 'react';
import { CalendarDays, Lightbulb, RotateCcw, Shuffle } from 'lucide-react';
import { dailyKey, todayParts } from '@/lib/games/kit';
import {
  FLOW_RECORDS_KEY,
  FLOW_SIZES,
  dailyFlow,
  emptyFlowRecords,
  emptyPaths,
  endpointColour,
  extendPath,
  flowStatus,
  generateFlow,
  isComplete,
  mergeFlowRecord,
  ownerOf,
  solutionPath,
  startPath,
  validateFlowRecords,
  type FlowPuzzle,
  type Paths,
} from '@/lib/games/flow';
import { useHydrated, useLocalRecords } from './kit';
import './kit.css';
import './flow.css';

export const FLOW_COLOURS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#2bb5c4',
  '#f032e6',
  '#9a9a00',
  '#008080',
  '#9a6324',
  '#800000',
  '#000075',
];
const EMPTY = emptyFlowRecords();
const clock = () => Date.now();
type Pick = { kind: 'random'; size: number; seed: number } | { kind: 'daily' };
const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function puzzleFor(pick: Pick, ready: boolean): FlowPuzzle {
  if (pick.kind === 'daily' && ready) return dailyFlow(todayParts());
  if (pick.kind === 'random') return generateFlow(pick.size, pick.seed);
  return generateFlow(7, 1);
}

export function FlowConnect() {
  const ready = useHydrated();
  const [records, saveRecords] = useLocalRecords(
    FLOW_RECORDS_KEY,
    validateFlowRecords,
    EMPTY,
  );
  const [pick, setPick] = useState<Pick>({
    kind: 'random',
    size: 6,
    seed: 20261013,
  });
  const [puzzle, setPuzzle] = useState<FlowPuzzle>(() =>
    puzzleFor(pick, false),
  );
  const [paths, setPaths] = useState<Paths>(() => emptyPaths(puzzle));
  const [active, setActive] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [doneIn, setDoneIn] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const [announce, setAnnounce] = useState('');
  const boardRef = useRef<HTMLFieldSetElement>(null);
  const dragging = useRef(false);

  const n = puzzle.size;
  const status = flowStatus(
    puzzle,
    paths.length === puzzle.pairs.length ? paths : emptyPaths(puzzle),
  );
  const today = ready ? todayParts() : null;
  const dailyDone = !!today && records.daily.includes(dailyKey(today));

  useEffect(() => {
    if (startedAt === null || doneIn !== null) return;
    const id = setInterval(
      () => setElapsed(Math.floor((clock() - startedAt) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, [startedAt, doneIn]);

  function load(next: Pick, replay?: FlowPuzzle) {
    const p = replay ?? puzzleFor(next, ready);
    setPick(next);
    setPuzzle(p);
    dragging.current = false;
    setPaths(emptyPaths(p));
    setActive(null);
    setStartedAt(null);
    setElapsed(0);
    setDoneIn(null);
    setHints(0);
    setFocus(0);
    setAnnounce(`新谜题：${p.size}×${p.size}，${p.pairs.length} 种颜色`);
  }
  function apply(next: Paths, colour: number) {
    setPaths(next);
    if (startedAt === null) setStartedAt(clock());
    const st = flowStatus(puzzle, next);
    if (st.solved && doneIn === null) {
      const secs = Math.max(
        1,
        Math.round((clock() - (startedAt ?? clock())) / 1000),
      );
      setDoneIn(secs);
      setActive(null);
      saveRecords(
        mergeFlowRecord(
          records,
          n,
          secs,
          puzzle.id.startsWith('daily-') ? puzzle.id.slice(6) : undefined,
        ),
      );
      setAnnounce(`完成！用时 ${fmt(secs)}`);
    } else if (
      isComplete(puzzle, next[colour], colour) &&
      !isComplete(puzzle, paths[colour], colour)
    ) {
      setActive(null);
      dragging.current = false;
      setAnnounce(
        `颜色 ${colour + 1} 连通。已连 ${st.connected}/${puzzle.pairs.length}，填满 ${st.filled}/${st.total}`,
      );
    }
  }
  function begin(cell: number) {
    if (doneIn !== null) return false;
    const s = startPath(puzzle, paths, cell);
    if (!s) return false;
    setActive(s.colour);
    apply(s.paths, s.colour);
    setAnnounce(`开始画颜色 ${s.colour + 1}`);
    return true;
  }
  function moveTo(cell: number) {
    if (active === null) return;
    const next = extendPath(puzzle, paths, active, cell);
    if (next) apply(next, active);
  }
  function cellAt(e: { clientX: number; clientY: number }) {
    const el = document.elementFromPoint?.(
      e.clientX,
      e.clientY,
    ) as HTMLElement | null;
    const v = el?.closest<HTMLElement>('[data-cell]')?.dataset.cell;
    return v === undefined ? null : Number(v);
  }
  function onDown(e: RPointerEvent<HTMLButtonElement>, cell: number) {
    if (begin(cell)) {
      dragging.current = true;
      boardRef.current?.setPointerCapture?.(e.pointerId);
    }
  }
  function onMove(e: RPointerEvent<HTMLFieldSetElement>) {
    if (!dragging.current) return;
    const c = cellAt(e);
    if (c !== null) moveTo(c);
  }
  function onUp() {
    dragging.current = false;
  }
  function hint() {
    if (doneIn !== null) return;
    let colour = puzzle.pairs.findIndex(
      (_, c) => !isComplete(puzzle, paths[c], c),
    );
    // Every pair can be connected while some cells remain empty. In that
    // case replace a route that omits part of its reference solution.
    if (colour < 0)
      colour = puzzle.pairs.findIndex((_, c) =>
        solutionPath(puzzle, c).some((cell) => !paths[c].includes(cell)),
      );
    if (colour < 0) return;
    const route = solutionPath(puzzle, colour);
    let next = paths.map((p, c) => {
      if (c === colour) return route;
      const cut = p.findIndex((cell) => route.includes(cell));
      return cut >= 0 ? p.slice(0, cut) : p;
    });
    next = next.map((p) =>
      p.length === 1 && endpointColour(puzzle, p[0]) < 0 ? [] : p,
    );
    setHints(hints + 1);
    setActive(null);
    apply(next, colour);
    setAnnounce(`提示：画好了颜色 ${colour + 1}`);
  }
  function onKey(e: KeyboardEvent<HTMLButtonElement>, cell: number) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const x = cell % n,
      y = Math.floor(cell / n);
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    if (e.key in dirs) {
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
      const to = ny * n + nx;
      if (active !== null) moveTo(to);
      setFocus(to);
      (
        boardRef.current?.querySelector(
          `[data-cell="${to}"]`,
        ) as HTMLElement | null
      )?.focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active !== null) {
        setActive(null);
        setAnnounce('停止画线');
      } else if (!begin(cell)) setAnnounce('这里没有线，从同色圆点开始');
      return;
    }
    if (e.key === 'Escape') setActive(null);
    if (e.key === 'h' || e.key === 'H') hint();
  }

  const label = (cell: number) => {
    const end = endpointColour(puzzle, cell);
    const owner = ownerOf(paths, cell);
    const pos = `第 ${Math.floor(cell / n) + 1} 行第 ${(cell % n) + 1} 列`;
    if (end >= 0)
      return `${pos}，颜色 ${end + 1} 端点${isComplete(puzzle, paths[end], end) ? '，已连通' : ''}`;
    return owner >= 0 ? `${pos}，颜色 ${owner + 1} 的线` : `${pos}，空`;
  };

  return (
    <div className="kit flow">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            FLOW · {n}×{n} · {puzzle.pairs.length} COLOURS
          </p>
          <h2>连线解谜</h2>
        </div>
        <div className="kit-row">
          <button
            type="button"
            aria-pressed={pick.kind === 'daily'}
            disabled={!ready}
            onClick={() => load({ kind: 'daily' })}
          >
            <CalendarDays size={15} aria-hidden="true" /> 今日连线
            {dailyDone ? ' ✓' : ''}
          </button>
          <fieldset className="kit-row" aria-label="尺寸">
            {FLOW_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={pick.kind === 'random' && n === s}
                onClick={() =>
                  load({
                    kind: 'random',
                    size: s,
                    seed: Math.floor(Math.random() * 1e9),
                  })
                }
              >
                {s}×{s}
              </button>
            ))}
          </fieldset>
        </div>
      </header>

      <div className="kit-row">
        <span className="kit-stats">
          <span>
            连通{' '}
            <strong data-testid="flow-connected">{status.connected}</strong>/
            {puzzle.pairs.length}
          </span>
          <span>
            填满{' '}
            <strong>{Math.round((status.filled / status.total) * 100)}%</strong>
          </span>
          <span>
            用时 <strong className="kit-mono">{fmt(doneIn ?? elapsed)}</strong>
          </span>
          {records.best[String(n)] && (
            <span>本机最快 {fmt(records.best[String(n)])}</span>
          )}
        </span>
        <button type="button" onClick={hint} disabled={doneIn !== null}>
          <Lightbulb size={15} aria-hidden="true" /> 提示 (H)
        </button>
        <button
          type="button"
          onClick={() => load(pick, puzzle)}
          aria-label="重来"
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
        {pick.kind === 'random' && (
          <button
            type="button"
            onClick={() =>
              load({
                kind: 'random',
                size: n,
                seed: Math.floor(Math.random() * 1e9),
              })
            }
          >
            <Shuffle size={15} aria-hidden="true" /> 换一题
          </button>
        )}
      </div>
      {doneIn !== null && (
        <output className="kit-ok flow-done">
          完成！用时 {fmt(doneIn)}
          {hints ? `（用了 ${hints} 次提示）` : ''}
        </output>
      )}

      <fieldset
        ref={boardRef}
        className="flow-board"
        aria-label={`连线棋盘 ${n}×${n}`}
        style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <svg className="flow-svg" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
          {paths.map((path, c) =>
            path.length > 1 ? (
              <polyline
                key={c}
                points={path
                  .map(
                    (cell) =>
                      `${(cell % n) + 0.5},${Math.floor(cell / n) + 0.5}`,
                  )
                  .join(' ')}
                stroke={FLOW_COLOURS[c % FLOW_COLOURS.length]}
                className={active === c ? 'is-active' : ''}
              />
            ) : null,
          )}
        </svg>
        {Array.from({ length: n * n }, (_, cell) => {
          const end = endpointColour(puzzle, cell);
          const owner = ownerOf(paths, cell);
          const colour = end >= 0 ? end : owner;
          return (
            <button
              key={cell}
              type="button"
              data-cell={cell}
              tabIndex={cell === focus ? 0 : -1}
              aria-label={label(cell)}
              className={end >= 0 ? 'is-end' : ''}
              style={
                colour >= 0
                  ? ({
                      '--c': FLOW_COLOURS[colour % FLOW_COLOURS.length],
                    } as React.CSSProperties)
                  : undefined
              }
              data-filled={owner >= 0 ? '' : undefined}
              onPointerDown={(e) => onDown(e, cell)}
              onPointerEnter={(e) => e.buttons && moveTo(cell)}
              onFocus={() => setFocus(cell)}
              onKeyDown={(e) => onKey(e, cell)}
            >
              {end >= 0 && <span>{end + 1}</span>}
            </button>
          );
        })}
      </fieldset>
      <p className="kit-help">
        从同色圆点按住拖到另一个同色圆点，把整张棋盘铺满。拖回自己的线会回退，穿过别人的线会把它剪断。键盘：方向键移动，回车在圆点或线上开始画，再用方向键延伸，回车结束；H
        提示。题目只保证有解，任何不重叠、同色相连且铺满棋盘的连法都算完成。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
