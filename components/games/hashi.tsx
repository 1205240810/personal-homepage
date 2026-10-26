'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as RPointerEvent,
} from 'react';
import { CalendarDays, Lightbulb, RotateCcw, Shuffle } from 'lucide-react';
import { dailyKey, todayParts, type Today } from '@/lib/games/kit';
import {
  HASHI_RECORDS_KEY,
  HASHI_SIZES,
  cycleBridge,
  dailyHashi,
  edgeBetween,
  edgeToward,
  emptyHashiRecords,
  generateHashi,
  hashiStatus,
  mergeHashiRecord,
  validateHashiRecords,
  type HashiPuzzle,
  type HashiSize,
} from '@/lib/games/hashi';
import { useHydrated, useLocalRecords } from './kit';
import './kit.css';
import { GameResult } from './result';
import './hashi.css';

const EMPTY = emptyHashiRecords();
const clock = () => Date.now();
const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const SIZE_NAMES: Record<HashiSize, string> = {
  small: '7×7',
  medium: '9×9',
  large: '11×11',
};
type Pick =
  | { kind: 'random'; size: HashiSize; seed: number }
  | { kind: 'daily'; day: Today };
const DIRS: Record<string, [number, number, string]> = {
  ArrowUp: [0, -1, '上'],
  ArrowDown: [0, 1, '下'],
  ArrowLeft: [-1, 0, '左'],
  ArrowRight: [1, 0, '右'],
};

function puzzleFor(pick: Pick, ready: boolean): HashiPuzzle {
  if (pick.kind === 'daily' && ready) return dailyHashi(pick.day);
  if (pick.kind === 'random') return generateHashi(pick.size, pick.seed);
  return generateHashi('medium', 1);
}

export function HashiBridges() {
  const ready = useHydrated();
  const [records, saveRecords] = useLocalRecords(
    HASHI_RECORDS_KEY,
    validateHashiRecords,
    EMPTY,
  );
  const [pick, setPick] = useState<Pick>({
    kind: 'random',
    size: 'small',
    seed: 20261013,
  });
  const puzzle = useMemo(() => puzzleFor(pick, ready), [pick, ready]);
  const [bridges, setBridges] = useState<number[]>(() =>
    puzzle.edges.map(() => 0),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const [locked, setLocked] = useState<Set<number>>(() => new Set());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [doneIn, setDoneIn] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const [announce, setAnnounce] = useState('');
  const boardRef = useRef<HTMLFieldSetElement>(null);
  const swiped = useRef(false);
  const press = useRef<{ k: number; x: number; y: number } | null>(null);

  const n = puzzle.size;
  const sizeKey: HashiSize = pick.kind === 'random' ? pick.size : 'medium';
  const status = hashiStatus(
    puzzle,
    bridges.length === puzzle.edges.length
      ? bridges
      : puzzle.edges.map(() => 0),
  );
  const counts = puzzle.islands.map((_, k) =>
    puzzle.edges.reduce(
      (s, e, i) => s + (e.a === k || e.b === k ? (bridges[i] ?? 0) : 0),
      0,
    ),
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

  function load(next: Pick) {
    const p = puzzleFor(next, ready);
    setPick(next);
    setBridges(p.edges.map(() => 0));
    setSelected(null);
    setFocus(0);
    setLocked(new Set());
    setStartedAt(null);
    setElapsed(0);
    setDoneIn(null);
    setHints(0);
    setAnnounce(`新谜题：${p.size}×${p.size}，${p.islands.length} 座岛`);
  }
  function commit(next: number[], edge: number) {
    setBridges(next);
    if (startedAt === null) setStartedAt(clock());
    const st = hashiStatus(puzzle, next);
    const e = puzzle.edges[edge];
    if (st.solved && doneIn === null) {
      const secs = Math.max(
        1,
        Math.round((clock() - (startedAt ?? clock())) / 1000),
      );
      setDoneIn(secs);
      saveRecords(
        mergeHashiRecord(
          records,
          sizeKey,
          secs,
          pick.kind === 'daily' ? dailyKey(pick.day) : undefined,
        ),
      );
      setAnnounce(`全部连通！用时 ${fmt(secs)}`);
    } else
      setAnnounce(
        `${puzzle.islands[e.a].n} 号岛与 ${puzzle.islands[e.b].n} 号岛之间 ${next[edge]} 座桥。完成 ${st.done}/${puzzle.islands.length}`,
      );
  }
  function toggle(edge: number) {
    if (edge < 0 || doneIn !== null) return;
    if (locked.has(edge)) {
      setAnnounce('这座桥是提示给的，已锁定');
      return;
    }
    const next = cycleBridge(puzzle, bridges, edge);
    if (!next) {
      setAnnounce('桥不能交叉');
      return;
    }
    commit(next, edge);
  }
  function tapIsland(k: number) {
    if (selected === null || selected === k) {
      setSelected(selected === k ? null : k);
      return;
    }
    const edge = edgeBetween(puzzle, selected, k);
    if (edge < 0) {
      setSelected(k);
      setAnnounce('这两座岛之间不能直接架桥');
      return;
    }
    toggle(edge);
    setSelected(null);
  }
  function onDown(e: RPointerEvent<HTMLButtonElement>, k: number) {
    press.current = { k, x: e.clientX, y: e.clientY };
  }
  function onUp(e: RPointerEvent<HTMLButtonElement>, k: number) {
    const p = press.current;
    press.current = null;
    if (!p || p.k !== k) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (Math.hypot(dx, dy) < 14) return; // a tap; click handles it
    const dir: [number, number] =
      Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    toggle(edgeToward(puzzle, k, dir[0], dir[1]));
    swiped.current = true;
  }
  function hint() {
    const edge = puzzle.solution.findIndex(
      (v, i) => bridges[i] !== v && !locked.has(i),
    );
    if (edge < 0) return;
    let next = [...bridges];
    next[edge] = puzzle.solution[edge];
    // Clear anything that would cross the hinted bridge.
    if (next[edge] > 0)
      next = next.map((v, i) => (puzzle.crossings[edge].includes(i) ? 0 : v));
    setLocked(new Set(locked).add(edge));
    setHints(hints + 1);
    commit(next, edge);
  }
  function onKey(e: KeyboardEvent<HTMLButtonElement>, k: number) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const d = DIRS[e.key];
    if (d) {
      e.preventDefault();
      const edge = edgeToward(puzzle, k, d[0], d[1]);
      if (e.shiftKey) {
        if (edge < 0) return;
        const to =
          puzzle.edges[edge].a === k
            ? puzzle.edges[edge].b
            : puzzle.edges[edge].a;
        setFocus(to);
        (
          boardRef.current?.querySelector(
            `[data-island="${to}"]`,
          ) as HTMLElement | null
        )?.focus();
        return;
      }
      if (edge < 0) setAnnounce(`${d[2]}边没有岛`);
      else toggle(edge);
      return;
    }
    if (e.key === 'Tab') return;
    if (e.key === 'h' || e.key === 'H') hint();
  }

  const pct = (v: number) => `${((v + 0.5) / n) * 100}%`;
  return (
    <div className="kit hashi">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            HASHIWOKAKERO · {n}×{n} · {puzzle.islands.length} ISLANDS
          </p>
          <h2>数桥</h2>
        </div>
        <div className="kit-row">
          <button
            type="button"
            aria-pressed={pick.kind === 'daily'}
            disabled={!ready}
            onClick={() => load({ kind: 'daily', day: todayParts() })}
          >
            <CalendarDays size={15} aria-hidden="true" /> 今日数桥
            {dailyDone ? ' ✓' : ''}
          </button>
          <fieldset className="kit-row" aria-label="尺寸">
            {(Object.keys(HASHI_SIZES) as HashiSize[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={pick.kind === 'random' && pick.size === s}
                onClick={() =>
                  load({
                    kind: 'random',
                    size: s,
                    seed: Math.floor(Math.random() * 1e9),
                  })
                }
              >
                {SIZE_NAMES[s]}
              </button>
            ))}
          </fieldset>
        </div>
      </header>
      <div className="kit-row">
        <span className="kit-stats">
          <span>
            完成 <strong data-testid="hashi-done">{status.done}</strong>/
            {puzzle.islands.length}
          </span>
          <span>{status.connected ? '已连成一片' : '还没连成一片'}</span>
          <span>
            用时 <strong className="kit-mono">{fmt(doneIn ?? elapsed)}</strong>
          </span>
          {records.best[sizeKey] && (
            <span>本机最快 {fmt(records.best[sizeKey])}</span>
          )}
        </span>
        <button type="button" onClick={hint} disabled={doneIn !== null}>
          <Lightbulb size={15} aria-hidden="true" /> 提示 (H)
        </button>
        <button type="button" onClick={() => load(pick)} aria-label="重来">
          <RotateCcw size={15} aria-hidden="true" />
        </button>
        {pick.kind === 'random' && (
          <button
            type="button"
            onClick={() =>
              load({
                kind: 'random',
                size: pick.size,
                seed: Math.floor(Math.random() * 1e9),
              })
            }
          >
            <Shuffle size={15} aria-hidden="true" /> 换一题
          </button>
        )}
      </div>
      {doneIn !== null && (
        <GameResult
          tone="win"
          title={`全部连通！用时 ${fmt(doneIn)}`}
          actions={
            pick.kind === 'random'
              ? [
                  {
                    label: '换一题',
                    primary: true,
                    onClick: () =>
                      load({
                        kind: 'random',
                        size: pick.size,
                        seed: Math.floor(Math.random() * 1e9),
                      }),
                  },
                ]
              : []
          }
        >
          {hints ? `用了 ${hints} 次提示` : '没用提示'}
        </GameResult>
      )}

      <fieldset
        ref={boardRef}
        className="hashi-board"
        aria-label={`数桥棋盘 ${n}×${n}`}
        style={{ '--n': n } as React.CSSProperties}
      >
        <svg className="hashi-svg" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
          {puzzle.edges.map((e, i) => {
            const v = bridges[i] ?? 0;
            if (!v) return null;
            const a = puzzle.islands[e.a],
              b = puzzle.islands[e.b];
            const off = v === 2 ? 0.1 : 0;
            const ox = e.horizontal ? 0 : off,
              oy = e.horizontal ? off : 0;
            const cls = locked.has(i)
              ? 'hashi-bridge is-locked'
              : 'hashi-bridge';
            return (
              <g key={i} className={cls}>
                <line
                  x1={a.x + 0.5 - ox}
                  y1={a.y + 0.5 - oy}
                  x2={b.x + 0.5 - ox}
                  y2={b.y + 0.5 - oy}
                />
                {v === 2 && (
                  <line
                    x1={a.x + 0.5 + ox}
                    y1={a.y + 0.5 + oy}
                    x2={b.x + 0.5 + ox}
                    y2={b.y + 0.5 + oy}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {puzzle.islands.map((isl, k) => {
          const c = counts[k];
          const state = c > isl.n ? 'is-over' : c === isl.n ? 'is-done' : '';
          return (
            <button
              key={k}
              type="button"
              data-island={k}
              className={`hashi-island ${state}${selected === k ? ' is-selected' : ''}`}
              style={{ left: pct(isl.x), top: pct(isl.y) }}
              tabIndex={k === focus ? 0 : -1}
              aria-pressed={selected === k}
              aria-label={`第 ${isl.y + 1} 行第 ${isl.x + 1} 列的岛，需要 ${isl.n} 座桥，已有 ${c} 座${c > isl.n ? '，超了' : ''}`}
              onFocus={() => setFocus(k)}
              onPointerDown={(e) => onDown(e, k)}
              onPointerUp={(e) => onUp(e, k)}
              onClick={() => {
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                tapIsland(k);
              }}
              onKeyDown={(e) => onKey(e, k)}
            >
              {isl.n}
            </button>
          );
        })}
      </fieldset>
      <p className="kit-help">
        先点一座岛，再点同行或同列看得见的另一座岛，桥数按 0→1→2→0
        循环；也可以从岛上往某个方向滑一下。岛上的数字是它连出去的桥数，桥不能交叉，最后所有岛要连成一片。键盘：方向键在该方向加桥，Shift+方向键跳到那边的岛，H
        提示。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
