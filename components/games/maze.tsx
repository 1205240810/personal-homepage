'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Flag,
  RotateCcw,
  Shuffle,
  SkipForward,
} from 'lucide-react';
import { dailyKey, todayParts, type Today } from '@/lib/games/kit';
import {
  ALGORITHMS,
  E,
  MAZE_RECORDS_KEY,
  MAZE_SIZES,
  N,
  S,
  W,
  applyCarves,
  dailyMaze,
  emptyMazeRecords,
  generateMaze,
  mergeMazeRecord,
  move,
  run,
  solve,
  validateMazeRecords,
  type Algorithm,
  type Carve,
  type Maze,
  type MazeSize,
} from '@/lib/games/maze';
import {
  cssColors,
  useHydrated,
  useLocalRecords,
  useReducedMotion,
  useThemeName,
} from './kit';
import './kit.css';

const EMPTY = emptyMazeRecords();
const clock = () => performance.now();
const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
type Pick =
  | { kind: 'random'; size: MazeSize; alg: Algorithm; seed: number }
  | { kind: 'daily'; day: Today };
type Phase = 'building' | 'ready' | 'running' | 'done' | 'gave-up';
const KEY_DIR: Record<string, number> = {
  ArrowUp: N,
  w: N,
  W: N,
  ArrowRight: E,
  d: E,
  D: E,
  ArrowDown: S,
  s: S,
  S: S,
  ArrowLeft: W,
  a: W,
  A: W,
};
const DIR_NAME: Record<number, string> = {
  [N]: '上',
  [E]: '右',
  [S]: '下',
  [W]: '左',
};

function build(
  pick: Pick,
  ready: boolean,
): { steps: Carve[]; maze: Maze; alg: Algorithm; size: MazeSize } {
  if (pick.kind === 'daily' && ready) {
    const d = dailyMaze(pick.day);
    return { steps: d.steps, maze: d.maze, alg: d.alg, size: 'medium' };
  }
  const p =
    pick.kind === 'random'
      ? pick
      : { size: 'small' as MazeSize, alg: 'backtracker' as Algorithm, seed: 1 };
  return { ...generateMaze(p.alg, p.size, p.seed), alg: p.alg, size: p.size };
}

export function MazeRace() {
  const ready = useHydrated();
  const reduced = useReducedMotion();
  const theme = useThemeName();
  const [records, saveRecords] = useLocalRecords(
    MAZE_RECORDS_KEY,
    validateMazeRecords,
    EMPTY,
  );
  const [pick, setPick] = useState<Pick>({
    kind: 'random',
    size: 'small',
    alg: 'backtracker',
    seed: 20261013,
  });
  const [size, setSize] = useState<MazeSize>('medium');
  const [alg, setAlg] = useState<Algorithm>('backtracker');
  const [animatePick, setAnimate] = useState<boolean | null>(null);
  const animate = animatePick ?? !reduced;
  const game = useMemo(() => build(pick, ready), [pick, ready]);
  const { maze, steps } = game;
  const goal = maze.cells.length - 1;
  const [phase, setPhase] = useState<Phase>('ready');
  const [pos, setPos] = useState(0);
  const [trail, setTrail] = useState<number[]>([0]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [showPath, setShowPath] = useState(false);
  const [announce, setAnnounce] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const built = useRef(steps.length);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const today = ready ? todayParts() : null;
  const todayBest = today ? records.daily[dailyKey(today)] : undefined;

  useEffect(() => {
    if (phase !== 'running' || startedAt === null) return;
    const id = setInterval(() => setElapsed((clock() - startedAt) / 1000), 100);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  // Draw + generation animation.
  const live = useRef({ phase, pos, trail, showPath, maze, steps, goal });
  useEffect(() => {
    live.current = { phase, pos, trail, showPath, maze, steps, goal };
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const c = cssColors(canvas, {
      'games-paper': '#f6f5f1',
      'games-ink': '#282d29',
      'games-accent': '#6f7f2e',
      'kit-ok': '#15803d',
    });
    const tech = theme === 'tech';
    const player = tech ? '#ffb454' : '#c2410c';
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const l = live.current;
      const { width: w, height: h } = l.maze;
      if (built.current < l.steps.length) {
        built.current = Math.min(
          l.steps.length,
          built.current + Math.max(1, Math.ceil(l.steps.length / 150)),
        );
        if (built.current >= l.steps.length) setPhase('ready');
      }
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const cw = Math.round(canvas.clientWidth * dpr),
        ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const cell = Math.floor(Math.min((cw - 8 * dpr) / w, (ch - 8 * dpr) / h));
      // Layout can briefly hide the canvas during navigation or resizing.
      if (cell <= 0) return;
      const ox = Math.floor((cw - cell * w) / 2),
        oy = Math.floor((ch - cell * h) / 2);
      const m =
        built.current >= l.steps.length
          ? l.maze
          : applyCarves(w, h, l.steps, built.current);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = c['games-paper'];
      ctx.fillRect(0, 0, cw, ch);
      const center = (i: number) => [
        ox + ((i % w) + 0.5) * cell,
        oy + (Math.floor(i / w) + 0.5) * cell,
      ];
      if (built.current >= l.steps.length) {
        // Goal and trail.
        ctx.fillStyle = c['kit-ok'];
        ctx.globalAlpha = 0.35;
        ctx.fillRect(ox + (w - 1) * cell, oy + (h - 1) * cell, cell, cell);
        ctx.globalAlpha = 1;
        const drawPath = (
          path: number[],
          color: string,
          width: number,
          dash: number[],
        ) => {
          if (path.length < 2) return;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.setLineDash(dash);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          path.forEach((i, k) => {
            const [x, y] = center(i);
            if (k) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        };
        if (l.showPath)
          drawPath(
            solve(l.maze, 0, l.goal),
            c['kit-ok'],
            Math.max(2, cell * 0.15),
            [cell * 0.3, cell * 0.2],
          );
        ctx.globalAlpha = 0.5;
        drawPath(l.trail, c['games-accent'], Math.max(2, cell * 0.3), []);
        ctx.globalAlpha = 1;
        const [px, py] = center(l.pos);
        ctx.fillStyle = player;
        ctx.beginPath();
        ctx.arc(px, py, cell * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
      // Walls.
      ctx.strokeStyle = c['games-ink'];
      ctx.lineWidth = Math.max(1, Math.round(cell / 10));
      ctx.lineCap = 'square';
      ctx.beginPath();
      for (let i = 0; i < m.cells.length; i++) {
        const x = ox + (i % w) * cell,
          y = oy + Math.floor(i / w) * cell;
        const v = m.cells[i];
        if (!(v & N)) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + cell, y);
        }
        if (!(v & W)) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + cell);
        }
        if (i % w === w - 1 && !(v & E)) {
          ctx.moveTo(x + cell, y);
          ctx.lineTo(x + cell, y + cell);
        }
        if (Math.floor(i / w) === h - 1 && !(v & S)) {
          ctx.moveTo(x, y + cell);
          ctx.lineTo(x + cell, y + cell);
        }
      }
      ctx.stroke();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  function load(next: Pick) {
    const g = build(next, ready);
    setPick(next);
    setPos(0);
    setTrail([0]);
    setStartedAt(null);
    setElapsed(0);
    setResult(null);
    setShowPath(false);
    built.current = animate ? 0 : g.steps.length;
    setPhase(animate ? 'building' : 'ready');
    setAnnounce(
      `${MAZE_SIZES[g.size].name} 迷宫，${ALGORITHMS[g.alg].name}生成${animate ? '中' : '完成'}`,
    );
  }
  function skipBuild() {
    built.current = steps.length;
    setPhase('ready');
  }
  function go(dir: number, dash: boolean) {
    if (phase === 'building' || phase === 'done' || phase === 'gave-up') return;
    const to = dash ? run(maze, pos, dir) : move(maze, pos, dir);
    if (to === pos) {
      setAnnounce(`${DIR_NAME[dir]}边是墙`);
      return;
    }
    const now = clock();
    const start = startedAt ?? now;
    if (startedAt === null) {
      setStartedAt(now);
      setPhase('running');
    }
    setPos(to);
    const hops = solve(maze, pos, to).slice(1);
    setTrail((t) => {
      let next = t;
      for (const c of hops) {
        const k = next.lastIndexOf(c);
        next = k >= 0 ? next.slice(0, k + 1) : [...next, c];
      }
      return next;
    });
    if (to === goal) {
      const secs = Math.max(0.1, (now - start) / 1000);
      setResult(secs);
      setElapsed(secs);
      setPhase('done');
      saveRecords(
        mergeMazeRecord(
          records,
          game.size,
          secs,
          pick.kind === 'daily' ? dailyKey(pick.day) : undefined,
        ),
      );
      setAnnounce(`到达终点！用时 ${fmt(secs)}`);
    } else
      setAnnounce(
        `第 ${Math.floor(to / maze.width) + 1} 行第 ${(to % maze.width) + 1} 列`,
      );
  }
  function giveUp() {
    setShowPath(true);
    if (phase !== 'done') setPhase('gave-up');
  }

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
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
      if (d !== undefined) {
        e.preventDefault();
        go(d, e.shiftKey);
        return;
      }
      if (e.key === 'r' || e.key === 'R') load(pick);
    };
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const on = (e: KeyboardEvent) => keyRef.current(e);
    root.addEventListener('keydown', on);
    return () => root.removeEventListener('keydown', on);
  }, []);

  function onDown(e: RPointerEvent<HTMLCanvasElement>) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: RPointerEvent<HTMLCanvasElement>) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x,
      dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 18) return;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? E : W) : dy > 0 ? S : N, true);
  }

  const best = records.best[game.size];
  return (
    <div className="kit maze" ref={rootRef}>
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            MAZE · {MAZE_SIZES[game.size].name} ·{' '}
            {ALGORITHMS[game.alg].name.toUpperCase()}
          </p>
          <h2 className="kit-sr">迷宫竞速</h2>
        </div>
        <button
          type="button"
          aria-pressed={pick.kind === 'daily'}
          disabled={!ready}
          onClick={() => load({ kind: 'daily', day: todayParts() })}
        >
          <CalendarDays size={15} aria-hidden="true" /> 今日迷宫
          {todayBest ? ` · 最快 ${fmt(todayBest)}` : ''}
        </button>
      </header>
      <div className="kit-row">
        <select
          aria-label="尺寸"
          value={size}
          onChange={(e) => setSize(e.target.value as MazeSize)}
        >
          {(Object.keys(MAZE_SIZES) as MazeSize[]).map((s) => (
            <option key={s} value={s}>
              {MAZE_SIZES[s].name}
            </option>
          ))}
        </select>
        <select
          aria-label="生成算法"
          value={alg}
          onChange={(e) => setAlg(e.target.value as Algorithm)}
        >
          {(Object.keys(ALGORITHMS) as Algorithm[]).map((a) => (
            <option key={a} value={a}>
              {ALGORITHMS[a].name}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={animate}
            onChange={(e) => setAnimate(e.target.checked)}
          />{' '}
          动画生成
        </label>
        <button
          type="button"
          className="kit-primary"
          onClick={() =>
            load({
              kind: 'random',
              size,
              alg,
              seed: Math.floor(Math.random() * 1e9),
            })
          }
        >
          <Shuffle size={15} aria-hidden="true" /> 生成新迷宫
        </button>
        {phase === 'building' && (
          <button type="button" onClick={skipBuild}>
            <SkipForward size={15} aria-hidden="true" /> 跳过动画
          </button>
        )}
      </div>
      <div className="kit-row">
        <span className="kit-stats">
          <span>
            用时{' '}
            <strong className="kit-mono" data-testid="maze-time">
              {fmt(result ?? elapsed)}
            </strong>
          </span>
          {best !== undefined && <span>本档最快 {fmt(best)}</span>}
          <span>{ALGORITHMS[game.alg].note}</span>
        </span>
        <button
          type="button"
          onClick={() => load(pick)}
          aria-label="重新开始 (R)"
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={giveUp} disabled={phase === 'building'}>
          <Flag size={15} aria-hidden="true" /> 看答案
        </button>
      </div>
      {phase === 'done' && result !== null && (
        <output className="kit-ok">到达终点！用时 {fmt(result)}</output>
      )}
      {phase === 'gave-up' && (
        <output className="kit-bad">已显示最短路，这局不计成绩。</output>
      )}
      <canvas
        ref={canvasRef}
        className="kit-canvas"
        tabIndex={0}
        aria-label={`迷宫，从左上角走到右下角。当前在第 ${Math.floor(pos / maze.width) + 1} 行第 ${(pos % maze.width) + 1} 列。方向键移动，Shift+方向键快跑到岔路`}
        onPointerDown={onDown}
        onPointerUp={onUp}
      />
      <fieldset className="maze-pad" aria-label="方向键">
        {(
          [
            [N, ArrowUp, '上', 'n'],
            [W, ArrowLeft, '左', 'w'],
            [S, ArrowDown, '下', 's'],
            [E, ArrowRight, '右', 'e'],
          ] as const
        ).map(([d, Icon, name, cls]) => (
          <button
            key={d}
            type="button"

            className={`is-${cls}`}
            onClick={() => go(d, true)}
            aria-label={`向${name}跑`}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
      </fieldset>
      <p className="kit-help">
        方向键或 WASD 一步一格，按住 Shift
        一路跑到岔路口；手机上在迷宫上滑动或用下方方向键。第一步开始计时，走回头路会自动擦掉足迹。R
        重新开始。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
