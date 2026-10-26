'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from 'react';
import {
  Bug,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  MAX_ANTS,
  PRESETS,
  addAnt,
  createWorld,
  detectHighway,
  mergeLangtonRecord,
  parseRule,
  stepWorld,
  validateLangtonRecords,
  LANGTON_RECORDS_KEY,
  emptyLangtonRecords,
  type Highway,
  type World,
} from '@/lib/games/langton';
import {
  cssColors,
  useLocalRecords,
  useReducedMotion,
  useThemeName,
} from './kit';
import './kit.css';
import './palette.css';

export const LANGTON_SIZE = 256;
const SPEEDS = [
  1, 2, 5, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000,
] as const;
const EMPTY = emptyLangtonRecords();
const HUES = [
  200, 30, 120, 280, 0, 170, 50, 320, 90, 240, 15, 260, 140, 300, 60,
];

function toRgb(
  ctx: CanvasRenderingContext2D,
  color: string,
): [number, number, number] {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
type Rgb = [number, number, number];
function paintWorld(d: Uint8ClampedArray, w: World, palette: Rgb[], ant: Rgb) {
  const cells = w.cells;
  for (let i = 0; i < cells.length; i++) {
    const p = palette[cells[i]] ?? palette[1];
    const j = i * 4;
    d[j] = p[0];
    d[j + 1] = p[1];
    d[j + 2] = p[2];
    d[j + 3] = 255;
  }
  for (const a of w.ants) {
    const j = (a.y * w.width + a.x) * 4;
    d[j] = ant[0];
    d[j + 1] = ant[1];
    d[j + 2] = ant[2];
  }
}
type View = { cell: number; x: number; y: number };
function fitView(c: HTMLCanvasElement): View {
  const cell = Math.min(c.clientWidth, c.clientHeight) / LANGTON_SIZE || 2;
  return {
    cell,
    x: (c.clientWidth - LANGTON_SIZE * cell) / 2,
    y: (c.clientHeight - LANGTON_SIZE * cell) / 2,
  };
}
function freshWorld(ruleText: string) {
  const parsed = parseRule(ruleText);
  const w = createWorld(
    LANGTON_SIZE,
    LANGTON_SIZE,
    parsed.ok ? parsed.rule : ['R', 'L'],
  );
  addAnt(w, LANGTON_SIZE / 2, LANGTON_SIZE / 2);
  return w;
}

export function LangtonAnt() {
  const reduced = useReducedMotion();
  const theme = useThemeName();
  const [records, saveRecords] = useLocalRecords(
    LANGTON_RECORDS_KEY,
    validateLangtonRecords,
    EMPTY,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const viewRef = useRef<View | null>(null);
  const dirtyRef = useRef(true);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  );

  const [ruleText, setRuleText] = useState('RL');
  const [draft, setDraft] = useState('RL');
  const [ruleError, setRuleError] = useState('');
  const [running, setRunning] = useState(false);
  const [speedPick, setSpeedPick] = useState<number | null>(null);
  const [tool, setTool] = useState<'ant' | 'pan'>('ant');
  const [stats, setStats] = useState({ steps: 0, ants: 1 });
  const [highway, setHighway] = useState<(Highway & { at: number }) | null>(
    null,
  );
  const [announce, setAnnounce] = useState('');

  const speedIndex = speedPick ?? (reduced ? 2 : 5);
  const speed = SPEEDS[speedIndex];
  const best = records.rules[ruleText];

  function world() {
    if (!worldRef.current) worldRef.current = freshWorld(ruleText);
    return worldRef.current;
  }
  function view() {
    if (!viewRef.current)
      viewRef.current = canvasRef.current
        ? fitView(canvasRef.current)
        : { cell: 2, x: 0, y: 0 };
    return viewRef.current;
  }
  function record(w: World, hw: (Highway & { at: number }) | null) {
    if (w.steps > 0)
      saveRecords(mergeLangtonRecord(records, ruleText, w.steps, hw?.at));
  }

  const live = useRef({ running, speed, onTick: (_w: World) => {} });
  useEffect(() => {
    live.current = {
      running,
      speed,
      onTick: (w) => {
        setStats({ steps: w.steps, ants: w.ants.length });
        if (!highway && w.ants.length === 1 && w.steps >= 3000) {
          const h = detectHighway(w);
          if (h) {
            const found = { ...h, at: w.steps };
            setHighway(found);
            setAnnounce(
              `第 ${w.steps} 步附近发现高速路：每 ${h.period} 步平移 (${h.dx}, ${h.dy})`,
            );
            record(w, found);
          }
        }
      },
    };
    dirtyRef.current = true;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const off = document.createElement('canvas');
    off.width = LANGTON_SIZE;
    off.height = LANGTON_SIZE;
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (!octx) return;
    const tech = theme === 'tech';
    const c = cssColors(canvas, {
      'games-paper': '#f6f5f1',
      'games-ink': '#282d29',
      'games-accent': '#6f7f2e',
      'piece-hero': '#ac562f',
    });
    const initial =
      worldRef.current ?? (worldRef.current = freshWorld(ruleText));
    const states = initial.rule.length;
    const palette: [number, number, number][] = [
      toRgb(octx, c['games-paper']),
      toRgb(octx, tech ? c['games-accent'] : c['games-ink']),
    ];
    for (let s = 2; s < states; s++)
      palette.push(
        toRgb(
          octx,
          `hsl(${HUES[(s - 2) % HUES.length]} 38% ${tech ? 62 : 46}%)`,
        ),
      );
    const antRgb = toRgb(octx, c['piece-hero']);
    const img = octx.createImageData(LANGTON_SIZE, LANGTON_SIZE);
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      if (!viewRef.current) viewRef.current = fitView(canvas);
      dirtyRef.current = true;
    };
    resize();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    let raf = 0;
    let lastUi = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const w = worldRef.current;
      if (!w) return;
      const l = live.current;
      if (l.running && w.ants.length) {
        stepWorld(w, l.speed);
        dirtyRef.current = true;
        if (now - lastUi > 120) {
          lastUi = now;
          l.onTick(w);
        }
      }
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      paintWorld(img.data, w, palette, antRgb);
      octx.putImageData(img, 0, 0);
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      const v = viewRef.current ?? fitView(canvas);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = c['games-paper'];
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        off,
        v.x,
        v.y,
        LANGTON_SIZE * v.cell,
        LANGTON_SIZE * v.cell,
      );
      if (v.cell >= 6)
        for (const a of w.ants) {
          ctx.strokeStyle = `rgb(${antRgb.join(',')})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(
            v.x + a.x * v.cell - 1,
            v.y + a.y * v.cell - 1,
            v.cell + 2,
            v.cell + 2,
          );
        }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [theme, ruleText]);

  function zoomBy(f: number, px?: number, py?: number) {
    const c = canvasRef.current;
    const v = view();
    const cx = px ?? (c ? c.clientWidth / 2 : 0);
    const cy = py ?? (c ? c.clientHeight / 2 : 0);
    const cell = Math.max(0.5, Math.min(40, v.cell * f));
    const k = cell / v.cell;
    viewRef.current = { cell, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    dirtyRef.current = true;
  }
  function fit() {
    if (canvasRef.current) viewRef.current = fitView(canvasRef.current);
    dirtyRef.current = true;
  }
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomBy(
        Math.exp(-e.deltaY * 0.0015),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  function reset(nextRule = ruleText) {
    const w = world();
    record(w, highway);
    worldRef.current = freshWorld(nextRule);
    setRunning(false);
    setHighway(null);
    setStats({ steps: 0, ants: 1 });
    dirtyRef.current = true;
  }
  function applyRule(text: string) {
    const r = parseRule(text);
    if (!r.ok) {
      setRuleError(r.reason);
      setAnnounce(r.reason);
      return;
    }
    const t = r.rule.join('');
    setRuleError('');
    setDraft(t);
    reset(t);
    setRuleText(t);
    setAnnounce(`规则改为 ${t}`);
  }
  function togglePlay() {
    const w = world();
    if (running) record(w, highway);
    setRunning(!running);
    setAnnounce(running ? `已暂停，第 ${w.steps} 步` : '开始');
  }
  function stepOnce(n = 1) {
    const w = world();
    stepWorld(w, n);
    live.current.onTick(w);
    dirtyRef.current = true;
  }
  function placeAnt(x: number, y: number) {
    const w = world();
    if (x < 0 || y < 0 || x >= LANGTON_SIZE || y >= LANGTON_SIZE) return;
    if (!addAnt(w, x, y, w.ants.length % 4)) {
      setAnnounce(`最多 ${MAX_ANTS} 只蚂蚁`);
      return;
    }
    setStats({ steps: w.steps, ants: w.ants.length });
    setHighway(null);
    dirtyRef.current = true;
    setAnnounce(`放下第 ${w.ants.length} 只蚂蚁，位置 (${x}, ${y})`);
  }
  function onPointerDown(e: RPointerEvent<HTMLCanvasElement>) {
    const v = view();
    if (tool === 'pan' || e.button !== 0) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    placeAnt(
      Math.floor((e.clientX - r.left - v.x) / v.cell),
      Math.floor((e.clientY - r.top - v.y) / v.cell),
    );
  }
  function onPointerMove(e: RPointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    viewRef.current = {
      ...view(),
      x: d.vx + e.clientX - d.x,
      y: d.vy + e.clientY - d.y,
    };
    dirtyRef.current = true;
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
      const map: Record<string, () => void> = {
        ' ': togglePlay,
        n: () => stepOnce(),
        r: () => reset(),
        a: () =>
          placeAnt(
            Math.floor(Math.random() * LANGTON_SIZE),
            Math.floor(Math.random() * LANGTON_SIZE),
          ),
        '+': () => zoomBy(1.25),
        '=': () => zoomBy(1.25),
        '-': () => zoomBy(0.8),
        '0': fit,
        ']': () => setSpeedPick(Math.min(SPEEDS.length - 1, speedIndex + 1)),
        '[': () => setSpeedPick(Math.max(0, speedIndex - 1)),
      };
      const fn = map[e.key.toLowerCase()];
      if (!fn || (e.key === ' ' && t instanceof HTMLButtonElement)) return;
      e.preventDefault();
      fn();
    };
  });
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const on = (e: KeyboardEvent) => keyRef.current(e);
    root.addEventListener('keydown', on);
    return () => root.removeEventListener('keydown', on);
  }, []);

  return (
    <div className="kit langton" ref={rootRef}>
      <header className="kit-head">
        <div>
          <p className="kit-kicker">TURMITE · {ruleText}</p>
          <h2>朗顿蚂蚁</h2>
        </div>
        <fieldset className="kit-row" aria-label="预设规则">
          <select
            aria-label="预设规则"
            value={PRESETS.find((p) => p.rule === ruleText)?.id ?? ''}
            onChange={(e) => {
              const p = PRESETS.find((x) => x.id === e.target.value);
              if (p) applyRule(p.rule);
            }}
          >
            <option value="" disabled>
              自定义
            </option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rule} · {p.name}
              </option>
            ))}
          </select>
        </fieldset>
      </header>

      <form
        className="kit-row"
        onSubmit={(e) => {
          e.preventDefault();
          applyRule(draft);
        }}
      >
        <label>
          转向规则
          <input
            type="text"
            value={draft}
            maxLength={16}
            spellCheck={false}
            aria-invalid={!!ruleError}
            aria-describedby="langton-rule-help"
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            className="kit-mono"
            size={14}
          />
        </label>
        <button type="submit">应用</button>
        <span
          id="langton-rule-help"
          className={ruleError ? 'kit-bad' : 'kit-help'}
        >
          {ruleError ||
            '每个字母对应一种格子颜色：L 左转、R 右转、N 直行、U 掉头'}
        </span>
      </form>

      <div className="kit-row" role="toolbar" aria-label="运行控制">
        <button
          type="button"
          className="kit-primary"
          onClick={togglePlay}
          aria-label={running ? '暂停 (空格)' : '运行 (空格)'}
        >
          {running ? (
            <Pause size={16} aria-hidden="true" />
          ) : (
            <Play size={16} aria-hidden="true" />
          )}
          {running ? '暂停' : '运行'}
        </button>
        <button
          type="button"
          onClick={() => stepOnce()}
          disabled={running}
          aria-label="单步 (N)"
        >
          <SkipForward size={16} aria-hidden="true" /> 单步
        </button>
        <button type="button" onClick={() => stepOnce(1000)} disabled={running}>
          +1000
        </button>
        <label>
          速度
          <input
            type="range"
            min={0}
            max={SPEEDS.length - 1}
            value={speedIndex}
            onChange={(e) => setSpeedPick(Number(e.target.value))}
            aria-valuetext={`每帧 ${speed} 步`}
          />
          <span className="kit-mono">
            {speed >= 1000 ? `${speed / 1000}k` : speed}/帧
          </span>
        </label>
        <button type="button" onClick={() => reset()} aria-label="重置 (R)">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-pressed={tool === 'ant'}
          onClick={() => setTool('ant')}
        >
          <Bug size={16} aria-hidden="true" /> 放蚂蚁
        </button>
        <button
          type="button"
          aria-pressed={tool === 'pan'}
          onClick={() => setTool('pan')}
        >
          拖动
        </button>
      </div>

      <div className="kit-stats">
        <span>
          步数{' '}
          <strong data-testid="langton-steps">
            {stats.steps.toLocaleString('en-US')}
          </strong>
        </span>
        <span>
          蚂蚁 <strong data-testid="langton-ants">{stats.ants}</strong>/
          {MAX_ANTS}
        </span>
        <span className="kit-mono">
          {LANGTON_SIZE}×{LANGTON_SIZE} 环面
        </span>
        {best && (
          <span>
            本机最长 {best.maxSteps.toLocaleString('en-US')} 步
            {best.highway !== undefined &&
              ` · 最早高速路 ${best.highway.toLocaleString('en-US')} 步`}
          </span>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          className="kit-canvas"
          tabIndex={0}
          aria-label="朗顿蚂蚁棋盘。点击放蚂蚁，空格运行，A 随机放一只"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div
          className="kit-row"
          style={{ position: 'absolute', right: 10, bottom: 10 }}
        >
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            aria-label="放大 (+)"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(0.8)}
            aria-label="缩小 (-)"
          >
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={fit} aria-label="适配 (0)">
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="kit-brief">
        {highway ? (
          <p className="kit-ok" data-testid="langton-highway">
            第 {highway.at.toLocaleString('en-US')} 步附近检测到高速路：每{' '}
            {highway.period} 步平移 ({highway.dx}, {highway.dy})。
          </p>
        ) : (
          <p>
            {PRESETS.find((p) => p.rule === ruleText)?.note ??
              '自定义规则。只有一只蚂蚁时会自动检测「高速路」——轨迹开始周期性地平移。'}
          </p>
        )}
        <p className="kit-help">
          高速路在环面上走一圈后会撞上自己的旧轨迹，之后可能重新混沌。
        </p>
      </div>
      <p className="kit-help">
        键盘：空格运行/暂停，N 单步，[ / ] 调速，R 重置，A 随机放蚂蚁，+/-
        缩放，0 适配。滚轮或拖动工具平移缩放。
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
