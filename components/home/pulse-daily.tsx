'use client';
import { useState, useSyncExternalStore } from 'react';
import { Check, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  PULSE_DAILY_SIZES,
  boardAfter,
  dailyPuzzle,
  isDailySize,
  loadDailySave,
  localDate,
  recordKey,
  solveDaily,
  starsFor,
  storeDailySave,
  withDailyResult,
  type PulseDailySave,
  type PulseDailySize,
} from '@/lib/pulse-daily';

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** Daily generated boards (4 × 4 to 6 × 6) with a 1–3 star rating by moves. */
export function PulseDaily() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  // The date and storage are only read on the client, after hydration.
  return <PulseDailySession key={ready ? 'local' : 'preview'} ready={ready} />;
}

function PulseDailySession({ ready }: { ready: boolean }) {
  const [today] = useState(() => (ready ? localDate() : '----------'));
  const [loaded] = useState(() => (ready ? loadDailySave(today) : null));
  const [save, setSave] = useState<PulseDailySave | null>(
    () => loaded?.save ?? null,
  );
  const [hint, setHint] = useState<number | null>(null);
  const [storageOk, setStorageOk] = useState(loaded?.status !== 'unavailable');
  const size: PulseDailySize = save?.size ?? 5;
  const [puzzle] = useState(() =>
    ready
      ? Object.fromEntries(
          PULSE_DAILY_SIZES.map((s) => [s, dailyPuzzle(today, s)]),
        )
      : null,
  );
  const current = puzzle?.[size];
  const run = save?.boards[size];
  const board = current && run ? boardAfter(current, run.presses) : null;
  const moves = run?.presses.length ?? 0;
  const won = Boolean(board && moves > 0 && board.every((x) => x === 0));
  const record = save?.records[recordKey(today, size)];
  const todayStars = PULSE_DAILY_SIZES.reduce(
    (sum, s) => sum + (save?.records[recordKey(today, s)]?.stars ?? 0),
    0,
  );

  const update = (next: PulseDailySave) => {
    setSave(next);
    setStorageOk(storeDailySave(next));
  };
  const setRun = (presses: number[], hints: number) => {
    if (!save || !current) return;
    let next: PulseDailySave = {
      ...save,
      boards: { ...save.boards, [size]: { presses, hints } },
    };
    const cleared = boardAfter(current, presses).every((x) => x === 0);
    if (cleared && presses.length > 0)
      next = withDailyResult(next, current, presses.length, hints);
    update(next);
  };
  const press = (cell: number) => {
    if (!run || won) return;
    setHint(null);
    setRun([...run.presses, cell], run.hints);
  };

  return (
    <section
      className={`pulse-game pulse-daily ${won ? 'is-solved' : ''}`}
      aria-labelledby="pulse-daily-title"
    >
      <header className="pulse-heading">
        <div>
          <span className="b-mono">DAILY · {today}</span>
          <h2 id="pulse-daily-title">今日挑战</h2>
        </div>
        <span
          className="pulse-daily-total"
          aria-label={`今日已获 ${todayStars} / 9 星`}
        >
          {todayStars} / 9 ★
        </span>
      </header>
      <p className="pulse-daily-rule">
        每天按日期生成三张新灯阵，所有人同一天拿到同一题。按最短步数完成得三星。
      </p>
      <div className="pulse-console" aria-busy={!ready}>
        <ToggleGroup
          disabled={!ready}
          value={[String(size)]}
          onValueChange={(v) => {
            const next = Number(v[0]);
            if (save && isDailySize(next)) {
              setHint(null);
              update({ ...save, size: next });
            }
          }}
          aria-label="选择今日灯阵尺寸"
          className="pulse-chapters"
        >
          {PULSE_DAILY_SIZES.map((s) => {
            const r = save?.records[recordKey(today, s)];
            return (
              <ToggleGroupItem
                value={String(s)}
                key={s}
                aria-label={`${s} × ${s}${r ? `，已获 ${r.stars} 星` : ''}`}
              >
                <span>
                  {s} × {s}
                </span>
                <small>{r ? starText(r.stars) : '未完成'}</small>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <div className="pulse-level-title">
          <strong>
            今日 {size} × {size}
          </strong>
          <span>
            {current
              ? `最短 ${current.par} 步 · 二星 ≤ ${current.par + Math.max(2, Math.ceil(current.par / 3))} 步`
              : '正在生成…'}
          </span>
        </div>
        <div className="pulse-topline">
          <span className="pulse-moves">
            <strong>{String(moves).padStart(2, '0')}</strong> 步
          </span>
          <span className="pulse-daily-live" aria-hidden="true">
            {board && moves > 0 && !won
              ? `当前 ${starText(starsFor(Math.max(moves, current!.par), current!.par))}`
              : ''}
          </span>
        </div>
        <fieldset
          className="pulse-board"
          data-size={size}
          aria-label={`今日 ${size} × ${size} 灯阵`}
          key={size}
        >
          {Array.from({ length: size * size }, (_, i) => {
            const on = Boolean(board?.[i]);
            return (
              <button
                key={i}
                type="button"
                className={`pulse-cell ${on ? 'is-on' : ''} ${hint === i ? 'is-hint' : ''}`}
                aria-label={`第 ${Math.floor(i / size) + 1} 行第 ${(i % size) + 1} 列，${on ? '亮' : '灭'}${hint === i ? '，建议按这里' : ''}`}
                aria-pressed={on}
                disabled={!ready || won}
                onClick={() => press(i)}
              >
                <span aria-hidden="true" />
              </button>
            );
          })}
        </fieldset>
        <output className="pulse-feedback" aria-live="polite">
          {won && current ? (
            <>
              <Check size={15} />
              {`${moves} 步完成，获得 ${starsFor(moves, current.par)} 星 ${starText(starsFor(moves, current.par))}${moves > current.par ? `；最短 ${current.par} 步可得三星` : ''}${run?.hints ? `（用了 ${run.hints} 次提示）` : ''}。`}
            </>
          ) : hint !== null ? (
            `试试第 ${Math.floor(hint / size) + 1} 行第 ${(hint % size) + 1} 列，金色边框已标出。`
          ) : record ? (
            `今日最佳 ${record.moves} 步 · ${starText(record.stars)}，可以再挑战。`
          ) : (
            '按一下，自己和上下左右的灯一起翻转。'
          )}
        </output>
        <div className="pulse-actions">
          <button
            type="button"
            aria-label="撤回今日灯阵上一步"
            disabled={!ready || moves === 0 || won}
            onClick={() => {
              setHint(null);
              if (run) setRun(run.presses.slice(0, -1), run.hints);
            }}
          >
            <Undo2 size={15} />
            撤回
          </button>
          <button
            type="button"
            aria-label="重来今日灯阵，保留今日最佳记录"
            disabled={!ready || moves === 0}
            onClick={() => {
              setHint(null);
              setRun([], 0);
            }}
          >
            <RotateCcw size={15} />
            重来
          </button>
          <button
            type="button"
            aria-label="今日灯阵提示"
            disabled={!ready || won}
            onClick={() => {
              if (!board || !run) return;
              const solution = solveDaily(board, size);
              if (!solution?.length) return;
              if (hint === null) setRun(run.presses, run.hints + 1);
              setHint(solution[0]);
            }}
          >
            <Lightbulb size={15} />
            提示
          </button>
        </div>
      </div>
      <output className="pulse-storage">
        {!ready
          ? '正在读取今日灯阵…'
          : !storageOk
            ? '浏览器暂时无法保存，仍可继续玩；刷新后可能丢失今日进度。'
            : loaded?.status === 'invalid'
              ? '今日挑战的旧存档无法读取，已重新开始。'
              : '今日进度与星级只保存在当前浏览器；明天会换新题。'}
      </output>
    </section>
  );
}
