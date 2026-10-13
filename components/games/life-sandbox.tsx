'use client';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  CalendarDays,
  Eraser,
  Hand,
  Maximize2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipForward,
  Stamp,
  Trash2,
  Trophy,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CHALLENGES,
  CHALLENGE_BOARD,
  LIFE_RECORDS_KEY,
  PATTERNS,
  challengeZone,
  cloneBoard,
  createBoard,
  dailyChallenge,
  dailyKey,
  emptyLifeRecords,
  evaluateChallenge,
  getPattern,
  inZone,
  lifeRandom,
  loadLifeRecords,
  mergeLifeRecord,
  patternCells,
  patternSize,
  population,
  randomize,
  saveLifeRecords,
  step,
  type Board,
  type Challenge,
  type ChallengeResult,
  type LifeRecords,
  type PatternId,
} from '@/lib/games/life';
import { THEME_EVENT } from '@/lib/theme';
import './life.css';

export const SANDBOX_SIZE = { width: 160, height: 120 } as const;
const MIN_CELL = 2;
const MAX_CELL = 48;
const SPEEDS = [1, 2, 4, 8, 12, 20, 30, 60] as const;

type Tool = 'draw' | 'erase' | 'pan' | 'stamp';
type Mode = 'sandbox' | 'challenge';
type View = { cell: number; x: number; y: number };
type Sim = {
  board: Board;
  spare: Uint8Array;
  seed: Board | null;
  view: View;
  dirty: boolean;
  hover: [number, number] | null;
};
type Today = { year: number; month: number; day: number };

// ---------------------------------------------------------------------------
// External stores: hydration flag, reduced motion and local records.

const noopSubscribe = () => () => {};
function subscribeMotion(cb: () => void) {
  if (typeof matchMedia === 'undefined') return () => {};
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const motionSnapshot = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const RECORDS_EVENT = 'tscjj-life-records';
const EMPTY_RECORDS = emptyLifeRecords();
let recordsCache: { raw: string | null; value: LifeRecords } = {
  raw: null,
  value: EMPTY_RECORDS,
};
function readRecords(): LifeRecords {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LIFE_RECORDS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== recordsCache.raw)
    recordsCache = { raw, value: loadLifeRecords() };
  return recordsCache.value;
}
function subscribeRecords(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(RECORDS_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(RECORDS_EVENT, cb);
  };
}

function todayParts(): Today {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

function readColors(el: HTMLElement) {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--life-bg', '#f6f5f1'),
    cell: v('--life-cell', '#282d29'),
    grid: v('--life-grid', '#e2e4dc'),
    zone: v('--life-zone', '#7c8f3a'),
    ghost: v('--life-ghost', '#7c8f3a'),
    cursor: v('--life-cursor', '#c2410c'),
  };
}

function makeSim(mode: Mode): Sim {
  const size = mode === 'challenge' ? CHALLENGE_BOARD : SANDBOX_SIZE;
  const board = createBoard(size.width, size.height);
  return {
    board,
    spare: new Uint8Array(board.cells.length),
    seed: null,
    view: { cell: 8, x: 0, y: 0 },
    dirty: true,
    hover: null,
  };
}

function resizeCanvas(canvas: HTMLCanvasElement, s: Sim) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  s.dirty = true;
}
function fitView(s: Sim, c: HTMLCanvasElement) {
  const w = c.clientWidth,
    h = c.clientHeight;
  const raw = Math.min(w / s.board.width, h / s.board.height) || 8;
  const cell = Math.max(
    MIN_CELL,
    Math.min(MAX_CELL, Math.floor(raw * 10) / 10),
  );
  s.view = {
    cell,
    x: (w - s.board.width * cell) / 2,
    y: (h - s.board.height * cell) / 2,
  };
  s.dirty = true;
}

/** Cells on the segment between two grid points (Bresenham). */
function line(x0: number, y0: number, x1: number, y1: number) {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 4096; i++) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

export function LifeSandbox() {
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const reduced = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    () => false,
  );
  const records = useSyncExternalStore(
    subscribeRecords,
    readRecords,
    () => EMPTY_RECORDS,
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: 'paint' | 'pan' | 'pinch' | null;
    value: boolean;
    last: [number, number] | null;
    panFrom: { x: number; y: number; vx: number; vy: number } | null;
    pinch: {
      dist: number;
      cell: number;
      cx: number;
      cy: number;
      vx: number;
      vy: number;
    } | null;
  }>({ kind: null, value: true, last: null, panFrom: null, pinch: null });

  const [mode, setMode] = useState<Mode>('sandbox');
  const [challengeId, setChallengeId] = useState<string>(CHALLENGES[0].id);
  const [wrap, setWrap] = useState(true);
  const [running, setRunning] = useState(false);
  const [speedPick, setSpeedPick] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>('draw');
  const [patternId, setPatternId] = useState<PatternId>('glider');
  const [turns, setTurns] = useState(0);
  const [counts, setCounts] = useState({ generation: 0, population: 0 });
  const [cursor, setCursor] = useState<[number, number]>([0, 0]);
  const [announce, setAnnounce] = useState('');
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [saveNote, setSaveNote] = useState('');
  const [seedCount, setSeedCount] = useState(0);
  // Keep the selected daily challenge stable until the player starts it again.
  const [today, setToday] = useState(todayParts);

  const speedIndex = speedPick ?? (reduced ? 1 : 4);
  const speed = SPEEDS[speedIndex];
  const daily = ready ? dailyChallenge(today) : null;
  const challenge: Challenge | null =
    mode !== 'challenge'
      ? null
      : challengeId === 'daily' && daily
        ? daily
        : (CHALLENGES.find((c) => c.id === challengeId) ?? CHALLENGES[0]);
  const effectiveWrap = mode === 'challenge' ? false : wrap;
  const dailyDone = ready && records.daily.includes(dailyKey(today));
  const editable = mode === 'sandbox' || counts.generation === 0;

  function sim(): Sim {
    if (!simRef.current) simRef.current = makeSim(mode);
    return simRef.current;
  }
  function sync() {
    const s = sim();
    s.dirty = true;
    setCounts((prev) => {
      const pop = population(s.board);
      return prev.population === pop ? prev : { ...prev, population: pop };
    });
  }
  function fit() {
    if (canvasRef.current) fitView(sim(), canvasRef.current);
  }
  function zoomAt(factor: number, px?: number, py?: number) {
    const s = sim();
    const c = canvasRef.current;
    const cx = px ?? (c ? c.clientWidth / 2 : 0);
    const cy = py ?? (c ? c.clientHeight / 2 : 0);
    const v = s.view;
    const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, v.cell * factor));
    const k = cell / v.cell;
    s.view = { cell, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    s.dirty = true;
  }

  // Canvas size + render loop + simulation clock. Runs once per board/mode.
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const wrapRefLive = useRef(effectiveWrap);
  const challengeRef = useRef(challenge);
  const toolRef = useRef<{
    tool: Tool;
    rows: string[];
    turns: number;
    cursor: [number, number];
    showCursor: boolean;
  }>({
    tool,
    rows: getPattern(patternId).rows,
    turns,
    cursor,
    showCursor: false,
  });
  useEffect(() => {
    runningRef.current = running;
    speedRef.current = speed;
    wrapRefLive.current = effectiveWrap;
    challengeRef.current = challenge;
    toolRef.current = {
      ...toolRef.current,
      tool,
      rows: getPattern(patternId).rows,
      turns,
      cursor,
    };
    if (simRef.current) simRef.current.dirty = true;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let colors = readColors(canvas);
    const s = simRef.current ?? (simRef.current = makeSim(mode));
    const resize = () => resizeCanvas(canvas, s);
    resize();
    fitView(s, canvas);
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    const recolor = () => {
      colors = readColors(canvas);
      s.dirty = true;
    };
    window.addEventListener(THEME_EVENT, recolor);
    const mo = new MutationObserver(recolor);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastCount = 0;
    const draw = () => {
      if (!ctx) return;
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      const { cell, x: ox, y: oy } = s.view;
      const { width: W, height: H, cells } = s.board;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const x0 = Math.max(0, Math.floor(-ox / cell));
      const y0 = Math.max(0, Math.floor(-oy / cell));
      const x1 = Math.min(W, Math.ceil((canvas.clientWidth - ox) / cell));
      const y1 = Math.min(H, Math.ceil((canvas.clientHeight - oy) / cell));
      if (cell >= 6) {
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = x0; x <= x1; x++) {
          const px = Math.round(ox + x * cell) + 0.5;
          ctx.moveTo(px, oy + y0 * cell);
          ctx.lineTo(px, oy + y1 * cell);
        }
        for (let y = y0; y <= y1; y++) {
          const py = Math.round(oy + y * cell) + 0.5;
          ctx.moveTo(ox + x0 * cell, py);
          ctx.lineTo(ox + x1 * cell, py);
        }
        ctx.stroke();
      }
      const ch = challengeRef.current;
      if (ch) {
        const z = challengeZone(ch);
        ctx.fillStyle = colors.zone;
        ctx.globalAlpha = 0.12;
        ctx.fillRect(
          ox + z.x * cell,
          oy + z.y * cell,
          z.width * cell,
          z.height * cell,
        );
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.zone;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(
          ox + z.x * cell + 0.5,
          oy + z.y * cell + 0.5,
          z.width * cell,
          z.height * cell,
        );
        ctx.setLineDash([]);
      }
      ctx.fillStyle = colors.cell;
      const pad = cell >= 6 ? 1 : 0;
      for (let y = y0; y < y1; y++) {
        const row = y * W;
        for (let x = x0; x < x1; x++)
          if (cells[row + x])
            ctx.fillRect(
              ox + x * cell + pad,
              oy + y * cell + pad,
              cell - pad,
              cell - pad,
            );
      }
      if (!wrapRefLive.current) {
        ctx.strokeStyle = colors.zone;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox - 1, oy - 1, W * cell + 2, H * cell + 2);
        ctx.lineWidth = 1;
      }
      const t = toolRef.current;
      const hover = s.hover ?? (t.showCursor ? t.cursor : null);
      if (t.tool === 'stamp' && hover) {
        ctx.fillStyle = colors.ghost;
        ctx.globalAlpha = 0.45;
        for (const [dx, dy] of patternCells(t.rows, t.turns)) {
          let cx = hover[0] + dx,
            cy = hover[1] + dy;
          if (wrapRefLive.current) {
            cx = ((cx % W) + W) % W;
            cy = ((cy % H) + H) % H;
          }
          ctx.fillRect(ox + cx * cell, oy + cy * cell, cell, cell);
        }
        ctx.globalAlpha = 1;
      }
      if (t.showCursor) {
        ctx.strokeStyle = colors.cursor;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          ox + t.cursor[0] * cell,
          oy + t.cursor[1] * cell,
          cell,
          cell,
        );
        ctx.lineWidth = 1;
      }
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(250, now - last);
      last = now;
      if (runningRef.current) {
        acc += dt;
        const interval = 1000 / speedRef.current;
        let steps = 0;
        while (acc >= interval && steps < 4) {
          advance(s, wrapRefLive.current);
          acc -= interval;
          steps++;
        }
        if (acc > interval) acc = 0;
        if (steps) {
          s.dirty = true;
          lastCount += steps;
          const added = lastCount;
          lastCount = 0;
          const pop = population(s.board);
          setCounts((p) => ({
            generation: p.generation + added,
            population: pop,
          }));
          if (!pop) setRunning(false);
        }
      } else acc = 0;
      if (s.dirty) {
        s.dirty = false;
        draw();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener(THEME_EVENT, recolor);
    };
  }, [mode]);

  // ---- board actions -----------------------------------------------------
  function resetCounts(gen = 0) {
    setCounts({ generation: gen, population: population(sim().board) });
  }
  function doStep() {
    const s = sim();
    if (counts.generation === 0) {
      s.seed = cloneBoard(s.board);
      setSeedCount(population(s.board));
    }
    advance(s, effectiveWrap);
    s.dirty = true;
    setCounts((p) => ({
      generation: p.generation + 1,
      population: population(s.board),
    }));
  }
  function togglePlay() {
    const s = sim();
    if (!running) {
      if (!population(s.board)) {
        setAnnounce('棋盘是空的，先画几个细胞');
        return;
      }
      if (counts.generation === 0) {
        s.seed = cloneBoard(s.board);
        setSeedCount(population(s.board));
      }
    }
    setRunning(!running);
    setAnnounce(running ? '已暂停' : '开始演化');
  }
  function clear() {
    const s = sim();
    s.board.cells.fill(0);
    s.seed = null;
    s.dirty = true;
    setRunning(false);
    setResult(null);
    resetCounts();
    setAnnounce('已清空');
  }
  function randomFill() {
    const s = sim();
    setRunning(false);
    setResult(null);
    s.seed = null;
    if (challenge) {
      // Random seeds inside the build zone, within budget.
      s.board.cells.fill(0);
      const z = challengeZone(challenge);
      let left = challenge.budget;
      for (let tries = 0; left > 0 && tries < 500; tries++) {
        const x = z.x + Math.floor(Math.random() * z.width);
        const y = z.y + Math.floor(Math.random() * z.height);
        const i = y * s.board.width + x;
        if (!s.board.cells[i]) {
          s.board.cells[i] = 1;
          left--;
        }
      }
    } else
      randomize(s.board, 0.22, lifeRandom((Math.random() * 2 ** 32) >>> 0));
    s.dirty = true;
    resetCounts();
    setAnnounce('已随机铺满');
  }
  function backToSeed() {
    const s = sim();
    if (!s.seed) return;
    s.board = cloneBoard(s.seed);
    s.spare = new Uint8Array(s.board.cells.length);
    s.seed = null;
    s.dirty = true;
    setRunning(false);
    resetCounts();
    setAnnounce('回到第 0 代');
  }
  function switchMode(next: Mode, id?: string) {
    setRunning(false);
    setResult(null);
    setSaveNote('');
    if (id === 'daily') setToday(todayParts());
    if (id) setChallengeId(id);
    if (next !== mode) {
      simRef.current = makeSim(next);
      setMode(next);
      setCounts({ generation: 0, population: 0 });
    } else if (next === 'challenge') {
      sim().board.cells.fill(0);
      sim().seed = null;
      sim().dirty = true;
      setCounts({ generation: 0, population: 0 });
    }
  }
  function verify() {
    if (!challenge) return;
    const s = sim();
    const seed = counts.generation === 0 ? s.board : s.seed;
    if (!seed) return;
    const r = evaluateChallenge(challenge, seed);
    setResult(r);
    if (r.ok) {
      const next = mergeLifeRecord(records, challenge.id, r.cells);
      const saved = saveLifeRecords(next);
      window.dispatchEvent(new Event(RECORDS_EVENT));
      setSaveNote(saved === 'saved' ? '' : '本机存储不可用，记录不会保留');
      setAnnounce(`通过：${r.detail}`);
    } else setAnnounce(`未通过：${r.reason}`);
  }

  function canEdit(x: number, y: number) {
    if (!editable) return false;
    if (challenge && !inZone(challenge, x, y)) return false;
    return true;
  }
  function paint(x: number, y: number, value: boolean) {
    const s = sim();
    if (!canEdit(x, y)) return;
    const i = y * s.board.width + x;
    if (x < 0 || y < 0 || x >= s.board.width || y >= s.board.height) return;
    if (s.board.cells[i] !== (value ? 1 : 0)) setResult(null);
    s.board.cells[i] = value ? 1 : 0;
    s.dirty = true;
  }
  function stampAt(x: number, y: number) {
    const s = sim();
    if (!editable) {
      setAnnounce('挑战进行中不能改种子，先回到第 0 代');
      return;
    }
    setResult(null);
    const rows = getPattern(patternId).rows;
    let blocked = 0;
    for (const [dx, dy] of patternCells(rows, turns)) {
      let cx = x + dx,
        cy = y + dy;
      if (effectiveWrap) {
        cx = ((cx % s.board.width) + s.board.width) % s.board.width;
        cy = ((cy % s.board.height) + s.board.height) % s.board.height;
      }
      if (
        canEdit(cx, cy) &&
        cx >= 0 &&
        cy >= 0 &&
        cx < s.board.width &&
        cy < s.board.height
      )
        s.board.cells[cy * s.board.width + cx] = 1;
      else blocked++;
    }
    sync();
    setAnnounce(
      `已放置${getPattern(patternId).name}` +
        (blocked ? `，${blocked} 格超出可画区域被略过` : ''),
    );
  }

  // ---- pointer input -----------------------------------------------------
  function toCell(e: { clientX: number; clientY: number }): [number, number] {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const v = sim().view;
    return [
      Math.floor((e.clientX - r.left - v.x) / v.cell),
      Math.floor((e.clientY - r.top - v.y) / v.cell),
    ];
  }
  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    c.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const s = sim();
    toolRef.current.showCursor = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = c.getBoundingClientRect();
      g.kind = 'pinch';
      g.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cell: s.view.cell,
        cx: (a.x + b.x) / 2 - r.left,
        cy: (a.y + b.y) / 2 - r.top,
        vx: s.view.x,
        vy: s.view.y,
      };
      return;
    }
    if (tool === 'pan' || e.button === 1 || e.button === 2) {
      g.kind = 'pan';
      g.panFrom = { x: e.clientX, y: e.clientY, vx: s.view.x, vy: s.view.y };
      return;
    }
    const [x, y] = toCell(e);
    if (tool === 'stamp') {
      stampAt(x, y);
      g.kind = null;
      return;
    }
    g.kind = 'paint';
    g.value = tool === 'draw' ? !s.board.cells[y * s.board.width + x] : false;
    g.last = [x, y];
    paint(x, y, g.value);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const s = sim();
    const g = gesture.current;
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === 'pinch' && g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const r = e.currentTarget.getBoundingClientRect();
      const p = g.pinch;
      const cell = Math.max(
        MIN_CELL,
        Math.min(
          MAX_CELL,
          (p.cell * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist,
        ),
      );
      const k = cell / p.cell;
      const mx = (a.x + b.x) / 2 - r.left,
        my = (a.y + b.y) / 2 - r.top;
      s.view = { cell, x: mx - (p.cx - p.vx) * k, y: my - (p.cy - p.vy) * k };
      s.dirty = true;
      return;
    }
    if (g.kind === 'pan' && g.panFrom) {
      s.view = {
        ...s.view,
        x: g.panFrom.vx + e.clientX - g.panFrom.x,
        y: g.panFrom.vy + e.clientY - g.panFrom.y,
      };
      s.dirty = true;
      return;
    }
    const [x, y] = toCell(e);
    if (g.kind === 'paint' && g.last) {
      for (const [lx, ly] of line(g.last[0], g.last[1], x, y))
        paint(lx, ly, g.value);
      g.last = [x, y];
      return;
    }
    if (
      tool === 'stamp' &&
      (!s.hover || s.hover[0] !== x || s.hover[1] !== y)
    ) {
      s.hover = [x, y];
      s.dirty = true;
    }
  }
  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'paint') sync();
    if (pointers.current.size === 0) {
      g.kind = null;
      g.last = null;
      g.panFrom = null;
      g.pinch = null;
    }
  }
  function onPointerLeave() {
    const s = sim();
    if (s.hover) {
      s.hover = null;
      s.dirty = true;
    }
  }
  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const s = simRef.current;
      if (!s) return;
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const f = Math.exp(-e.deltaY * 0.0015);
        const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, s.view.cell * f));
        const k = cell / s.view.cell;
        const px = e.clientX - r.left,
          py = e.clientY - r.top;
        s.view = {
          cell,
          x: px - (px - s.view.x) * k,
          y: py - (py - s.view.y) * k,
        };
      } else s.view = { ...s.view, x: s.view.x - e.deltaX };
      s.dirty = true;
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [mode]);

  // ---- keyboard ----------------------------------------------------------
  function onStageKey(e: globalThis.KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
    const onCanvas = e.target === canvasRef.current;
    const k = e.key;
    if (onCanvas && k.startsWith('Arrow')) {
      e.preventDefault();
      const b = sim().board;
      const [cx, cy] = cursor;
      const d = e.shiftKey ? 5 : 1;
      const nx = Math.max(
        0,
        Math.min(
          b.width - 1,
          cx + (k === 'ArrowRight' ? d : k === 'ArrowLeft' ? -d : 0),
        ),
      );
      const ny = Math.max(
        0,
        Math.min(
          b.height - 1,
          cy + (k === 'ArrowDown' ? d : k === 'ArrowUp' ? -d : 0),
        ),
      );
      setCursor([nx, ny]);
      toolRef.current.showCursor = true;
      sim().dirty = true;
      setAnnounce(
        `第 ${ny + 1} 行第 ${nx + 1} 列，${b.cells[ny * b.width + nx] ? '活' : '空'}`,
      );
      return;
    }
    if (onCanvas && k === 'Enter') {
      e.preventDefault();
      const [x, y] = cursor;
      if (tool === 'stamp') return stampAt(x, y);
      const s = sim();
      if (!canEdit(x, y)) {
        setAnnounce(editable ? '这里在建造区外' : '先回到第 0 代再改种子');
        return;
      }
      const alive =
        tool === 'erase' ? false : !s.board.cells[y * s.board.width + x];
      paint(x, y, alive);
      sync();
      setAnnounce(`第 ${y + 1} 行第 ${x + 1} 列${alive ? '点亮' : '清除'}`);
      return;
    }
    const lower = k.toLowerCase();
    const act: Record<string, () => void> = {
      ' ': togglePlay,
      n: () => !running && doStep(),
      c: clear,
      r: randomFill,
      w: () => mode === 'sandbox' && setWrap((w) => !w),
      q: () => setTurns((t) => (t + 3) % 4),
      e: () => setTurns((t) => (t + 1) % 4),
      '+': () => zoomAt(1.25),
      '=': () => zoomAt(1.25),
      '-': () => zoomAt(0.8),
      '0': fit,
      d: () => setTool('draw'),
      x: () => setTool('erase'),
      p: () => setTool('pan'),
      s: () => setTool('stamp'),
    };
    if (onCanvas && k === 'ArrowRight') return;
    const fn = act[lower];
    if (fn) {
      if (k === ' ' && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      fn();
    }
  }

  const keyRef = useRef(onStageKey);
  useEffect(() => {
    keyRef.current = onStageKey;
  });
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const onKey = (e: globalThis.KeyboardEvent) => keyRef.current(e);
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, []);

  const pattern = getPattern(patternId);
  const size = patternSize(pattern.rows, turns);
  const bestFor = (id: string) => records.best[id];

  return (
    <div className="life-root" ref={wrapRef}>
      <header className="life-heading">
        <div>
          <p className="life-kicker">B3/S23 · CONWAY</p>
          <h2>生命游戏沙盒</h2>
        </div>
        <fieldset className="life-modes" aria-label="模式">
          <button
            type="button"
            aria-pressed={mode === 'sandbox'}
            onClick={() => switchMode('sandbox')}
          >
            自由沙盒
          </button>
          <button
            type="button"
            aria-pressed={mode === 'challenge'}
            onClick={() => switchMode('challenge')}
          >
            <Trophy size={15} aria-hidden="true" /> 挑战
          </button>
        </fieldset>
      </header>

      {mode === 'challenge' && (
        <section className="life-challenges" aria-label="挑战题">
          <fieldset className="life-challenge-list" aria-label="选择挑战">
            {CHALLENGES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={challengeId === c.id}
                onClick={() => switchMode('challenge', c.id)}
              >
                <strong>{c.title}</strong>
                <small>
                  {bestFor(c.id) ? `最佳 ${bestFor(c.id)} 格` : '未通过'}
                </small>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={challengeId === 'daily'}
              disabled={!daily}
              onClick={() => switchMode('challenge', 'daily')}
            >
              <strong>
                <CalendarDays size={14} aria-hidden="true" /> 今日引线
              </strong>
              <small>{dailyDone ? '今日已完成' : '每天一题'}</small>
            </button>
          </fieldset>
          {challenge && (
            <div className="life-brief">
              <p>
                <strong>{challenge.title}</strong> {challenge.brief}
              </p>
              <p className="life-mono">
                建造区 {challenge.zone.width}×{challenge.zone.height} · 已用{' '}
                {counts.generation === 0 ? counts.population : seedCount}/
                {challenge.budget} 格 · 边界不环绕
              </p>
              <div className="life-brief-actions">
                <button type="button" className="life-primary" onClick={verify}>
                  验证
                </button>
                {result && (
                  <output className={result.ok ? 'life-ok' : 'life-bad'}>
                    {result.ok
                      ? `✓ 通过（${result.cells} 格）：${result.detail}`
                      : `✗ ${result.reason}`}
                  </output>
                )}
                {saveNote && <p className="life-bad">{saveNote}</p>}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="life-toolbar" role="toolbar" aria-label="演化控制">
        <button
          type="button"
          className="life-primary"
          onClick={togglePlay}
          aria-label={running ? '暂停 (空格)' : '播放 (空格)'}
        >
          {running ? (
            <Pause size={16} aria-hidden="true" />
          ) : (
            <Play size={16} aria-hidden="true" />
          )}
          {running ? '暂停' : '播放'}
        </button>
        <button
          type="button"
          onClick={doStep}
          disabled={running}
          aria-label="单步 (N)"
        >
          <SkipForward size={16} aria-hidden="true" /> 单步
        </button>
        <label className="life-speed">
          <span>速度</span>
          <input
            type="range"
            min={0}
            max={SPEEDS.length - 1}
            value={speedIndex}
            onChange={(e) => setSpeedPick(Number(e.target.value))}
            aria-valuetext={`每秒 ${speed} 代`}
          />
          <span className="life-mono">{speed}/s</span>
        </label>
        <button
          type="button"
          onClick={backToSeed}
          disabled={counts.generation === 0}
          aria-label="回到第 0 代"
        >
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={randomFill} aria-label="随机 (R)">
          <Shuffle size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={clear} aria-label="清空 (C)">
          <Trash2 size={16} aria-hidden="true" />
        </button>
        {mode === 'sandbox' && (
          <label className="life-check">
            <input
              type="checkbox"
              checked={wrap}
              onChange={(e) => setWrap(e.target.checked)}
            />
            环面（W）
          </label>
        )}
      </div>

      <div className="life-stats" aria-label="计数">
        <span>
          代数{' '}
          <strong data-testid="life-generation">{counts.generation}</strong>
        </span>
        <span>
          人口{' '}
          <strong data-testid="life-population">{counts.population}</strong>
        </span>
        <span className="life-mono">
          {mode === 'challenge'
            ? `${CHALLENGE_BOARD.width}×${CHALLENGE_BOARD.height}`
            : `${SANDBOX_SIZE.width}×${SANDBOX_SIZE.height}`}
        </span>
      </div>

      <div className="life-board">
        <canvas
          ref={canvasRef}
          className={`life-canvas is-${tool}`}
          tabIndex={0}
          aria-label="生命游戏棋盘。方向键移动光标，回车切换细胞，空格播放或暂停"
          aria-describedby="life-help"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
          onBlur={() => {
            toolRef.current.showCursor = false;
            if (simRef.current) simRef.current.dirty = true;
          }}
        />
        <div className="life-zoom">
          <button
            type="button"
            onClick={() => zoomAt(1.25)}
            aria-label="放大 (+)"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoomAt(0.8)}
            aria-label="缩小 (-)"
          >
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={fit} aria-label="适配全盘 (0)">
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <fieldset className="life-tools" aria-label="画笔">
        {(
          [
            ['draw', '画笔', Pencil, 'D'],
            ['erase', '橡皮', Eraser, 'X'],
            ['pan', '拖动', Hand, 'P'],
            ['stamp', '图案', Stamp, 'S'],
          ] as const
        ).map(([id, name, Icon, key]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tool === id}
            onClick={() => setTool(id)}
            title={`${name} (${key})`}
          >
            <Icon size={15} aria-hidden="true" /> {name}
          </button>
        ))}
      </fieldset>

      <section className="life-library" aria-label="图案库">
        <div className="life-library-head">
          <h3>图案库</h3>
          <span className="life-mono">
            {pattern.name} · {size.width}×{size.height} · {turns * 90}°
          </span>
          <button
            type="button"
            onClick={() => setTurns((t) => (t + 3) % 4)}
            aria-label="逆时针旋转 (Q)"
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setTurns((t) => (t + 1) % 4)}
            aria-label="顺时针旋转 (E)"
          >
            <RotateCw size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="life-patterns">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={patternId === p.id}
              onClick={() => {
                setPatternId(p.id);
                setTool('stamp');
              }}
            >
              <strong>{p.name}</strong>
              <small>
                {p.kind} · {p.note}
              </small>
            </button>
          ))}
        </div>
      </section>

      <p id="life-help" className="life-help">
        点击或拖动画细胞，右键或「拖动」平移，滚轮/双指缩放。键盘：空格播放，N
        单步，R 随机，C 清空，W 环面，Q/E 旋转图案，+/- 缩放，0
        适配；在棋盘上用方向键移动光标、回车切换。
      </p>
      <p className="life-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/** Step into the spare buffer and keep the old cells as the next spare. */
function advance(s: Sim, wrap: boolean) {
  const prev = s.board.cells;
  s.board = step(s.board, wrap, s.spare);
  s.spare = prev;
}
