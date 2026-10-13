'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  CalendarDays,
  Eraser,
  Lightbulb,
  RotateCcw,
  Shuffle,
} from 'lucide-react';
import { dailyKey, todayParts } from '@/lib/games/kit';
import {
  HANDCRAFTED,
  LASER_RECORDS_KEY,
  SIZES,
  SOURCE_DIR,
  charPiece,
  dailyLaser,
  dims,
  emptyLaserRecords,
  generateLevel,
  hint,
  mergeLaserRecord,
  placementsAllowed,
  starsFor,
  trace,
  validateLaserRecords,
  type Level,
  type Piece,
  type PieceKind,
  type Placements,
  type Size,
} from '@/lib/games/laser';
import { useHydrated, useLocalRecords } from './kit';
import './kit.css';
import './laser.css';

type Mode =
  | { kind: 'hand'; index: number }
  | { kind: 'random'; size: Size; seed: number }
  | { kind: 'daily' };
type Tool = PieceKind | 'erase';
const EMPTY_RECORDS = emptyLaserRecords();

function levelFor(mode: Mode, ready: boolean): Level {
  if (mode.kind === 'hand') return HANDCRAFTED[mode.index];
  if (mode.kind === 'random') return generateLevel(mode.size, mode.seed);
  return ready ? dailyLaser(todayParts()) : HANDCRAFTED[0];
}
const describe = (level: Level, placed: Placements, i: number) => {
  const { width } = dims(level);
  const c = level.grid[Math.floor(i / width)][i % width];
  const p = placed.get(i) ?? charPiece(c);
  if (p) {
    const name = p.kind === 'mirror' ? '镜子' : '分光镜';
    return `${placed.has(i) ? '' : '固定'}${name}（${p.ori ? '\\' : '/'}）`;
  }
  if (c === '#') return '墙';
  if (c === 'T') return '目标';
  if (c in SOURCE_DIR) return '激光源';
  return '空格';
};

export function LaserMirrors() {
  const ready = useHydrated();
  const [records, saveRecords] = useLocalRecords(
    LASER_RECORDS_KEY,
    validateLaserRecords,
    EMPTY_RECORDS,
  );
  const [mode, setMode] = useState<Mode>({ kind: 'hand', index: 0 });
  const [level, setLevel] = useState<Level>(HANDCRAFTED[0]);
  const [placed, setPlaced] = useState<Placements>(() => new Map());
  const [tool, setTool] = useState<Tool>('mirror');
  const [hints, setHints] = useState(0);
  const [locked, setLocked] = useState<Set<number>>(() => new Set());
  const [focus, setFocus] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [size, setSize] = useState<Size>('medium');
  const gridRef = useRef<HTMLFieldSetElement>(null);

  const { width, height } = dims(level);
  const t = trace(level, placed);
  const used = placed.size;
  const mirrorsLeft =
    level.mirrors -
    [...placed.values()].filter((p) => p.kind === 'mirror').length;
  const splitLeft =
    level.splitters -
    [...placed.values()].filter((p) => p.kind === 'split').length;
  const stars = t.solved ? starsFor(level, used, hints) : 0;
  const today = ready ? todayParts() : null;
  const dailyDone = !!today && records.daily.includes(dailyKey(today));

  function load(next: Mode, replay?: Level) {
    setMode(next);
    setLevel(replay ?? levelFor(next, ready));
    setPlaced(new Map());
    setHints(0);
    setLocked(new Set());
    setFocus(0);
    setAnnounce('');
  }
  function commit(next: Placements, message: string, nextHints = hints) {
    const check = placementsAllowed(level, next);
    if (!check.ok) {
      setAnnounce(check.reason);
      return;
    }
    setPlaced(next);
    const after = trace(level, next);
    if (after.solved) {
      const s = starsFor(level, next.size, nextHints);
      saveRecords(mergeLaserRecord(records, level.id, s));
      setAnnounce(`全部点亮！${s} 星`);
    } else
      setAnnounce(`${message}。点亮 ${after.hit.size}/${after.targets} 个目标`);
  }
  function act(i: number, remove = false) {
    const x = i % width,
      y = Math.floor(i / width);
    if (level.grid[y][x] !== '.') {
      setAnnounce(`${describe(level, placed, i)}，不能放`);
      return;
    }
    if (locked.has(i)) {
      setAnnounce('提示放下的镜子已锁定');
      return;
    }
    const next = new Map(placed);
    const mine = placed.get(i);
    if (remove || tool === 'erase') {
      if (!mine) return;
      next.delete(i);
      commit(next, '已移除');
      return;
    }
    if (mine && mine.kind === tool) {
      next.set(i, { kind: mine.kind, ori: mine.ori ? 0 : 1 });
      commit(next, '已旋转');
      return;
    }
    next.set(i, { kind: tool, ori: 0 } as Piece);
    commit(next, `放下${tool === 'mirror' ? '镜子' : '分光镜'}`);
  }
  function takeHint() {
    if (t.solved) return;
    const h = hint(level, placed);
    if (!h) return;
    const next = new Map(placed);
    // Make room if the inventory is full.
    if (
      placementsAllowed(level, new Map(next).set(h.index, h.piece)).ok === false
    )
      for (const [i, p] of next)
        if (p.kind === h.piece.kind && !locked.has(i)) {
          next.delete(i);
          break;
        }
    next.set(h.index, h.piece);
    setHints(hints + 1);
    setLocked(new Set(locked).add(h.index));
    commit(
      next,
      `提示：第 ${Math.floor(h.index / width) + 1} 行第 ${(h.index % width) + 1} 列放${h.piece.kind === 'mirror' ? '镜子' : '分光镜'}`,
      hints + 1,
    );
  }
  function nextLevel() {
    if (mode.kind === 'hand' && mode.index < HANDCRAFTED.length - 1)
      load({ kind: 'hand', index: mode.index + 1 });
    else load({ kind: 'random', size, seed: Math.floor(Math.random() * 1e9) });
  }
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    let n = focus;
    if (k === 'ArrowRight') n = Math.min(width * height - 1, focus + 1);
    else if (k === 'ArrowLeft') n = Math.max(0, focus - 1);
    else if (k === 'ArrowDown') n = Math.min(width * height - 1, focus + width);
    else if (k === 'ArrowUp') n = Math.max(0, focus - width);
    else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      act(focus);
      return;
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      act(focus, true);
      return;
    } else if (k === 'm' || k === 'M') return setTool('mirror');
    else if (k === 's' || k === 'S') return setTool('split');
    else if (k === 'e' || k === 'E') return setTool('erase');
    else if (k === 'h' || k === 'H') return takeHint();
    else return;
    e.preventDefault();
    setFocus(n);
    (gridRef.current?.children[n] as HTMLElement | undefined)?.focus();
  }

  const levelName =
    mode.kind === 'hand'
      ? `第 ${mode.index + 1} 关 · ${level.name}`
      : mode.kind === 'daily'
        ? '今日光路'
        : `随机 ${SIZES[mode.size].name}`;

  return (
    <div className="kit laser">
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            LASER · {width}×{height}
          </p>
          <h2>光线反射</h2>
        </div>
        <div className="kit-row">
          <button
            type="button"
            aria-pressed={mode.kind === 'daily'}
            disabled={!ready}
            onClick={() => load({ kind: 'daily' })}
          >
            <CalendarDays size={15} aria-hidden="true" /> 今日光路
            {dailyDone ? ' ✓' : ''}
          </button>
          <select
            aria-label="随机关卡尺寸"
            value={size}
            onChange={(e) => setSize(e.target.value as Size)}
          >
            {(Object.keys(SIZES) as Size[]).map((s) => (
              <option key={s} value={s}>
                {SIZES[s].name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              load({
                kind: 'random',
                size,
                seed: Math.floor(Math.random() * 1e9),
              })
            }
          >
            <Shuffle size={15} aria-hidden="true" /> 随机一关
          </button>
        </div>
      </header>

      <fieldset className="laser-levels kit-row" aria-label="手工关卡">
        {HANDCRAFTED.map((l, i) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={mode.kind === 'hand' && mode.index === i}
            onClick={() => load({ kind: 'hand', index: i })}
            aria-label={`第 ${i + 1} 关 ${l.name}${records.stars[l.id] ? `，最佳 ${records.stars[l.id]} 星` : ''}`}
          >
            {i + 1}
            <small aria-hidden="true">
              {'★'.repeat(records.stars[l.id] ?? 0) || '·'}
            </small>
          </button>
        ))}
      </fieldset>

      <div className="kit-brief">
        <p>
          <strong>{levelName}</strong> 用镜子和分光镜让激光点亮全部 {t.targets}{' '}
          个目标。参考解 {level.par} 块，不一定是最少件数。
        </p>
        <p className="kit-stats">
          <span>
            点亮 <strong data-testid="laser-hit">{t.hit.size}</strong>/
            {t.targets}
          </span>
          <span>
            镜子 <strong>{mirrorsLeft}</strong>
          </span>
          <span>
            分光镜 <strong>{splitLeft}</strong>
          </span>
          <span>
            提示 <strong>{hints}</strong>
          </span>
        </p>
        {t.solved && (
          <output className="kit-ok laser-done">
            全部点亮！{'★'.repeat(stars)}
            {'☆'.repeat(3 - stars)}（用了 {used} 块
            {hints ? `，${hints} 次提示` : ''}）
            <button type="button" className="kit-primary" onClick={nextLevel}>
              下一关
            </button>
          </output>
        )}
      </div>

      <div className="kit-row" role="toolbar" aria-label="工具">
        <button
          type="button"
          aria-pressed={tool === 'mirror'}
          onClick={() => setTool('mirror')}
        >
          <span className="laser-icon" aria-hidden="true">
            ／
          </span>{' '}
          镜子 (M)
        </button>
        <button
          type="button"
          aria-pressed={tool === 'split'}
          onClick={() => setTool('split')}
          disabled={level.splitters === 0}
        >
          <span className="laser-icon" aria-hidden="true">
            ⧄
          </span>{' '}
          分光镜 (S)
        </button>
        <button
          type="button"
          aria-pressed={tool === 'erase'}
          onClick={() => setTool('erase')}
        >
          <Eraser size={15} aria-hidden="true" /> 移除 (E)
        </button>
        <button type="button" onClick={takeHint} disabled={t.solved}>
          <Lightbulb size={15} aria-hidden="true" /> 提示 (H)
        </button>
        <button
          type="button"
          onClick={() => load(mode, level)}
          aria-label="重来"
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
      </div>

      <div
        className="laser-board"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <svg
          className="laser-svg"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
        >
          {level.grid.map((row, y) =>
            row.split('').map((c, x) => {
              const i = y * width + x;
              const p = placed.get(i) ?? charPiece(c);
              const k = `${x}-${y}`;
              if (c === '#')
                return (
                  <rect
                    key={k}
                    className="laser-wall"
                    x={x + 0.06}
                    y={y + 0.06}
                    width={0.88}
                    height={0.88}
                    rx={0.08}
                  />
                );
              if (c === 'T')
                return (
                  <circle
                    key={k}
                    className={
                      t.hit.has(i) ? 'laser-target is-hit' : 'laser-target'
                    }
                    cx={x + 0.5}
                    cy={y + 0.5}
                    r={0.28}
                  />
                );
              if (c in SOURCE_DIR) {
                const rot = SOURCE_DIR[c] * 90;
                return (
                  <polygon
                    key={k}
                    className="laser-source"
                    points="-0.3,0.3 0,-0.35 0.3,0.3"
                    transform={`translate(${x + 0.5} ${y + 0.5}) rotate(${rot})`}
                  />
                );
              }
              if (!p) return null;
              const cls = `laser-piece is-${p.kind}${placed.has(i) ? ' is-mine' : ''}${locked.has(i) ? ' is-locked' : ''}`;
              return (
                <g key={k} className={cls}>
                  {p.kind === 'split' && (
                    <rect
                      x={x + 0.2}
                      y={y + 0.2}
                      width={0.6}
                      height={0.6}
                      rx={0.06}
                    />
                  )}
                  <line
                    x1={x + 0.15}
                    y1={p.ori ? y + 0.15 : y + 0.85}
                    x2={x + 0.85}
                    y2={p.ori ? y + 0.85 : y + 0.15}
                  />
                </g>
              );
            }),
          )}
          {t.segments.map((s, n) => (
            <line
              key={n}
              className="laser-beam"
              x1={s.x1 + 0.5}
              y1={s.y1 + 0.5}
              x2={s.x2 + 0.5}
              y2={s.y2 + 0.5}
            />
          ))}
        </svg>
        <fieldset
          ref={gridRef}
          className="laser-grid"
          aria-label={`${levelName} 棋盘`}
          style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}
        >
          {Array.from({ length: width * height }, (_, i) => (
            <button
              key={i}
              type="button"
              onKeyDown={onKey}
              tabIndex={i === focus ? 0 : -1}
              aria-label={`第 ${Math.floor(i / width) + 1} 行第 ${(i % width) + 1} 列，${describe(level, placed, i)}${t.lit.has(i) ? '，有光' : ''}`}
              onFocus={() => setFocus(i)}
              onClick={() => act(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                act(i, true);
              }}
            />
          ))}
        </fieldset>
      </div>
      <p className="kit-help">
        点空格放镜子，再点一下旋转 90°；右键或 Delete
        移除。键盘：方向键移动，回车/空格放置或旋转，M/S/E 切换工具，H
        提示。光会穿过目标继续前进；分光镜让光一半直行、一半转弯。
        不用提示且用块数不超过参考解可得三星，更省的解同样有效。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
