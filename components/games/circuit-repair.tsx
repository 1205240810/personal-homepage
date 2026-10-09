'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  CalendarDays,
  Check,
  Lightbulb,
  Lock,
  RotateCcw,
  Shuffle,
  Undo2,
  Zap,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  CIRCUIT_LEVELS,
  DEFAULT_CIRCUIT_SIZE,
  circuitHint,
  circuitPar,
  currentMasks,
  dailyCircuitSeed,
  degree,
  describeEdges,
  generateCircuit,
  isCircuitSolved,
  loadCircuitRecords,
  mergeCircuitRecord,
  saveCircuitRecords,
  tracePower,
  type CircuitPuzzle,
  type CircuitRecords,
  type CircuitSize,
} from '@/lib/games/circuit-repair';
import './circuit-repair.css';

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
// Deterministic board for SSR and the first hydration pass.
const PREVIEW_SEED = 20_260_101;

type Board = { size: CircuitSize; seed: number; daily: boolean };

function todayParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function dailyBoard(
  size: CircuitSize,
  today: ReturnType<typeof todayParts>,
): Board {
  return {
    size,
    seed: dailyCircuitSeed(today.year, today.month, today.day, size),
    daily: true,
  };
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CircuitRepair() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  // Same pattern as 信号接力: identical SSR/hydration markup, then a client
  // session that reads the date and local records once.
  return <CircuitDesk key={ready ? 'local' : 'preview'} ready={ready} />;
}

function CircuitDesk({ ready }: { ready: boolean }) {
  const [today] = useState(() => (ready ? todayParts() : null));
  const [loaded] = useState(() => (ready ? loadCircuitRecords() : null));
  const [records, setRecords] = useState<CircuitRecords>(
    () => loaded?.records ?? {},
  );
  const [storage, setStorage] = useState<
    'saved' | 'invalid' | 'unavailable' | 'empty'
  >(() => loaded?.status ?? 'empty');
  const [board, setBoard] = useState<Board>(() =>
    today
      ? dailyBoard(DEFAULT_CIRCUIT_SIZE, today)
      : { size: DEFAULT_CIRCUIT_SIZE, seed: PREVIEW_SEED, daily: false },
  );
  const puzzle = useMemo(
    () => generateCircuit(board.size, board.seed),
    [board.size, board.seed],
  );

  const pickSize = (size: CircuitSize) => {
    if (!ready || !today) return;
    setBoard(
      board.daily
        ? dailyBoard(size, today)
        : { size, seed: randomSeed(), daily: false },
    );
  };

  return (
    <section className="circuit-game" aria-labelledby="circuit-title">
      <header className="circuit-heading">
        <div>
          <span className="circuit-mono">MAINTENANCE BAY / WIRING</span>
          <h2 id="circuit-title">给机甲接回每一盏灯。</h2>
        </div>
        <Zap size={20} strokeWidth={1.5} aria-hidden="true" />
      </header>
      <p id="circuit-rule">
        点击线路块顺时针旋转，右键或 Shift +
        点击逆时针。让中央核心的电流流到每个端点，且没有任何断头。
      </p>
      <div className="circuit-console" aria-busy={!ready}>
        <div className="circuit-topline">
          <ToggleGroup
            disabled={!ready}
            value={[String(board.size)]}
            onValueChange={(v) => {
              if (v.length) pickSize(Number(v[0]) as CircuitSize);
            }}
            aria-label="选择线路规模"
            className="circuit-sizes"
          >
            {CIRCUIT_LEVELS.map((level) => (
              <ToggleGroupItem value={String(level.size)} key={level.size}>
                <span>{level.label}</span>
                <small>
                  {level.size} × {level.size}
                </small>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="circuit-board-switch">
          <span>
            {board.daily ? (
              <>
                <CalendarDays size={13} aria-hidden="true" />
                今日线路 · {today?.month} 月 {today?.day} 日
              </>
            ) : (
              <>线路编号 #{board.seed.toString(16).toUpperCase()}</>
            )}
          </span>
          <div>
            {!board.daily && (
              <button
                type="button"
                disabled={!ready}
                onClick={() => today && setBoard(dailyBoard(board.size, today))}
              >
                <CalendarDays size={14} aria-hidden="true" />
                回到今日
              </button>
            )}
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                setBoard({ size: board.size, seed: randomSeed(), daily: false })
              }
            >
              <Shuffle size={14} aria-hidden="true" />
              换一张
            </button>
          </div>
        </div>
        <CircuitSession
          key={`${puzzle.size}:${puzzle.seed}`}
          puzzle={puzzle}
          ready={ready}
          best={records[puzzle.size]}
          onSolved={(result) => {
            const next = mergeCircuitRecord(records, puzzle.size, result);
            setRecords(next);
            setStorage(saveCircuitRecords(next));
          }}
        />
      </div>
      <output className="circuit-storage">
        {!ready
          ? '正在接通检修台…'
          : storage === 'unavailable'
            ? '浏览器暂时无法保存记录，仍可继续玩。'
            : storage === 'invalid'
              ? '旧记录无法读取，已重新开始计分；新记录只保存在当前浏览器。'
              : '各尺寸的最佳用时与步数保存在当前浏览器；进行中的线路不存档。'}
      </output>
    </section>
  );
}

function randomSeed() {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

function CircuitSession({
  puzzle,
  ready,
  best,
  onSolved,
}: {
  puzzle: CircuitPuzzle;
  ready: boolean;
  best: CircuitRecords[CircuitSize];
  onSolved: (result: { seconds: number; moves: number }) => void;
}) {
  const { size, source } = puzzle;
  const [turns, setTurns] = useState(() => [...puzzle.scramble]);
  const [history, setHistory] = useState<number[]>([]);
  const [locked, setLocked] = useState<boolean[]>(() =>
    puzzle.solution.map(() => false),
  );
  const [lockMode, setLockMode] = useState(false);
  const [hint, setHint] = useState<{ index: number; turns: number } | null>(
    null,
  );
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState<number | null>(null);
  const [focus, setFocus] = useState(source);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  const masks = useMemo(() => currentMasks(puzzle, turns), [puzzle, turns]);
  const powered = useMemo(
    () => tracePower(size, masks, source),
    [size, masks, source],
  );
  const solved = finished !== null;
  const lit = powered.filter(Boolean).length;
  const lamps = puzzle.solution.filter(
    (m, i) => degree(m) === 1 && i !== source,
  );
  const litLamps = puzzle.solution.filter(
    (m, i) => degree(m) === 1 && i !== source && powered[i],
  ).length;
  const par = useMemo(() => circuitPar(puzzle), [puzzle]);
  const moves = history.length;
  const elapsed =
    finished ??
    (startedAt === null
      ? 0
      : Math.max(0, Math.floor((now - startedAt) / 1000)));

  useEffect(() => {
    if (startedAt === null || solved) return;
    const timer = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(timer);
  }, [startedAt, solved]);

  // `clock` is the event timestamp (ms since page load), matching the
  // performance.now() ticks used by the running timer.
  const rotate = (index: number, direction: 1 | -1, clock: number) => {
    if (!ready || solved) return;
    if (lockMode) {
      toggleLock(index);
      return;
    }
    if (locked[index]) return;
    const nextTurns = [...turns];
    nextTurns[index] += direction;
    const began = startedAt ?? clock;
    setTurns(nextTurns);
    setHistory([...history, direction * (index + 1)]);
    setHint(null);
    if (startedAt === null) setStartedAt(began);
    setNow(clock);
    if (isCircuitSolved(size, currentMasks(puzzle, nextTurns), source)) {
      const seconds = Math.max(1, Math.round((clock - began) / 1000));
      setFinished(seconds);
      onSolved({ seconds, moves: moves + 1 });
    }
  };

  const toggleLock = (index: number) => {
    if (!ready || solved) return;
    setLocked(locked.map((value, i) => (i === index ? !value : value)));
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!ready || solved || last === undefined) return;
    const index = Math.abs(last) - 1;
    const nextTurns = [...turns];
    nextTurns[index] -= Math.sign(last);
    setTurns(nextTurns);
    setHistory(history.slice(0, -1));
    setHint(null);
  };

  const reset = () => {
    setTurns([...puzzle.scramble]);
    setHistory([]);
    setLocked(puzzle.solution.map(() => false));
    setHint(null);
    setHintsUsed(0);
    setStartedAt(null);
    setFinished(null);
    cells.current[source]?.focus();
  };

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const r = Math.floor(index / size);
    const c = index % size;
    const target =
      event.key === 'ArrowUp'
        ? r > 0 && index - size
        : event.key === 'ArrowDown'
          ? r < size - 1 && index + size
          : event.key === 'ArrowLeft'
            ? c > 0 && index - 1
            : event.key === 'ArrowRight'
              ? c < size - 1 && index + 1
              : null;
    if (event.key === 'l' || event.key === 'L') {
      event.preventDefault();
      toggleLock(index);
      return;
    }
    if (target === null) return;
    event.preventDefault();
    if (target === false) return;
    setFocus(target);
    cells.current[target]?.focus();
  };

  return (
    <div className={`circuit-play ${solved ? 'is-solved' : ''}`}>
      <div className="circuit-stats">
        <span>
          <strong>{String(moves).padStart(2, '0')}</strong> 步
        </span>
        <span>
          <strong>{formatTime(elapsed)}</strong>
        </span>
        <span>
          <strong>
            {litLamps}/{lamps.length}
          </strong>{' '}
          灯
        </span>
      </div>
      <fieldset
        className="circuit-board"
        data-size={size}
        style={{ '--circuit-size': size } as CSSProperties}
        aria-label={`${size} × ${size} 线路板，已通电 ${lit} / ${size * size} 块`}
        aria-describedby="circuit-rule"
      >
        {puzzle.solution.map((shape, index) => {
          const isSource = index === source;
          const isLamp = !isSource && degree(shape) === 1;
          const on = powered[index];
          const r = Math.floor(index / size) + 1;
          const c = (index % size) + 1;
          return (
            <button
              key={index}
              ref={(node) => {
                cells.current[index] = node;
              }}
              type="button"
              tabIndex={index === focus ? 0 : -1}
              className={[
                'circuit-cell',
                on ? 'is-on' : '',
                isSource ? 'is-source' : '',
                isLamp ? 'is-lamp' : '',
                locked[index] ? 'is-locked' : '',
                hint?.index === index ? 'is-hint' : '',
              ].join(' ')}
              style={{ '--delay': `${(r + c) * 40}ms` } as CSSProperties}
              aria-label={`第 ${r} 行第 ${c} 列，${
                isSource ? '电源核心' : isLamp ? '端点灯' : shapeName(shape)
              }，接口朝${describeEdges(masks[index])}，${on ? '已通电' : '未通电'}${
                locked[index] ? '，已锁定' : ''
              }${hint?.index === index ? `，建议顺时针转 ${hint.turns} 次` : ''}`}
              aria-disabled={!ready || solved || undefined}
              onFocus={() => setFocus(index)}
              onClick={(event) =>
                rotate(index, event.shiftKey ? -1 : 1, event.timeStamp)
              }
              onContextMenu={(event) => {
                event.preventDefault();
                rotate(index, -1, event.timeStamp);
              }}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <g
                  className="circuit-wire"
                  style={{ transform: `rotate(${turns[index] * 90}deg)` }}
                >
                  {shape & 1 ? <line x1="50" y1="50" x2="50" y2="-2" /> : null}
                  {shape & 2 ? <line x1="50" y1="50" x2="102" y2="50" /> : null}
                  {shape & 4 ? <line x1="50" y1="50" x2="50" y2="102" /> : null}
                  {shape & 8 ? <line x1="50" y1="50" x2="-2" y2="50" /> : null}
                  {isSource ? (
                    <rect
                      className="circuit-core"
                      x="30"
                      y="30"
                      width="40"
                      height="40"
                      rx="7"
                    />
                  ) : isLamp ? (
                    <circle className="circuit-bulb" cx="50" cy="50" r="17" />
                  ) : (
                    <circle className="circuit-joint" cx="50" cy="50" r="8" />
                  )}
                </g>
              </svg>
              {locked[index] && (
                <Lock className="circuit-lock" size={11} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </fieldset>
      <output className="circuit-feedback" aria-live="polite">
        {solved ? (
          <>
            <Check size={15} aria-hidden="true" />
            全部接通！{moves} 步，用时 {formatTime(elapsed)}
            {hintsUsed ? `，用了 ${hintsUsed} 次提示` : ''}
            {moves <= par ? '，达到参考步数。' : `；参考步数 ${par}。`}
          </>
        ) : hint ? (
          `试试第 ${Math.floor(hint.index / size) + 1} 行第 ${(hint.index % size) + 1} 列，再顺时针转 ${hint.turns} 次${locked[hint.index] ? '（它被锁定了，先解锁）' : ''}。`
        ) : lockMode ? (
          '锁定模式：点击线路块锁定或解锁，锁定的块不会被误转。'
        ) : (
          `核心已带动 ${lit} / ${size * size} 块线路。参考步数 ${par}。`
        )}
      </output>
      <div className="circuit-actions">
        <button
          type="button"
          aria-label="撤回上一次旋转"
          disabled={!ready || solved || moves === 0}
          onClick={undo}
        >
          <Undo2 size={15} aria-hidden="true" />
          撤回
        </button>
        <button
          type="button"
          aria-pressed={lockMode}
          className={lockMode ? 'is-active' : ''}
          disabled={!ready || solved}
          onClick={() => setLockMode(!lockMode)}
        >
          <Lock size={15} aria-hidden="true" />
          锁定
        </button>
        <button
          type="button"
          disabled={!ready || solved}
          onClick={() => {
            const next = circuitHint(puzzle, turns);
            if (!next) return;
            if (hint?.index !== next.index) setHintsUsed(hintsUsed + 1);
            setHint(next);
            setFocus(next.index);
            cells.current[next.index]?.focus();
          }}
        >
          <Lightbulb size={15} aria-hidden="true" />
          提示
        </button>
        <button
          type="button"
          aria-label="把当前线路恢复到初始状态"
          disabled={!ready || (moves === 0 && !solved)}
          onClick={reset}
        >
          <RotateCcw size={15} aria-hidden="true" />
          重来
        </button>
      </div>
      <div className="circuit-progress">
        <span>
          {CIRCUIT_LEVELS.find((l) => l.size === size)?.label} · {size} × {size}
        </span>
        <span>
          {best
            ? `最佳 ${formatTime(best.seconds)} · ${best.moves} 步 · 已修好 ${best.solved} 次`
            : '还没有这个尺寸的记录'}
        </span>
      </div>
    </div>
  );
}

function shapeName(mask: number) {
  const d = degree(mask);
  if (d === 3) return 'T 形接头';
  if (d === 4) return '十字接头';
  return mask === 5 || mask === 10 ? '直线' : '弯角';
}
