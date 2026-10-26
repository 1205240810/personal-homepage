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
  Hourglass,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import {
  LEVELS,
  TIMELOOP_RECORDS_KEY,
  emptyTimeloopRecords,
  key,
  mergeTimeloopRecord,
  parseMap,
  simulate,
  validateTimeloopRecords,
  type Move,
} from '@/lib/games/timeloop';
import { useLocalRecords, useReducedMotion } from './kit';
import './kit.css';
import './palette.css';
import './timeloop.css';

const EMPTY = emptyTimeloopRecords();
const KEY_MOVE: Record<string, Move> = {
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
  ' ': 'W',
  '.': 'W',
};
const MOVE_NAME: Record<Move, string> = {
  U: '上',
  D: '下',
  L: '左',
  R: '右',
  W: '等待',
};

export function TimeLoop() {
  const reduced = useReducedMotion();
  const [records, saveRecords] = useLocalRecords(
    TIMELOOP_RECORDS_KEY,
    validateTimeloopRecords,
    EMPTY,
  );
  const [level, setLevel] = useState(0);
  const [loops, setLoops] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [announce, setAnnounce] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const lv = LEVELS[level];
  const map = parseMap(lv.rows);
  const sim = simulate(map, loops, current);
  const won = sim.won;
  const outOfTime = !won && current.length >= lv.loopLen;
  const canRewind =
    !won && current.length > 0 && loops.length + 1 < lv.maxLoops;

  function load(i: number) {
    const k = (i + LEVELS.length) % LEVELS.length;
    setLevel(k);
    setLoops([]);
    setCurrent('');
    setAnnounce(`第 ${k + 1} 关：${LEVELS[k].name}。${LEVELS[k].tip}`);
  }
  function act(mv: Move) {
    if (won) return;
    if (outOfTime) {
      setAnnounce('这一轮的时间用完了：回溯（T）或撤销（Z）');
      return;
    }
    const next = current + mv;
    const s = simulate(map, loops, next);
    if (mv !== 'W' && s.me.x === sim.me.x && s.me.y === sim.me.y) {
      setAnnounce(`向${MOVE_NAME[mv]}走不通`);
      return;
    }
    setCurrent(next);
    if (s.won) {
      const total = [...loops, next].reduce((n, l) => n + l.length, 0);
      saveRecords(mergeTimeloopRecord(records, lv.id, loops.length + 1, total));
      setAnnounce(`逃出去了！用了 ${loops.length + 1} 轮`);
    } else if (s.stuck.length > sim.stuck.length)
      setAnnounce('有个过去的自己被门挡住了，和录像对不上');
    else if (next.length >= lv.loopLen) setAnnounce('时间到，按 T 回溯');
  }
  function rewind() {
    if (!canRewind) {
      setAnnounce(
        loops.length + 1 >= lv.maxLoops
          ? `本关最多 ${lv.maxLoops} 轮`
          : '这一轮还没有动作',
      );
      return;
    }
    setLoops([...loops, current]);
    setCurrent('');
    setAnnounce(
      `回溯！第 ${loops.length + 2} 轮开始，${loops.length + 1} 个过去的自己会重演`,
    );
  }
  function undo() {
    if (current) setCurrent(current.slice(0, -1));
    else if (loops.length) {
      setCurrent(loops[loops.length - 1]);
      setLoops(loops.slice(0, -1));
      setAnnounce('撤回到上一轮的结尾');
    }
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
      if (t?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter'))
        return;
      const mv = KEY_MOVE[e.key];
      if (mv) {
        e.preventDefault();
        act(mv);
      } else if (e.key === 't' || e.key === 'T' || e.key === 'Enter') {
        e.preventDefault();
        rewind();
      } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
        e.preventDefault();
        undo();
      } else if (e.key === 'r' || e.key === 'R') load(level);
      else if ((e.key === 'n' || e.key === 'N') && won) load(level + 1);
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
    act(
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U',
    );
  }

  const cells: React.ReactNode[] = [];
  lv.rows.forEach((row, y) =>
    Array.from(row).forEach((ch, x) => {
      const k = key(x, y);
      const plate = map.plates.get(k);
      const door = map.doors.get(k);
      let cls = 'tl-cell';
      let label = '';
      if (ch === '#') cls += ' is-wall';
      else if (plate) {
        cls += ` is-plate${sim.open.has(plate) ? ' is-down' : ''}`;
        label = plate.toUpperCase();
      } else if (door) {
        const inv = door.startsWith('!');
        const letter = door.replace('!', '');
        const open = inv ? !sim.open.has(letter) : sim.open.has(letter);
        cls += ` is-door${inv ? ' is-inverse' : ''}${open ? ' is-open' : ''}`;
        label = letter.toUpperCase();
      } else if (ch === 'E') {
        cls += ' is-exit';
        label = '出';
      } else if (ch === 'S') cls += ' is-start';
      if (ch !== '#' && ch !== '.' && ch !== 'S')
        cells.push(
          <span
            key={k}
            className={cls}
            style={{ gridColumn: x + 1, gridRow: y + 1 }}
          >
            {label}
          </span>,
        );
      else if (ch === '#' || ch === 'S')
        cells.push(
          <span
            key={k}
            className={cls}
            style={{ gridColumn: x + 1, gridRow: y + 1 }}
          />,
        );
    }),
  );

  const best = records.best[lv.id];
  const solved = LEVELS.filter((l) => records.best[l.id]).length;
  const doorText = [...map.doors.entries()]
    .map(([k, d]) => {
      const letter = d.replace('!', '');
      const open = d.startsWith('!')
        ? !sim.open.has(letter)
        : sim.open.has(letter);
      return `${d.startsWith('!') ? '反向门' : '门'}${letter.toUpperCase()}${open ? '开' : '关'}（第 ${Number(k.split(',')[1]) + 1} 行第 ${Number(k.split(',')[0]) + 1} 列）`;
    })
    .join('，');
  return (
    <div className="kit timeloop" ref={rootRef}>
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            TIME LOOP · {level + 1}/{LEVELS.length} · 已通关 {solved}
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
            第 <strong className="kit-mono">{loops.length + 1}</strong>/
            {lv.maxLoops} 轮
          </span>
          <span>
            时间{' '}
            <strong className="kit-mono" data-testid="tl-time">
              {current.length}
            </strong>
            /{lv.loopLen}
          </span>
          {best && (
            <span>
              最佳 {best.loops} 轮 · {best.moves} 步
            </span>
          )}
        </span>
        <button
          type="button"
          className="kit-primary"
          onClick={rewind}
          disabled={!canRewind}
        >
          <Hourglass size={15} aria-hidden="true" /> 回溯 (T)
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!current && !loops.length}
        >
          <Undo2 size={15} aria-hidden="true" /> 撤销 (Z)
        </button>
        <button type="button" onClick={() => load(level)}>
          <RotateCcw size={15} aria-hidden="true" /> 重来 (R)
        </button>
      </div>
      <div className="tl-timeline" aria-hidden="true">
        {Array.from({ length: lv.loopLen }, (_, i) => (
          <span key={i} className={i < current.length ? 'is-used' : ''} />
        ))}
      </div>
      {won && (
        <output className="kit-ok">
          逃出去了！用了 {loops.length + 1} 轮。
          <button
            type="button"
            className="kit-primary"
            onClick={() => load(level + 1)}
          >
            下一关 (N)
          </button>
        </output>
      )}
      {outOfTime && (
        <output className="kit-bad">
          时间到。
          {canRewind
            ? '按 T 回溯，让这一轮成为过去的自己。'
            : '轮数用完了，撤销或重来吧。'}
        </output>
      )}
      {sim.stuck.length > 0 && !won && (
        <p className="kit-help">
          ⚠ 第 {sim.stuck.map((i) => i + 1).join('、')}{' '}
          轮的自己被门挡住，没能照录像走。
        </p>
      )}
      <div
        className={`tl-board${reduced ? ' is-still' : ''}`}
        style={{ ['--w' as string]: map.w, ['--h' as string]: map.h }}
        // Keyboard-driven game surface, same as the maze canvas.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={`时间回溯棋盘，${map.w}×${map.h}。你在第 ${sim.me.y + 1} 行第 ${sim.me.x + 1} 列，出口在第 ${map.exit.y + 1} 行第 ${map.exit.x + 1} 列。${doorText}。方向键移动，空格等待，T 回溯。`}
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        {cells}
        {sim.past.map((p, i) => (
          <span
            key={`past-${i}`}
            className={`tl-self is-past${sim.stuck.includes(i) ? ' is-stuck' : ''}`}
            style={{ transform: `translate(${p.x * 100}%, ${p.y * 100}%)` }}
            title={`第 ${i + 1} 轮的自己`}
          >
            {i + 1}
          </span>
        ))}
        <span
          className="tl-self is-me"
          style={{
            transform: `translate(${sim.me.x * 100}%, ${sim.me.y * 100}%)`,
          }}
          title="现在的你"
        >
          你
        </span>
      </div>
      <fieldset className="maze-pad tl-pad" aria-label="方向键">
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
            onClick={() => act(d)}
            aria-label={`向${MOVE_NAME[d]}`}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
        <button type="button" className="is-wait" onClick={() => act('W')}>
          等
        </button>
      </fieldset>
      <p className="kit-help">
        方向键/WASD 走一格，空格或「等」原地等一拍；T（或
        Enter）回溯：这一轮的录像交给“过去的自己”，
        你从起点重新出发，所有人同时开跑。踩住压力板，同字母的门就开；红框的反向门正相反。Z
        撤销，R 重来。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
