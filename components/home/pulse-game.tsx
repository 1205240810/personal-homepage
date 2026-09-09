'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PULSE_LEVELS, pressPulse, solvePulse } from '@/lib/pulse-puzzle';
import './pulse-game.css';

export function PulseGame() {
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState<number[]>([PULSE_LEVELS[0].board]);
  const [hint, setHint] = useState<number | null>(null);
  const [cleared, setCleared] = useState<number[]>([]);
  const firstCell = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<'board' | 'finish' | null>(null);
  const board = history[history.length - 1];
  const moves = history.length - 1;
  const won = board === 0;
  useEffect(() => {
    if (focusTarget.current === 'board') firstCell.current?.focus();
    if (focusTarget.current === 'finish')
      (nextButton.current || resetButton.current)?.focus();
    focusTarget.current = null;
  }, [board, level]);
  const start = (next: number) => {
    setLevel(next);
    setHistory([PULSE_LEVELS[next].board]);
    setHint(null);
  };
  const press = (cell: number) => {
    if (won) return;
    const next = pressPulse(board, cell);
    setHistory((h) => [...h, next]);
    setHint(null);
    if (next === 0) {
      focusTarget.current = 'finish';
      setCleared((levels) =>
        levels.includes(level) ? levels : [...levels, level],
      );
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
        <div className="pulse-topline">
          <ToggleGroup
            value={[String(level)]}
            onValueChange={(v) => {
              if (v.length) start(Number(v[0]));
            }}
            aria-label="选择灯阵关卡"
            className="pulse-levels"
          >
            {PULSE_LEVELS.map((item, i) => (
              <ToggleGroupItem
                value={String(i)}
                key={item.name}
                aria-label={`第 ${i + 1} 关：${item.name}${cleared.includes(i) ? '，已完成' : ''}`}
              >
                {cleared.includes(i) ? (
                  <Check size={13} />
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="pulse-moves">
            <strong>{String(moves).padStart(2, '0')}</strong> 步
          </span>
        </div>
        <div
          className="pulse-board"
          role="group"
          aria-label="4 × 4 灯阵"
          aria-describedby="pulse-rule"
        >
          {Array.from({ length: 16 }, (_, i) => {
            const on = Boolean(board & (1 << i));
            return (
              <button
                key={i}
                ref={i === 0 ? firstCell : undefined}
                type="button"
                className={`pulse-cell ${on ? 'is-on' : ''} ${hint === i ? 'is-hint' : ''}`}
                aria-label={`第 ${Math.floor(i / 4) + 1} 行第 ${(i % 4) + 1} 列，${on ? '亮' : '灭'}${hint === i ? '，建议按这里' : ''}`}
                aria-pressed={on}
                disabled={won}
                onClick={() => press(i)}
              >
                <span aria-hidden="true">{hint === i ? '·' : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="pulse-feedback" role="status" aria-live="polite">
          {won ? (
            <>
              <Check size={15} />
              {cleared.length === 3
                ? '三关完成，电路安静下来了。'
                : `${moves} 步归零。漂亮的一次收尾。`}
            </>
          ) : hint !== null ? (
            `试试第 ${Math.floor(hint / 4) + 1} 行第 ${(hint % 4) + 1} 列，金色边框已标出。`
          ) : (
            `${PULSE_LEVELS[level].name} · 本关最短 ${PULSE_LEVELS[level].par} 步`
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
              const solution = solvePulse(board);
              if (solution !== null && solution !== 0)
                setHint(31 - Math.clz32(solution & -solution));
            }}
          >
            <Lightbulb size={15} />
            提示
          </button>
        </div>
        {won && level < 2 && (
          <button
            type="button"
            ref={nextButton}
            className="pulse-next"
            onClick={() => {
              focusTarget.current = 'board';
              start(level + 1);
            }}
          >
            下一关 <ArrowRight size={15} />
          </button>
        )}
      </div>
    </section>
  );
}
