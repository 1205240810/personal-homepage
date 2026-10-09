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
  Eraser,
  Lightbulb,
  Radar,
  Shuffle,
  Stethoscope,
  TriangleAlert,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  FAULT_LEVELS,
  MARK_FAULT,
  MARK_OK,
  MODULE_NAMES,
  UNKNOWN,
  checkDiagnosis,
  cycleMark,
  dailyFaultSeed,
  dailyKey,
  emptyFaultRecords,
  faultHint,
  generateFaultPuzzle,
  getFaultLevel,
  isFaultLevelId,
  loadFaultRecords,
  mergeFaultRecord,
  saveFaultRecords,
  sensorState,
  type FaultHint,
  type FaultLevelId,
  type FaultPuzzle,
  type FaultRecords,
  type ModuleMark,
  type Sensor,
} from '@/lib/games/fault-finder';
import './fault-finder.css';

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
// Deterministic puzzle for SSR and the first hydration pass.
const PREVIEW_SEED = 20_261_009;
const DEFAULT_LEVEL: FaultLevelId = 'tech';

type Board = { level: FaultLevelId; seed: number; daily: boolean };
type Today = { year: number; month: number; day: number };

function todayParts(): Today {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}
function dailyBoard(level: FaultLevelId, today: Today): Board {
  return {
    level,
    seed: dailyFaultSeed(today.year, today.month, today.day, level),
    daily: true,
  };
}
function randomSeed() {
  return Math.floor(Math.random() * 0x1_0000_0000);
}
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
const pos = (cell: number, size: number) =>
  `第 ${Math.floor(cell / size) + 1} 行第 ${(cell % size) + 1} 列`;

function sensorName(sensor: Sensor, size: number) {
  if (sensor.kind === 'row') return `第 ${sensor.at + 1} 行总线`;
  if (sensor.kind === 'col') return `第 ${sensor.at + 1} 列支路`;
  const r = Math.floor(sensor.at / size) + 1;
  const c = (sensor.at % size) + 1;
  return `第 ${r}–${r + 1} 行、第 ${c}–${c + 1} 列节点`;
}

export function FaultFinder() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  return <FaultDesk key={ready ? 'local' : 'preview'} ready={ready} />;
}

function FaultDesk({ ready }: { ready: boolean }) {
  const [today] = useState(() => (ready ? todayParts() : null));
  const [loaded] = useState(() => (ready ? loadFaultRecords() : null));
  const [records, setRecords] = useState<FaultRecords>(
    () => loaded?.records ?? emptyFaultRecords(),
  );
  const [storage, setStorage] = useState(() => loaded?.status ?? 'empty');
  const [board, setBoard] = useState<Board>(() =>
    today
      ? dailyBoard(DEFAULT_LEVEL, today)
      : { level: DEFAULT_LEVEL, seed: PREVIEW_SEED, daily: false },
  );
  const puzzle = useMemo(
    () => generateFaultPuzzle(board.level, board.seed),
    [board.level, board.seed],
  );
  const [round, setRound] = useState(0);
  const todayKey = today && board.daily ? dailyKey(today, board.level) : null;

  const pickLevel = (level: FaultLevelId) => {
    if (!ready || !today) return;
    setBoard(
      board.daily
        ? dailyBoard(level, today)
        : { level, seed: randomSeed(), daily: false },
    );
  };

  return (
    <section className="fault-game" aria-labelledby="fault-title">
      <header className="fault-heading">
        <div>
          <span className="fault-mono">DIAGNOSTIC PANEL / SENSOR LOGIC</span>
          <h2 id="fault-title">读传感器，揪出故障模块。</h2>
        </div>
        <Stethoscope size={20} strokeWidth={1.5} aria-hidden="true" />
      </header>
      <p id="fault-rule">
        每个传感器显示它连着的模块里有几个故障：右侧读整行总线，下方读整列支路，格点上的圆点读周围
        2 × 2 节点。点模块在「故障 → 正常 →
        未判断」之间切换，标出全部故障后提交诊断。每张题只有一个答案，不用猜。
      </p>
      <div className="fault-console" aria-busy={!ready}>
        <ToggleGroup
          disabled={!ready}
          value={[board.level]}
          onValueChange={(v) => {
            if (v.length && isFaultLevelId(v[0])) pickLevel(v[0]);
          }}
          aria-label="选择排查难度"
          className="fault-levels"
        >
          {FAULT_LEVELS.map((level) => (
            <ToggleGroupItem value={level.id} key={level.id}>
              <span>{level.label}</span>
              <small>
                {level.size}×{level.size} · {level.faults} 故障
              </small>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="fault-board-switch">
          <span>
            {board.daily ? (
              <>
                <CalendarDays size={13} aria-hidden="true" />
                今日排查 · {today?.month} 月 {today?.day} 日
                {todayKey && records.daily.includes(todayKey) ? (
                  <b className="fault-daily-done">已完成</b>
                ) : null}
              </>
            ) : (
              <>工单编号 #{board.seed.toString(16).toUpperCase()}</>
            )}
          </span>
          <div>
            {!board.daily && (
              <button
                type="button"
                disabled={!ready}
                onClick={() =>
                  today && setBoard(dailyBoard(board.level, today))
                }
              >
                <CalendarDays size={14} aria-hidden="true" />
                回到今日
              </button>
            )}
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                setBoard({
                  level: board.level,
                  seed: randomSeed(),
                  daily: false,
                })
              }
            >
              <Shuffle size={14} aria-hidden="true" />
              换一张
            </button>
          </div>
        </div>
        <FaultSession
          key={`${puzzle.level}:${puzzle.seed}:${round}`}
          puzzle={puzzle}
          ready={ready}
          best={records.best[puzzle.level]}
          onRetry={() => setRound(round + 1)}
          onWin={(result) => {
            const next = mergeFaultRecord(records, puzzle.level, {
              ...result,
              dailyKey: todayKey ?? undefined,
            });
            setRecords(next);
            setStorage(saveFaultRecords(next));
          }}
        />
      </div>
      <output className="fault-storage">
        {!ready
          ? '正在接通诊断面板…'
          : storage === 'unavailable'
            ? '浏览器暂时无法保存记录，仍可继续玩。'
            : storage === 'invalid'
              ? '旧记录无法读取，已重新开始计分；新记录只保存在当前浏览器。'
              : '各难度的最佳用时、通关次数和今日完成情况保存在当前浏览器；进行中的排查不存档。'}
      </output>
    </section>
  );
}

type Status = 'playing' | 'won' | 'lost';

function FaultSession({
  puzzle,
  ready,
  best,
  onRetry,
  onWin,
}: {
  puzzle: FaultPuzzle;
  ready: boolean;
  best: FaultRecords['best'][FaultLevelId];
  onRetry: () => void;
  onWin: (result: { seconds: number; clean: boolean }) => void;
}) {
  const level = getFaultLevel(puzzle.level);
  const { size } = puzzle;
  const [marks, setMarks] = useState<ModuleMark[]>(() =>
    Array<ModuleMark>(size * size).fill(UNKNOWN),
  );
  const [status, setStatus] = useState<Status>('playing');
  const [strikes, setStrikes] = useState(0);
  const [hints, setHints] = useState(0);
  const [hint, setHint] = useState<FaultHint | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState<number | null>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  const over = status !== 'playing';
  const elapsed =
    finished ??
    (startedAt === null
      ? 0
      : Math.max(0, Math.floor((now - startedAt) / 1000)));
  const marked = marks.filter((m) => m === MARK_FAULT).length;
  const truth = useMemo(() => new Set(puzzle.faults), [puzzle.faults]);
  const states = puzzle.sensors.map((sensor, i) =>
    sensorState(sensor, puzzle.readings[i], marks),
  );
  const litCells = new Set(lit === null ? [] : puzzle.sensors[lit].cells);

  useEffect(() => {
    if (startedAt === null || over) return;
    const timer = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(timer);
  }, [startedAt, over]);

  const touch = (clock: number) => {
    if (startedAt === null) setStartedAt(clock);
    setNow(clock);
  };
  // Functional update: several clicks in one frame must not overwrite each other.
  const setMark = (
    cell: number,
    change: (mark: ModuleMark) => ModuleMark,
    clock: number,
  ) => {
    if (!ready || over) return;
    setMarks((prev) => {
      const mark = change(prev[cell]);
      if (prev[cell] === mark) return prev;
      const next = [...prev];
      next[cell] = mark;
      return next;
    });
    setHint(null);
    setMessage(null);
    touch(clock);
  };

  const submit = (clock: number) => {
    if (!ready || over) return;
    const result = checkDiagnosis(puzzle, marks);
    if (!result.ready) return;
    touch(clock);
    const began = startedAt ?? clock;
    const seconds = Math.max(1, Math.round((clock - began) / 1000));
    if (result.correct) {
      setStatus('won');
      setFinished(seconds);
      setMessage(null);
      onWin({ seconds, clean: strikes === 0 && hints === 0 });
      return;
    }
    const used = strikes + 1;
    setStrikes(used);
    if (used >= level.strikes) {
      setStatus('lost');
      setFinished(seconds);
      setMessage(null);
    } else
      setMessage(
        `诊断有误：标出的 ${marked} 个模块里有 ${result.found} 个是真故障。还能再提交 ${level.strikes - used} 次。`,
      );
  };

  const askHint = (clock: number) => {
    if (!ready || over) return;
    const next = faultHint(puzzle, marks);
    if (!next) return;
    setHint(next);
    setHints(hints + 1);
    setMessage(null);
    touch(clock);
    if (next.type === 'zero') setLit(next.sensor);
    setFocus(next.cell);
    cells.current[next.cell]?.focus();
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const r = Math.floor(index / size);
    const c = index % size;
    const key = event.key.toLowerCase();
    if (key === 'f' || key === 'x' || key === 'h') {
      event.preventDefault();
      const target = key === 'f' ? MARK_FAULT : MARK_OK;
      setMark(
        index,
        (mark) => (mark === target ? UNKNOWN : target),
        event.timeStamp,
      );
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      setMark(index, () => UNKNOWN, event.timeStamp);
      return;
    }
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
    if (target === null) return;
    event.preventDefault();
    if (target === false) return;
    setFocus(target);
    cells.current[target]?.focus();
  };

  const cellLabel = (index: number) => {
    const name = MODULE_NAMES[index];
    let state =
      marks[index] === MARK_FAULT
        ? '标记为故障'
        : marks[index] === MARK_OK
          ? '标记为正常'
          : '未判断';
    if (status === 'lost' && truth.has(index)) state += '，真正的故障';
    if (status === 'won' && truth.has(index)) state = '故障，已确认';
    if (hint?.cell === index) state += '，提示所指';
    return `${pos(index, size)}，${name}，${state}`;
  };

  const sensorButton = (sensor: Sensor, i: number) => {
    const { state, marked: m } = states[i];
    const reading = puzzle.readings[i];
    return (
      <button
        key={sensor.id}
        type="button"
        className={`fault-sensor is-${sensor.kind} is-${state} ${lit === i ? 'is-lit' : ''}`}
        style={
          sensor.kind === 'node'
            ? ({
                '--node-r': Math.floor(sensor.at / size) + 1,
                '--node-c': (sensor.at % size) + 1,
              } as CSSProperties)
            : undefined
        }
        aria-pressed={lit === i}
        aria-label={`${sensorName(sensor, size)}传感器，读数 ${reading}，已标故障 ${m}${state === 'conflict' ? '，与标记矛盾' : state === 'satisfied' ? '，已满足' : ''}`}
        onClick={() => setLit(lit === i ? null : i)}
      >
        {reading}
      </button>
    );
  };

  const rowSensors = Array.from({ length: size }, (_, r) =>
    puzzle.sensors.findIndex((s) => s.kind === 'row' && s.at === r),
  );
  const colSensors = Array.from({ length: size }, (_, c) =>
    puzzle.sensors.findIndex((s) => s.kind === 'col' && s.at === c),
  );

  const hintText = (h: FaultHint) =>
    h.type === 'wrong'
      ? `${pos(h.cell, size)}的${MODULE_NAMES[h.cell]}标错了，再想想。`
      : h.type === 'zero'
        ? `${sensorName(puzzle.sensors[h.sensor], size)}读数是 0，所以${pos(h.cell, size)}的${MODULE_NAMES[h.cell]}一定正常。`
        : `${pos(h.cell, size)}的${MODULE_NAMES[h.cell]}${h.fault ? '是故障模块' : '是正常的'}。`;

  return (
    <div className={`fault-play is-${status}`}>
      <div className="fault-stats">
        <span>
          <strong>
            {marked}/{puzzle.faults.length}
          </strong>{' '}
          已标故障
        </span>
        <span>
          <strong>{formatTime(elapsed)}</strong>
        </span>
        <span title="诊断错误次数上限">
          <strong>{level.strikes - strikes}</strong> 次提交机会
        </span>
      </div>
      <div
        className="fault-bay"
        style={{ '--fault-size': size } as CSSProperties}
      >
        <div className="fault-grid-wrap">
          <fieldset
            className="fault-grid"
            aria-label={`${size} × ${size} 模块舱`}
            aria-describedby="fault-rule"
          >
            {marks.map((mark, index) => (
              <button
                key={index}
                ref={(node) => {
                  cells.current[index] = node;
                }}
                type="button"
                tabIndex={index === focus ? 0 : -1}
                className={[
                  'fault-cell',
                  mark === MARK_FAULT ? 'is-fault' : '',
                  mark === MARK_OK ? 'is-ok' : '',
                  litCells.has(index) ? 'is-lit' : '',
                  hint?.cell === index ? 'is-hint' : '',
                  over && truth.has(index) ? 'is-truth' : '',
                  status === 'lost' && mark === MARK_FAULT && !truth.has(index)
                    ? 'is-wrong'
                    : '',
                ].join(' ')}
                aria-label={cellLabel(index)}
                aria-disabled={!ready || over || undefined}
                onFocus={() => setFocus(index)}
                onClick={(event) => setMark(index, cycleMark, event.timeStamp)}
                onKeyDown={(event) => onKey(event, index)}
              >
                <span className="fault-name">{MODULE_NAMES[index]}</span>
                {mark === MARK_FAULT && (
                  <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
                )}
                {mark === MARK_OK && (
                  <Check size={16} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            ))}
          </fieldset>
          <div className="fault-nodes">
            {puzzle.sensors.map((sensor, i) =>
              sensor.kind === 'node' ? sensorButton(sensor, i) : null,
            )}
          </div>
        </div>
        <fieldset className="fault-rows" aria-label="行总线传感器">
          {rowSensors.map((i, r) =>
            i >= 0 ? (
              sensorButton(puzzle.sensors[i], i)
            ) : (
              <span
                key={`row-${r}`}
                className="fault-slot"
                aria-hidden="true"
              />
            ),
          )}
        </fieldset>
        <fieldset className="fault-cols" aria-label="列支路传感器">
          {colSensors.map((i, c) =>
            i >= 0 ? (
              sensorButton(puzzle.sensors[i], i)
            ) : (
              <span
                key={`col-${c}`}
                className="fault-slot"
                aria-hidden="true"
              />
            ),
          )}
        </fieldset>
      </div>
      <output className="fault-feedback" aria-live="polite">
        {status === 'won' ? (
          <>
            <Check size={15} aria-hidden="true" />
            诊断正确！用时 {formatTime(elapsed)}
            {strikes || hints
              ? `（误诊 ${strikes} 次、提示 ${hints} 次）。`
              : '，一次命中、零提示。'}
          </>
        ) : status === 'lost' ? (
          '提交机会用完了。真正的故障模块已用红框标出，可以重试本张或换一张。'
        ) : message ? (
          message
        ) : hint ? (
          hintText(hint)
        ) : states.some((s) => s.state === 'conflict') ? (
          '有传感器和你的标记对不上（红色圆点），检查一下。'
        ) : marked === puzzle.faults.length ? (
          '故障数已标满，可以提交诊断。'
        ) : (
          `点传感器可高亮它连着的模块。还要找出 ${puzzle.faults.length - marked} 个故障。`
        )}
      </output>
      <div className="fault-actions">
        <button
          type="button"
          className="fault-submit"
          disabled={!ready || over || marked !== puzzle.faults.length}
          onClick={(event) => submit(event.timeStamp)}
        >
          <Radar size={15} aria-hidden="true" />
          提交诊断
        </button>
        <button
          type="button"
          disabled={!ready || over}
          onClick={(event) => askHint(event.timeStamp)}
        >
          <Lightbulb size={15} aria-hidden="true" />
          提示
        </button>
        <button
          type="button"
          aria-label={over ? '重试本张，故障位置不变' : '清空全部标记'}
          disabled={!ready || (!over && marks.every((m) => m === UNKNOWN))}
          onClick={() => {
            if (over) {
              onRetry();
              return;
            }
            setMarks(Array<ModuleMark>(size * size).fill(UNKNOWN));
            setHint(null);
            setMessage(null);
          }}
        >
          <Eraser size={15} aria-hidden="true" />
          {over ? '重试本张' : '清空'}
        </button>
      </div>
      <div className="fault-progress">
        <span>
          {level.label} · {size}×{size} · {puzzle.faults.length} 个故障 ·{' '}
          {puzzle.sensors.length} 个传感器
        </span>
        <span>
          {best
            ? `最佳 ${formatTime(best.seconds)} · 通关 ${best.solved} 次（无误无提示 ${best.clean}）`
            : '还没有这个难度的记录'}
        </span>
      </div>
      <p className="fault-keys">
        键盘：方向键移动，F 标故障，X 标正常，Delete 清除，Enter
        或空格循环切换。
      </p>
    </div>
  );
}
