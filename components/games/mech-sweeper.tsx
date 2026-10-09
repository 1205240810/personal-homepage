'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  CalendarDays,
  Check,
  Flag,
  RotateCcw,
  ScanSearch,
  Shuffle,
  Zap,
} from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  FLAGGED,
  REVEALED,
  SWEEPER_LEVELS,
  countNearby,
  createSweeper,
  dailySweeperSeed,
  faultsRemaining,
  generateSweeperField,
  getSweeperLevel,
  loadSweeperRecords,
  mergeSweeperRecord,
  revealCell,
  saveSweeperRecords,
  toggleFlag,
  type SweeperField,
  type SweeperLevelId,
  type SweeperRecords,
} from '@/lib/games/mech-sweeper';
import './mech-sweeper.css';

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
// Deterministic field for SSR and the first hydration pass.
const PREVIEW_SEED = 20_261_009;
const LONG_PRESS_MS = 420;
const DEFAULT_LEVEL: SweeperLevelId = 'cadet';

type Board = { level: SweeperLevelId; seed: number; daily: boolean };
type Today = { year: number; month: number; day: number };

function todayParts(): Today {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function dailyBoard(level: SweeperLevelId, today: Today): Board {
  return {
    level,
    seed: dailySweeperSeed(today.year, today.month, today.day, level),
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

export function MechSweeper() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  return <SweeperDesk key={ready ? 'local' : 'preview'} ready={ready} />;
}

function SweeperDesk({ ready }: { ready: boolean }) {
  const [today] = useState(() => (ready ? todayParts() : null));
  const [loaded] = useState(() => (ready ? loadSweeperRecords() : null));
  const [records, setRecords] = useState<SweeperRecords>(
    () => loaded?.records ?? {},
  );
  const [storage, setStorage] = useState(() => loaded?.status ?? 'empty');
  const [board, setBoard] = useState<Board>(() =>
    today
      ? dailyBoard(DEFAULT_LEVEL, today)
      : { level: DEFAULT_LEVEL, seed: PREVIEW_SEED, daily: false },
  );
  const field = useMemo(
    () => generateSweeperField(board.level, board.seed),
    [board.level, board.seed],
  );
  // Bumping the round remounts the session on the same field ("重试本张").
  const [round, setRound] = useState(0);

  const pickLevel = (level: SweeperLevelId) => {
    if (!ready || !today) return;
    setBoard(
      board.daily
        ? dailyBoard(level, today)
        : { level, seed: randomSeed(), daily: false },
    );
  };

  return (
    <section className="sweeper-game" aria-labelledby="sweeper-title">
      <header className="sweeper-heading">
        <div>
          <span className="sweeper-mono">DIAGNOSTIC BAY / FAULT SCAN</span>
          <h2 id="sweeper-title">找出故障模块，别碰短路。</h2>
        </div>
        <ScanSearch size={20} strokeWidth={1.5} aria-hidden="true" />
      </header>
      <p id="sweeper-rule">
        点击扫描模块，数字表示周围八格里有几个故障。右键、长按或「标记」模式插上检修旗；数字周围旗数已满时再点它，会一次扫开其余格子。第一次扫描一定安全。
      </p>
      <div className="sweeper-console" aria-busy={!ready}>
        <ToggleGroup
          disabled={!ready}
          value={[board.level]}
          onValueChange={(v) => {
            if (v.length) pickLevel(v[0] as SweeperLevelId);
          }}
          aria-label="选择扫描难度"
          className="sweeper-levels"
        >
          {SWEEPER_LEVELS.map((level) => (
            <ToggleGroupItem value={level.id} key={level.id}>
              <span>{level.label}</span>
              <small>
                {level.cols}×{level.rows} · {level.mines} 故障
              </small>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="sweeper-board-switch">
          <span>
            {board.daily ? (
              <>
                <CalendarDays size={13} aria-hidden="true" />
                今日检修 · {today?.month} 月 {today?.day} 日
              </>
            ) : (
              <>扫描编号 #{board.seed.toString(16).toUpperCase()}</>
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
        <SweeperSession
          key={`${field.level}:${field.seed}:${round}`}
          field={field}
          ready={ready}
          best={records[field.level]}
          onRetry={() => setRound(round + 1)}
          onWin={(result) => {
            const next = mergeSweeperRecord(records, field.level, result);
            setRecords(next);
            setStorage(saveSweeperRecords(next));
          }}
        />
      </div>
      <output className="sweeper-storage">
        {!ready
          ? '正在启动扫描仪…'
          : storage === 'unavailable'
            ? '浏览器暂时无法保存记录，仍可继续玩。'
            : storage === 'invalid'
              ? '旧记录无法读取，已重新开始计分；新记录只保存在当前浏览器。'
              : '各难度的最佳用时与通关次数保存在当前浏览器；进行中的扫描不存档。'}
      </output>
    </section>
  );
}

function SweeperSession({
  field,
  ready,
  best,
  onRetry,
  onWin,
}: {
  field: SweeperField;
  ready: boolean;
  best: SweeperRecords[SweeperLevelId];
  onRetry: () => void;
  onWin: (result: { seconds: number; clean: boolean }) => void;
}) {
  const level = getSweeperLevel(field.level);
  const { cols, rows } = level;
  const [game, setGame] = useState(() => createSweeper(field));
  const [flagMode, setFlagMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState<number | null>(null);
  const [focus, setFocus] = useState(field.start);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const press = useRef<{
    index: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const suppressClick = useRef<number | null>(null);

  const nearby = useMemo(
    () => countNearby(level, game.mines),
    [level, game.mines],
  );
  const over = game.status === 'won' || game.status === 'lost';
  const elapsed =
    finished ??
    (startedAt === null
      ? 0
      : Math.max(0, Math.floor((now - startedAt) / 1000)));

  useEffect(() => {
    if (startedAt === null || over) return;
    const timer = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(timer);
  }, [startedAt, over]);
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current.timer);
    },
    [],
  );

  const apply = (next: typeof game, clock: number) => {
    if (next === game) return;
    setGame(next);
    const began = startedAt ?? clock;
    if (startedAt === null && next.moves > 0) setStartedAt(began);
    setNow(clock);
    if (next.status === 'won' || next.status === 'lost') {
      const seconds = Math.max(1, Math.round((clock - began) / 1000));
      setFinished(seconds);
      if (next.status === 'won')
        onWin({ seconds, clean: next.shorted.length === 0 });
    }
  };

  const flag = (index: number, clock: number) => {
    if (!ready) return;
    apply(toggleFlag(game, index), clock);
  };
  const open = (index: number, clock: number) => {
    if (!ready) return;
    if (flagMode && game.marks[index] !== REVEALED) flag(index, clock);
    else apply(revealCell(game, index), clock);
  };

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const startPress = (
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    suppressClick.current = null;
    if (event.pointerType === 'mouse' || over) return;
    cancelPress();
    const clock = event.timeStamp;
    press.current = {
      index,
      timer: setTimeout(() => {
        press.current = null;
        suppressClick.current = index;
        flag(index, clock + LONG_PRESS_MS);
        navigator.vibrate?.(18);
      }, LONG_PRESS_MS),
    };
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const r = Math.floor(index / cols);
    const c = index % cols;
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      flag(index, event.timeStamp);
      return;
    }
    const target =
      event.key === 'ArrowUp'
        ? r > 0 && index - cols
        : event.key === 'ArrowDown'
          ? r < rows - 1 && index + cols
          : event.key === 'ArrowLeft'
            ? c > 0 && index - 1
            : event.key === 'ArrowRight'
              ? c < cols - 1 && index + 1
              : null;
    if (target === null) return;
    event.preventDefault();
    if (target === false) return;
    setFocus(target);
    cells.current[target]?.focus();
  };

  const label = (index: number) => {
    const r = Math.floor(index / cols) + 1;
    const c = (index % cols) + 1;
    const mark = game.marks[index];
    const mine = game.mines[index];
    let state: string;
    if (game.status === 'lost' && game.shorted.at(-1) === index)
      state = '短路点';
    else if (mark === FLAGGED)
      state = game.shorted.includes(index)
        ? '保险丝熔断，已暴露的故障'
        : game.status === 'lost' && !mine
          ? '误标的检修旗'
          : '检修旗';
    else if (mark === REVEALED)
      state = nearby[index] ? `信号 ${nearby[index]}` : '安全，周围无故障';
    else if (game.status === 'lost' && mine) state = '故障模块';
    else
      state =
        game.status === 'ready' && index === field.start
          ? '未扫描，扫描起点'
          : '未扫描';
    return `第 ${r} 行第 ${c} 列，${state}`;
  };

  return (
    <div className={`sweeper-play is-${game.status}`}>
      <div className="sweeper-stats">
        <span>
          <strong>{String(faultsRemaining(game)).padStart(2, '0')}</strong>{' '}
          待标故障
        </span>
        <span>
          <strong>{formatTime(elapsed)}</strong>
        </span>
        <span title="保险丝可以吸收一次短路">
          <Zap size={13} aria-hidden="true" />
          <strong>{game.fusesLeft}</strong> 保险丝
        </span>
      </div>
      <fieldset
        className="sweeper-board"
        style={{ '--sweeper-cols': cols } as CSSProperties}
        aria-label={`${cols} × ${rows} 检修舱`}
        aria-describedby="sweeper-rule"
      >
        {game.marks.map((mark, index) => {
          const mine = game.mines[index];
          const boom = game.status === 'lost' && game.shorted.at(-1) === index;
          const showMine = game.status === 'lost' && mine && mark !== FLAGGED;
          const wrongFlag = game.status === 'lost' && mark === FLAGGED && !mine;
          const blown = mark === FLAGGED && game.shorted.includes(index);
          const r = Math.floor(index / cols);
          const c = index % cols;
          return (
            <button
              key={index}
              ref={(node) => {
                cells.current[index] = node;
              }}
              type="button"
              tabIndex={index === focus ? 0 : -1}
              data-n={mark === REVEALED ? nearby[index] : undefined}
              className={[
                'sweeper-cell',
                mark === REVEALED ? 'is-open' : '',
                mark === FLAGGED ? 'is-flag' : '',
                blown ? 'is-blown' : '',
                showMine ? 'is-fault' : '',
                boom ? 'is-boom' : '',
                wrongFlag ? 'is-wrong' : '',
                game.status === 'ready' && index === field.start
                  ? 'is-start'
                  : '',
              ].join(' ')}
              style={{ '--delay': `${(r + c) * 22}ms` } as CSSProperties}
              aria-label={label(index)}
              aria-disabled={!ready || over || undefined}
              onFocus={() => setFocus(index)}
              onPointerDown={(event) => startPress(event, index)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onClick={(event) => {
                if (suppressClick.current === index) {
                  suppressClick.current = null;
                  return;
                }
                if (event.shiftKey) flag(index, event.timeStamp);
                else open(index, event.timeStamp);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                // Touch long-press already flagged this cell.
                if (suppressClick.current === index) return;
                flag(index, event.timeStamp);
              }}
              onKeyDown={(event) => onKey(event, index)}
            >
              {mark === REVEALED && nearby[index] ? nearby[index] : null}
              {mark === FLAGGED && (
                <Flag size={13} strokeWidth={2} aria-hidden="true" />
              )}
              {(showMine || boom) && (
                <span className="sweeper-fault" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </fieldset>
      <output className="sweeper-feedback" aria-live="polite">
        {game.status === 'won' ? (
          <>
            <Check size={15} aria-hidden="true" />
            检修完成！用时 {formatTime(elapsed)}
            {game.shorted.length ? '，熔断了 1 根保险丝。' : '，零短路。'}
          </>
        ) : game.status === 'lost' ? (
          '短路了！故障模块已全部显示，可以重试本张或换一张。'
        ) : game.shorted.length ? (
          '保险丝熔断，替你挡下一次短路。下一次就没有了。'
        ) : flagMode ? (
          '标记模式：点击未扫描的格子插上或拔掉检修旗。'
        ) : game.status === 'ready' ? (
          '从带虚线框的扫描起点开始最稳；任何格子的第一次扫描都不会短路。'
        ) : (
          `还有 ${faultsRemaining(game)} 个故障待标记。`
        )}
      </output>
      <div className="sweeper-actions">
        <button
          type="button"
          aria-pressed={flagMode}
          className={flagMode ? 'is-active' : ''}
          disabled={!ready || over}
          onClick={() => setFlagMode(!flagMode)}
        >
          <Flag size={15} aria-hidden="true" />
          标记
        </button>
        <button
          type="button"
          aria-label="重试本张扫描，故障位置不变"
          disabled={!ready || game.status === 'ready'}
          onClick={onRetry}
        >
          <RotateCcw size={15} aria-hidden="true" />
          重试本张
        </button>
      </div>
      <div className="sweeper-progress">
        <span>
          {level.label} · {cols}×{rows}
          {level.fuses ? ` · ${level.fuses} 根备用保险丝` : ''}
        </span>
        <span>
          {best
            ? `最佳 ${formatTime(best.seconds)} · 通关 ${best.wins} 次（零短路 ${best.clean}）`
            : '还没有这个难度的记录'}
        </span>
      </div>
    </div>
  );
}
