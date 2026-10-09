'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Check, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  PULSE_CHAPTERS,
  PULSE_LEVELS,
  pressPulse,
  solvePulse,
} from '@/lib/pulse-puzzle';
import { starsFor } from '@/lib/pulse-daily';
import {
  createPulseProgress,
  loadPulseProgress,
  savePulseProgress,
  type PulseProgress,
} from '@/lib/pulse-progress';
import './pulse-game.css';

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function PulseGame() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  // Keep SSR and the first hydration render identical. Only the client session
  // reads browser storage, once, before accepting any gameplay input.
  return <PulseGameSession key={ready ? 'local' : 'preview'} ready={ready} />;
}

function PulseGameSession({ ready }: { ready: boolean }) {
  const [loaded] = useState(() => (ready ? loadPulseProgress() : null));
  const [progress, setProgress] = useState(
    () => loaded?.progress ?? createPulseProgress(),
  );
  const [restored, setRestored] = useState(() =>
    Boolean(
      loaded?.progress &&
      (loaded.progress.history.length > 1 ||
        loaded.progress.levelId !== PULSE_LEVELS[0].id ||
        loaded.progress.hintsUsed > 0 ||
        Object.keys(loaded.progress.results).length > 0),
    ),
  );
  const [invalidSave, setInvalidSave] = useState(loaded?.status === 'invalid');
  const [saveStatus, setSaveStatus] = useState<
    'saved' | 'invalid' | 'unavailable'
  >(loaded?.status === 'unavailable' ? 'unavailable' : 'saved');
  const { history, hint, hintsUsed, results } = progress;
  const level = PULSE_LEVELS.findIndex((item) => item.id === progress.levelId);
  const firstCell = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<'board' | 'finish' | null>(null);
  const current = PULSE_LEVELS[level];
  const board = history[history.length - 1];
  const moves = history.length - 1;
  const won = board === 0;
  const completed = Object.keys(results).length;
  const chapter = PULSE_CHAPTERS.find((c) => c.id === current.chapter)!;

  const updateProgress = (next: PulseProgress) => {
    setProgress(next);
    // Save in the interaction that changes state, so immediate navigation or a
    // reload cannot beat a deferred write. Storage failure never blocks play.
    setSaveStatus(savePulseProgress(next));
  };

  useEffect(() => {
    if (focusTarget.current === 'board') firstCell.current?.focus();
    if (focusTarget.current === 'finish')
      (nextButton.current || resetButton.current)?.focus();
    focusTarget.current = null;
  }, [board, level, restored]);

  const dismissNotice = () => {
    setRestored(false);
    setInvalidSave(false);
  };
  const start = (next: number) => {
    if (!ready || next < 0 || next >= PULSE_LEVELS.length) return;
    updateProgress({
      ...createPulseProgress(PULSE_LEVELS[next].id),
      results,
    });
    dismissNotice();
  };
  const press = (cell: number) => {
    if (!ready || won) return;
    const next = pressPulse(board, cell, current.size);
    const best = results[current.id];
    const improved =
      next === 0 &&
      (!best ||
        best.moves > moves + 1 ||
        (best.moves === moves + 1 && best.hints > hintsUsed));
    updateProgress({
      ...progress,
      history: [...history, next],
      hint: null,
      results: improved
        ? { ...results, [current.id]: { moves: moves + 1, hints: hintsUsed } }
        : results,
    });
    dismissNotice();
    if (next === 0) focusTarget.current = 'finish';
  };
  return (
    <section
      className={`pulse-game ${won ? 'is-solved' : ''}`}
      aria-labelledby="pulse-title"
    >
      <header className="pulse-heading">
        <div>
          <span className="b-mono">A SMALL DETOUR</span>
          <h2 id="pulse-title">休息一下，脉冲归零。</h2>
        </div>
        <Lightbulb size={20} strokeWidth={1.5} aria-hidden="true" />
      </header>
      <p id="pulse-rule">
        按一下，自己和上下左右的灯一起翻转。让它们全部熄灭。
      </p>
      <div className="pulse-console" aria-busy={!ready}>
        {restored && (
          <div className="pulse-resume">
            <output>
              已恢复第 {level + 1} 关{won ? '的通关记录' : `，已走 ${moves} 步`}
              。
            </output>
            <div>
              <button
                type="button"
                onClick={() => {
                  focusTarget.current = won ? 'finish' : 'board';
                  dismissNotice();
                }}
              >
                继续游戏 <ArrowRight size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="重新开始当前灯阵，保留已完成关卡和最佳记录"
                onClick={() => {
                  focusTarget.current = 'board';
                  start(level);
                }}
              >
                重新开始本关
              </button>
            </div>
          </div>
        )}
        <ToggleGroup
          disabled={!ready}
          value={[String(current.chapter)]}
          onValueChange={(v) => {
            if (v.length)
              start(
                PULSE_LEVELS.findIndex((item) => item.chapter === Number(v[0])),
              );
          }}
          aria-label="选择灯阵阶段"
          className="pulse-chapters"
        >
          {PULSE_CHAPTERS.map((item, i) => (
            <ToggleGroupItem value={String(item.id)} key={item.id}>
              <span>{['入门', '进阶', '挑战'][i]}</span>
              <small>{item.id === 3 ? '5 × 5' : '4 × 4'}</small>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="pulse-topline">
          <ToggleGroup
            disabled={!ready}
            value={[String(level)]}
            onValueChange={(v) => {
              if (v.length) start(Number(v[0]));
            }}
            aria-label="选择灯阵关卡"
            className="pulse-levels"
          >
            {PULSE_LEVELS.map(
              (item, i) =>
                item.chapter === current.chapter && (
                  <ToggleGroupItem
                    value={String(i)}
                    key={item.id}
                    aria-label={`第 ${i + 1} 关：${item.name}${results[item.id] ? `，已完成，${starsFor(results[item.id].moves, item.par)} 星` : ''}`}
                  >
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    {results[item.id] && <Check size={10} aria-hidden="true" />}
                  </ToggleGroupItem>
                ),
            )}
          </ToggleGroup>
          <span className="pulse-moves">
            <strong>{String(moves).padStart(2, '0')}</strong> 步
          </span>
        </div>
        <div className="pulse-level-title">
          <strong>{current.name}</strong>
          <span>最短 {current.par} 步</span>
        </div>
        <fieldset
          className="pulse-board"
          data-size={current.size}
          aria-label={`${current.size} × ${current.size} 灯阵`}
          aria-describedby="pulse-rule"
          key={current.id}
        >
          {Array.from({ length: current.size * current.size }, (_, i) => {
            const on = Boolean(board & (1 << i));
            return (
              <button
                key={i}
                ref={i === 0 ? firstCell : undefined}
                type="button"
                className={`pulse-cell ${on ? 'is-on' : ''} ${hint === i ? 'is-hint' : ''}`}
                aria-label={`第 ${Math.floor(i / current.size) + 1} 行第 ${(i % current.size) + 1} 列，${on ? '亮' : '灭'}${hint === i ? '，建议按这里' : ''}`}
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
          {won ? (
            <>
              <Check size={15} />
              {completed === PULSE_LEVELS.length
                ? '十二关完成，所有脉冲都归零了。'
                : moves === current.par
                  ? `${moves} 步，达成最短解${hintsUsed ? '。' : '，没有使用提示。'}`
                  : `${moves} 步完成，还能挑战 ${current.par} 步解法。`}
            </>
          ) : hint !== null ? (
            `试试第 ${Math.floor(hint / current.size) + 1} 行第 ${(hint % current.size) + 1} 列，金色边框已标出。`
          ) : (
            current.hint
          )}
        </output>
        <div className="pulse-actions">
          <button
            type="button"
            aria-label="撤回灯阵上一步"
            disabled={!ready || moves === 0}
            onClick={() => {
              updateProgress({
                ...progress,
                history: history.slice(0, -1),
                hint: null,
              });
              dismissNotice();
            }}
          >
            <Undo2 size={15} />
            撤回
          </button>
          <button
            type="button"
            ref={resetButton}
            aria-label="重置当前灯阵，保留已完成关卡和最佳记录"
            disabled={!ready}
            onClick={() => start(level)}
          >
            <RotateCcw size={15} />
            重来
          </button>
          <button
            type="button"
            disabled={!ready || won}
            onClick={() => {
              const solution = solvePulse(board, current.size);
              if (solution !== null && solution !== 0) {
                updateProgress({
                  ...progress,
                  hint: 31 - Math.clz32(solution & -solution),
                  hintsUsed: hintsUsed + (hint === null ? 1 : 0),
                });
                dismissNotice();
              }
            }}
          >
            <Lightbulb size={15} />
            提示
          </button>
        </div>
        {won && level < PULSE_LEVELS.length - 1 && (
          <button
            type="button"
            ref={nextButton}
            className="pulse-next"
            onClick={() => {
              focusTarget.current = 'board';
              start(level + 1);
            }}
          >
            {PULSE_LEVELS[level + 1].chapter !== current.chapter
              ? '进入下一阶段'
              : '下一关'}{' '}
            <ArrowRight size={15} />
          </button>
        )}
        {won &&
          level === PULSE_LEVELS.length - 1 &&
          completed < PULSE_LEVELS.length && (
            <button
              type="button"
              ref={nextButton}
              className="pulse-next"
              onClick={() => {
                focusTarget.current = 'board';
                start(PULSE_LEVELS.findIndex((item) => !results[item.id]));
              }}
            >
              去试试未完成的关卡 <ArrowRight size={15} />
            </button>
          )}
      </div>
      <div className="pulse-progress">
        <span>
          {chapter.name} · 已完成 {completed} / {PULSE_LEVELS.length}
        </span>
        <span>
          {results[current.id]
            ? `本关最佳 ${results[current.id].moves} 步 · ${'★'.repeat(starsFor(results[current.id].moves, current.par))}${'☆'.repeat(3 - starsFor(results[current.id].moves, current.par))}`
            : '随时可以选关'}
        </span>
      </div>
      <output className="pulse-storage">
        {!ready
          ? '正在读取本地进度…'
          : saveStatus === 'unavailable'
            ? '浏览器暂时无法保存进度，仍可继续玩；离开或刷新后可能丢失。'
            : saveStatus === 'invalid'
              ? '当前对局超过本地存档上限，暂未保存；重来或选关后可继续保存。'
              : invalidSave
                ? '旧存档无法读取，已从第 1 关开始。新进度只保存在当前浏览器。'
                : '进度自动保存在当前浏览器，不会跨设备同步；清除网站数据会删除记录。'}
      </output>
    </section>
  );
}
