'use client';
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Check, BookOpen, Leaf, Cpu, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MiniGameId } from '@/lib/world/types';
import {
  initialCircuit,
  circuitState,
  rotatePipe,
  shuffledSignals,
} from '@/lib/world/puzzles';
export const GAME_TITLES: Record<MiniGameId, string> = {
  circuit: '工坊的备用回路',
  memory: '旅行卡片',
};
export function MiniGameView({
  game,
  best,
  onComplete,
}: {
  game: MiniGameId;
  best?: number;
  onComplete: (moves: number) => void;
}) {
  return (
    <div className="mini-game">
      <div className="game-description">
        <span className="eyebrow">A SMALL DETOUR</span>
        <p>
          {game === 'circuit'
            ? '点击接头，让左上方的电流，沿着管线到达右下方的出口。'
            : '翻开记忆片，找到四组相同的信号。没有倒计时，慢慢来。'}
        </p>
        {best && (
          <span className="game-best">
            本机最佳记录 · {best} {game === 'circuit' ? '次旋转' : '次配对尝试'}
          </span>
        )}
      </div>
      {game === 'circuit' ? (
        <CircuitGame onComplete={onComplete} />
      ) : (
        <MemoryGame onComplete={onComplete} />
      )}
    </div>
  );
}
function CircuitGame({ onComplete }: { onComplete: (moves: number) => void }) {
  const [tiles, setTiles] = useState(initialCircuit),
    [moves, setMoves] = useState(0);
  const { lit, solved } = circuitState(tiles);
  function rotate(index: number) {
    if (solved) return;
    const next = tiles.map((tile, i) =>
      i === index ? rotatePipe(tile) : tile,
    );
    setTiles(next);
    setMoves(moves + 1);
    if (circuitState(next).solved) onComplete(moves + 1);
  }
  return (
    <>
      <div className="circuit-board-wrap">
        <span className="circuit-input">IN</span>
        <div className="circuit-board" aria-label="三乘三电路板">
          {tiles.map((mask, index) => (
            <button
              key={index}
              className={`pipe-tile ${lit.has(index) ? 'energized' : ''}`}
              onClick={() => rotate(index)}
              disabled={solved}
              aria-label={`${index + 1} 号接头，顺时针旋转`}
              data-mask={mask}
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <path className="pipe-base" d="M50 50" />
                {[
                  [1, 50, 0],
                  [2, 100, 50],
                  [4, 50, 100],
                  [8, 0, 50],
                ]
                  .filter(([bit]) => mask & bit)
                  .map(([bit, x, y]) => (
                    <path key={bit} d={`M50 50 L${x} ${y}`} />
                  ))}
                <circle cx="50" cy="50" r="9" />
              </svg>
              <span>{String(index + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        <span className={`circuit-output ${solved ? 'connected' : ''}`}>
          OUT
        </span>
      </div>
      <div className="game-status" aria-live="polite">
        {solved ? (
          <>
            <Check size={18} />
            回路接通了。工坊的备用电源已经恢复。
          </>
        ) : (
          <span>
            {moves === 0
              ? '每次点击旋转 90°。亮起的管线代表电流。'
              : `已旋转 ${moves} 次 · 继续连接出口。`}
          </span>
        )}
      </div>
      <Button
        variant="outline"
        className="game-reset"
        onClick={() => {
          setTiles(initialCircuit());
          setMoves(0);
        }}
      >
        <RotateCcw size={14} />
        重新接线
      </Button>
    </>
  );
}
const ICONS = [BookOpen, Leaf, Cpu, Sparkles],
  NAMES = ['旧书', '叶片', '芯片', '星光'];
function MemoryGame({ onComplete }: { onComplete: (moves: number) => void }) {
  const [cards, setCards] = useState(shuffledSignals),
    [open, setOpen] = useState<number[]>([]),
    [matched, setMatched] = useState<number[]>([]),
    [moves, setMoves] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function flip(index: number) {
    if (open.length === 2 || open.includes(index) || matched.includes(index))
      return;
    const next = [...open, index];
    setOpen(next);
    if (next.length !== 2) return;
    const count = moves + 1;
    setMoves(count);
    if (cards[next[0]] === cards[next[1]]) {
      const found = [...matched, ...next];
      setMatched(found);
      setOpen([]);
      if (found.length === cards.length) onComplete(count);
    } else
      timer.current = setTimeout(() => {
        setOpen([]);
        timer.current = null;
      }, 800);
  }
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setCards(shuffledSignals());
    setOpen([]);
    setMatched([]);
    setMoves(0);
  }
  return (
    <>
      <div className="memory-board" aria-label="八块信号记忆片">
        {cards.map((value, index) => {
          const Icon = ICONS[value],
            visible = open.includes(index) || matched.includes(index),
            found = matched.includes(index);
          return (
            <button
              key={index}
              className={`signal-card ${visible ? 'flipped' : ''} ${found ? 'matched' : ''}`}
              onClick={() => flip(index)}
              disabled={found}
              aria-label={
                visible
                  ? `${index + 1} 号记忆片：${NAMES[value]}${found ? '，已配对' : ''}`
                  : `翻开 ${index + 1} 号记忆片`
              }
            >
              <span className="signal-back">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="signal-face">
                <Icon size={32} />
                <small>{NAMES[value]}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="game-status" aria-live="polite">
        {matched.length === 8 ? (
          <>
            <Check size={18} />
            四组图案都找到了，留一份好记忆在这里。
          </>
        ) : (
          <span>
            {matched.length / 2} / 4 组信号 · {moves} 次配对尝试
          </span>
        )}
      </div>
      <Button variant="outline" className="game-reset" onClick={reset}>
        <RotateCcw size={14} />
        重新洗牌
      </Button>
    </>
  );
}
