'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  PULSE_CHAPTERS,
  PULSE_LEVELS,
  pressPulse,
  solvePulse,
} from '@/lib/pulse-puzzle';
import './pulse-game.css';

type Result = { moves: number; hints: number };

export function PulseGame() {
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState<number[]>([PULSE_LEVELS[0].board]);
  const [hint, setHint] = useState<number | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
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
  useEffect(() => {
    if (focusTarget.current === 'board') firstCell.current?.focus();
    if (focusTarget.current === 'finish')
      (nextButton.current || resetButton.current)?.focus();
    focusTarget.current = null;
  }, [board, level]);
  const start = (next: number) => {
    if (next < 0 || next >= PULSE_LEVELS.length) return;
    setLevel(next);
    setHistory([PULSE_LEVELS[next].board]);
    setHint(null);
    setHintsUsed(0);
  };
  const press = (cell: number) => {
    if (won) return;
    const next = pressPulse(board, cell, current.size);
    setHistory((h) => [...h, next]);
    setHint(null);
    if (next === 0) {
      focusTarget.current = 'finish';
      setResults((previous) => {
        const best = previous[current.id];
        if (
          best &&
          (best.moves < moves + 1 ||
            (best.moves === moves + 1 && best.hints <= hintsUsed))
        )
          return previous;
        return {
          ...previous,
          [current.id]: { moves: moves + 1, hints: hintsUsed },
        };
      });
    }
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
      <div className="pulse-console">
        <ToggleGroup
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
                    aria-label={`第 ${i + 1} 关：${item.name}${results[item.id] ? '，已完成' : ''}`}
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
        <div
          className="pulse-board"
          data-size={current.size}
          role="group"
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
                disabled={won}
                onClick={() => press(i)}
              >
                <span aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="pulse-feedback" role="status" aria-live="polite">
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
        </div>
        <div className="pulse-actions">
          <button
            type="button"
            aria-label="撤回灯阵上一步"
            disabled={moves === 0}
            onClick={() => {
              setHistory((h) => h.slice(0, -1));
              setHint(null);
            }}
          >
            <Undo2 size={15} />
            撤回
          </button>
          <button
            type="button"
            ref={resetButton}
            aria-label="重置当前灯阵"
            onClick={() => start(level)}
          >
            <RotateCcw size={15} />
            重来
          </button>
          <button
            type="button"
            disabled={won}
            onClick={() => {
              const solution = solvePulse(board, current.size);
              if (solution !== null && solution !== 0) {
                setHint(31 - Math.clz32(solution & -solution));
                if (hint === null) setHintsUsed((n) => n + 1);
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
          {chapter.name} · 本次完成 {completed} / {PULSE_LEVELS.length}
        </span>
        <span>
          {results[current.id]
            ? `本关最佳 ${results[current.id].moves} 步`
            : '随时可以选关'}
        </span>
      </div>
    </section>
  );
}
