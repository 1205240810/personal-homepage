'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import {
  LEVELS,
  NOUN_NAMES,
  RULEWORDS_RECORDS_KEY,
  WORD_NAMES,
  emptyRulewordsRecords,
  mergeRulewordsRecord,
  readRules,
  start,
  step,
  validateRulewordsRecords,
  type Board,
  type Dir,
  type Noun,
  type Obj,
} from '@/lib/games/rulewords';
import { useLocalRecords, useReducedMotion } from './kit';
import './kit.css';
import { focusResultBoard, GameResult } from './result';
import './palette.css';
import './rulewords.css';

const EMPTY = emptyRulewordsRecords();
const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'U',
  ArrowDown: 'D',
  ArrowLeft: 'L',
  ArrowRight: 'R',
  w: 'U',
  s: 'D',
  a: 'L',
  d: 'R',
  W: 'U',
  S: 'D',
  A: 'L',
  D: 'R',
};
const DIR_NAME: Record<Dir, string> = { U: '上', D: '下', L: '左', R: '右' };
const THING_GLYPH: Record<Noun, string> = {
  bot: '◆',
  wall: '',
  rock: '●',
  flag: '⚑',
  water: '≈',
  lava: '≋',
  gear: '✲',
};

function describe(o: Obj) {
  return o.word ? `字块「${WORD_NAMES[o.word]}」` : NOUN_NAMES[o.thing!];
}

export function RuleWords() {
  const reduced = useReducedMotion();
  const [records, saveRecords] = useLocalRecords(
    RULEWORDS_RECORDS_KEY,
    validateRulewordsRecords,
    EMPTY,
  );
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState<Board[]>(() => [
    start(LEVELS[0].rows),
  ]);
  const [won, setWon] = useState(false);
  const [announce, setAnnounce] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const lv = LEVELS[level];
  const board = history[history.length - 1];
  const rules = readRules(board);
  const moves = history.length - 1;
  const hasYou = board.objs.some((o) =>
    o.word ? false : rules.props.get(o.thing!)?.has('you'),
  );

  function load(i: number) {
    focusResultBoard(rootRef.current?.querySelector<HTMLElement>('.rw-board'));
    const k = (i + LEVELS.length) % LEVELS.length;
    setLevel(k);
    setHistory([start(LEVELS[k].rows)]);
    setWon(false);
    setAnnounce(`第 ${k + 1} 关：${LEVELS[k].name}。${LEVELS[k].tip}`);
  }
  function undo() {
    if (history.length < 2) return;
    setHistory(history.slice(0, -1));
    setWon(false);
    setAnnounce('撤销一步');
  }
  function go(d: Dir) {
    if (won) return;
    const o = step(board, d);
    if (!o.moved && !o.won) {
      setAnnounce(
        hasYou ? `向${DIR_NAME[d]}推不动` : '场上没有“你”，请撤销或重来',
      );
      return;
    }
    setHistory([...history, o.board]);
    if (o.won) {
      setWon(true);
      saveRecords(mergeRulewordsRecord(records, lv.id, moves + 1));
      setAnnounce(`过关！用了 ${moves + 1} 步`);
    } else if (o.lost) setAnnounce('“你”不见了——撤销（Z）或重来（R）');
    else setAnnounce(readRules(o.board).lines.join('，'));
  }

  useEffect(() => {
    keyRef.current = (e) => {
      const t = e.target as HTMLElement | null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (t && /INPUT|SELECT|TEXTAREA/.test(t.tagName))
      )
        return;
      const d = KEY_DIR[e.key];
      if (d) {
        e.preventDefault();
        go(d);
      } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
        e.preventDefault();
        undo();
      } else if (e.key === 'r' || e.key === 'R') load(level);
      else if (e.key === 'n' && won) load(level + 1);
    };
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const on = (e: KeyboardEvent) => keyRef.current(e);
    root.addEventListener('keydown', on);
    return () => root.removeEventListener('keydown', on);
  }, []);

  function onDown(e: RPointerEvent<HTMLDivElement>) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: RPointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 18) return;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
  }

  const best = records.best[lv.id];
  const solved = LEVELS.filter((l) => records.best[l.id]).length;
  return (
    <div className="kit rulewords" ref={rootRef}>
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            RULE WORDS · {level + 1}/{LEVELS.length} · 已通关 {solved}
          </p>
          <h2>
            {level + 1}. {lv.name}
          </h2>
        </div>
        <div className="kit-row">
          <button
            type="button"
            onClick={() => load(level - 1)}
            aria-label="上一关"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <select
            aria-label="选择关卡"
            value={level}
            onChange={(e) => load(Number(e.target.value))}
          >
            {LEVELS.map((l, i) => (
              <option key={l.id} value={i}>
                {i + 1}. {l.name}
                {records.best[l.id] ? ' ✓' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load(level + 1)}
            aria-label="下一关"
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <p className="kit-brief">{lv.tip}</p>
      <div className="kit-row">
        <span className="kit-stats">
          <span>
            步数 <strong className="kit-mono">{moves}</strong>
          </span>
          {best !== undefined && <span>最少 {best} 步</span>}
          <span>参考解 {lv.solution.length} 步</span>
        </span>
        <button type="button" onClick={undo} disabled={moves === 0}>
          <Undo2 size={15} aria-hidden="true" /> 撤销 (Z)
        </button>
        <button type="button" onClick={() => load(level)}>
          <RotateCcw size={15} aria-hidden="true" /> 重来 (R)
        </button>
      </div>
      {won && (
        <GameResult
          tone="win"
          title={`过关！${moves} 步`}
          actions={[
            { label: '重玩', shortcut: 'R', onClick: () => load(level) },
            {
              label: '下一关',
              primary: true,
              shortcut: 'N',
              onClick: () => load(level + 1),
            },
          ]}
        />
      )}
      {!won && !hasYou && (
        <GameResult
          tone="lose"
          title="场上没有“你”了"
          actions={[
            {
              label: '重来',
              primary: true,
              shortcut: 'R',
              onClick: () => load(level),
            },
          ]}
        >
          撤销（Z）或重来。
        </GameResult>
      )}
      <div
        className={`rw-board${reduced ? ' is-still' : ''}`}
        style={{ ['--w' as string]: board.w, ['--h' as string]: board.h }}
        // Keyboard-driven game surface, same as the maze canvas.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={`关卡棋盘，${board.w}×${board.h}。当前规则：${rules.lines.join('，') || '无'}。方向键移动。`}
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        {board.objs.map((o) => (
          <span
            key={o.id}
            className={
              o.word
                ? `rw-word is-${o.word}${rules.lines.length && isActive(board, o) ? ' is-on' : ''}`
                : `rw-thing is-${o.thing}`
            }
            style={{
              transform: `translate(${o.x * 100}%, ${o.y * 100}%)${o.word ? ' scale(0.86)' : ''}`,
            }}
            title={describe(o)}
          >
            {o.word ? WORD_NAMES[o.word] : THING_GLYPH[o.thing!]}
          </span>
        ))}
      </div>
      <fieldset className="maze-pad" aria-label="方向键">
        {(
          [
            ['U', ArrowUp, 'n'],
            ['L', ArrowLeft, 'w'],
            ['D', ArrowDown, 's'],
            ['R', ArrowRight, 'e'],
          ] as const
        ).map(([d, Icon, cls]) => (
          <button
            key={d}
            type="button"
            className={`is-${cls}`}
            onClick={() => go(d)}
            aria-label={`向${DIR_NAME[d]}`}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
      </fieldset>
      <div className="rw-rules">
        <strong>当前规则</strong>
        {rules.lines.length ? (
          <ul>
            {rules.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <span>（没有成立的规则）</span>
        )}
      </div>
      <p className="kit-help">
        方向键/WASD 移动，手机上在棋盘滑动或用方向键；Z 撤销，R 重来。
        字块排成「名词 是 属性」（横着或竖着）就成了规则；属性有
        你、赢、挡、推、沉、烫， 名词接名词会让东西变身。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/** A word is lit when it is part of any complete rule. */
function isActive(b: Board, o: Obj) {
  const at = (x: number, y: number) =>
    b.objs.filter((p) => p.word && p.x === x && p.y === y);
  const nounAt = (x: number, y: number) =>
    at(x, y).some((p) => p.word && p.word in NOUN_NAMES);
  const tailAt = (x: number, y: number) =>
    at(x, y).some((p) => p.word && p.word !== 'is');
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ]) {
    for (let k = 0; k < 3; k++) {
      const ix = o.x + dx * (1 - k);
      const iy = o.y + dy * (1 - k);
      if (
        at(ix, iy).some((p) => p.word === 'is') &&
        nounAt(ix - dx, iy - dy) &&
        tailAt(ix + dx, iy + dy)
      )
        return true;
    }
  }
  return false;
}
