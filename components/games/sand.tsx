'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from 'react';
import { Pause, Play, Save, FolderOpen, Trash2 } from 'lucide-react';
import { mulberry32 } from '@/lib/games/kit';
import {
  ELEMENTS,
  EMPTY,
  SAND,
  SAND_SAVE_KEY,
  countElements,
  createSand,
  decodeScene,
  encodeScene,
  paint,
  stepSand,
  validateSandSave,
  type Element,
  type Sand,
  type SandSave,
} from '@/lib/games/sand';
import {
  cssColors,
  useHydrated,
  useLocalRecords,
  useReducedMotion,
  useThemeName,
} from './kit';
import './kit.css';
import './sand.css';

export const SAND_W = 240;
export const SAND_H = 160;
type Rgb = [number, number, number];

const BASE: Record<'default' | 'tech', Rgb[]> = {
  // empty, sand, water, wall, fire, plant, smoke, oil
  default: [
    [0, 0, 0],
    [214, 180, 112],
    [64, 132, 208],
    [96, 100, 94],
    [236, 112, 40],
    [72, 150, 64],
    [150, 150, 150],
    [92, 64, 40],
  ],
  tech: [
    [0, 0, 0],
    [240, 205, 120],
    [61, 190, 255],
    [70, 92, 112],
    [255, 140, 60],
    [80, 230, 140],
    [120, 140, 160],
    [170, 110, 255],
  ],
};
function buildPalette(bg: Rgb, tech: boolean): Uint8Array {
  // 8 elements × 32 shades × rgb.
  const out = new Uint8Array(8 * 32 * 3);
  const base = BASE[tech ? 'tech' : 'default'];
  for (let e = 0; e < 8; e++)
    for (let v = 0; v < 32; v++) {
      const j = (e * 32 + v) * 3;
      const c = e === 0 ? bg : base[e];
      const k = e === 0 ? 0 : (v - 16) * (e === 4 ? 3 : 1.4);
      out[j] = Math.max(0, Math.min(255, c[0] + k));
      out[j + 1] = Math.max(0, Math.min(255, c[1] + k));
      out[j + 2] = Math.max(0, Math.min(255, c[2] + k));
    }
  return out;
}
function paintImage(d: Uint8ClampedArray, s: Sand, pal: Uint8Array) {
  const { cells, life } = s;
  for (let i = 0; i < cells.length; i++) {
    const p = (cells[i] * 32 + (life[i] & 31)) * 3;
    const j = i * 4;
    d[j] = pal[p];
    d[j + 1] = pal[p + 1];
    d[j + 2] = pal[p + 2];
    d[j + 3] = 255;
  }
}
function parseRgb(ctx: CanvasRenderingContext2D, color: string): Rgb {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
function demoScene(): Sand {
  const s = createSand(SAND_W, SAND_H);
  const r = mulberry32(7);
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) paint(s, x, y, 0, 3, r, true);
  };
  wall(20, 110, 110, 111);
  wall(140, 140, 220, 141);
  wall(140, 100, 141, 141);
  wall(219, 100, 220, 141);
  for (let y = 118; y < 140; y++)
    for (let x = 142; x < 219; x++) paint(s, x, y, 0, 2, r, true);
  for (let y = 112; y < 118; y++)
    for (let x = 142; x < 219; x++) paint(s, x, y, 0, 7, r, true);
  for (let y = 80; y < 110; y++)
    for (let x = 25; x < 105; x++)
      if (r() < 0.25) paint(s, x, y, 0, 5, r, true);
  paint(s, 70, 30, 12, SAND, r, true);
  return s;
}

export function FallingSand() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const theme = useThemeName();
  const [save, writeSave] = useLocalRecords<SandSave | null>(
    SAND_SAVE_KEY,
    validateSandSave,
    null,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sand | null>(null);
  const rngRef = useRef(mulberry32(1));
  const pointer = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
    down: boolean;
  } | null>(null);
  const [element, setElement] = useState<Element>(SAND);
  const [brush, setBrush] = useState(4);
  const [runningPick, setRunning] = useState<boolean | null>(null);
  const [stepsPerFrame, setStepsPerFrame] = useState<number | null>(null);
  const [cursor, setCursor] = useState<[number, number]>([SAND_W / 2, 20]);
  const [counts, setCounts] = useState<number[]>(() =>
    Array.from({ length: 8 }, () => 0),
  );
  const [announce, setAnnounce] = useState('');
  const running = runningPick ?? true;
  const speed = stepsPerFrame ?? (reduced ? 1 : 2);

  function sim() {
    if (!simRef.current) simRef.current = demoScene();
    return simRef.current;
  }
  const live = useRef({ running, speed, element, brush });
  useEffect(() => {
    live.current = { running, speed, element, brush };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const off = document.createElement('canvas');
    off.width = SAND_W;
    off.height = SAND_H;
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (!octx) return;
    const s = simRef.current ?? (simRef.current = demoScene());
    const bg = parseRgb(
      octx,
      cssColors(canvas, { 'games-paper': '#f6f5f1' })['games-paper'],
    );
    const pal = buildPalette(bg, theme === 'tech');
    const img = octx.createImageData(SAND_W, SAND_H);
    const r = rngRef.current;
    let raf = 0;
    let frames = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const l = live.current;
      const p = pointer.current;
      if (p?.down) {
        // Interpolate between frames so fast strokes leave no gaps.
        const n = Math.max(
          1,
          Math.ceil(Math.hypot(p.x - p.px, p.y - p.py) / Math.max(1, l.brush)),
        );
        for (let k = 1; k <= n; k++)
          paint(
            s,
            Math.round(p.px + ((p.x - p.px) * k) / n),
            Math.round(p.py + ((p.y - p.py) * k) / n),
            l.brush,
            l.element,
            r,
          );
        p.px = p.x;
        p.py = p.y;
      }
      if (l.running) for (let k = 0; k < l.speed; k++) stepSand(s, r);
      paintImage(img.data, s, pal);
      octx.putImageData(img, 0, 0);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const cw = Math.round(canvas.clientWidth * dpr),
        ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const scale = Math.min(cw / SAND_W, ch / SAND_H);
      const ox = (cw - SAND_W * scale) / 2,
        oy = (ch - SAND_H * scale) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgb(${bg.join(',')})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, ox, oy, SAND_W * scale, SAND_H * scale);
      if (++frames % 15 === 0) setCounts(countElements(s));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  function toGrid(e: { clientX: number; clientY: number }): [number, number] {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const scale = Math.min(r.width / SAND_W, r.height / SAND_H) || 1;
    const ox = (r.width - SAND_W * scale) / 2,
      oy = (r.height - SAND_H * scale) / 2;
    return [
      Math.floor((e.clientX - r.left - ox) / scale),
      Math.floor((e.clientY - r.top - oy) / scale),
    ];
  }
  function onDown(e: RPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = toGrid(e);
    pointer.current = { x, y, px: x, py: y, down: true };
    paint(sim(), x, y, brush, element, rngRef.current);
  }
  function onMove(e: RPointerEvent<HTMLCanvasElement>) {
    const p = pointer.current;
    if (!p?.down) return;
    const [x, y] = toGrid(e);
    p.x = x;
    p.y = y;
  }
  function onUp() {
    pointer.current = null;
    setCounts(countElements(sim()));
  }

  function clear() {
    simRef.current = createSand(SAND_W, SAND_H);
    setCounts(Array.from({ length: 8 }, () => 0));
    setAnnounce('已清空');
  }
  function saveScene() {
    const r = writeSave({
      width: SAND_W,
      height: SAND_H,
      rle: encodeScene(sim()),
      savedAt: new Date().toISOString(),
    });
    setAnnounce(r === 'saved' ? '场景已存到本机' : '本机存储不可用');
  }
  function loadScene() {
    if (!save) return;
    const s = decodeScene(save.rle, save.width, save.height);
    if (s && s.width === SAND_W && s.height === SAND_H) {
      simRef.current = s;
      setCounts(countElements(s));
      setAnnounce('已读取存档');
    }
  }
  function stampCursor(x: number, y: number) {
    paint(sim(), x, y, brush, element, rngRef.current);
    setCounts(countElements(sim()));
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
      const onCanvas = t === canvasRef.current;
      if (onCanvas && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 2;
        const [x, y] = cursor;
        const nx = Math.max(
          0,
          Math.min(
            SAND_W - 1,
            x + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0),
          ),
        );
        const ny = Math.max(
          0,
          Math.min(
            SAND_H - 1,
            y + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0),
          ),
        );
        setCursor([nx, ny]);
        setAnnounce(`画笔在 (${nx}, ${ny})`);
        return;
      }
      if (onCanvas && e.key === 'Enter') {
        e.preventDefault();
        stampCursor(cursor[0], cursor[1]);
        setAnnounce(
          `在 (${cursor[0]}, ${cursor[1]}) 放下${ELEMENTS.find((x) => x.id === element)?.name}`,
        );
        return;
      }
      const el = ELEMENTS.find((x) => x.key === e.key);
      if (el) {
        setElement(el.id);
        setAnnounce(`选择${el.name}`);
        return;
      }
      const map: Record<string, () => void> = {
        ' ': () => setRunning(!running),
        c: clear,
        '[': () => setBrush((b) => Math.max(0, b - 1)),
        ']': () => setBrush((b) => Math.min(12, b + 1)),
        s: saveScene,
        l: loadScene,
      };
      const fn = map[e.key.toLowerCase()];
      if (!fn || (e.key === ' ' && t instanceof HTMLButtonElement)) return;
      e.preventDefault();
      fn();
    };
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const on = (e: KeyboardEvent) => keyRef.current(e);
    root.addEventListener('keydown', on);
    return () => root.removeEventListener('keydown', on);
  }, []);

  const total = counts.reduce((a, b, i) => (i === EMPTY ? a : a + b), 0);
  return (
    <div className="kit sand" ref={rootRef}>
      <header className="kit-head">
        <div>
          <p className="kit-kicker">
            FALLING SAND · {SAND_W}×{SAND_H}
          </p>
          <h2>落沙模拟</h2>
        </div>
        <div className="kit-row" role="toolbar" aria-label="运行控制">
          <button
            type="button"
            className="kit-primary"
            onClick={() => setRunning(!running)}
            aria-label={running ? '暂停 (空格)' : '继续 (空格)'}
          >
            {running ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {running ? '暂停' : '继续'}
          </button>
          <button type="button" onClick={clear} aria-label="清空 (C)">
            <Trash2 size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={saveScene} aria-label="存到本机 (S)">
            <Save size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={loadScene}
            disabled={!hydrated || !save}
            aria-label="读取存档 (L)"
          >
            <FolderOpen size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <fieldset className="kit-row sand-elements" aria-label="元素">
        {ELEMENTS.map((el) => (
          <button
            key={el.id}
            type="button"
            aria-pressed={element === el.id}
            onClick={() => setElement(el.id)}
            title={`${el.note}（${el.key}）`}
          >
            <i className={`sand-swatch is-${el.id}`} aria-hidden="true" />
            {el.name}
            <small className="kit-mono">{el.key}</small>
          </button>
        ))}
      </fieldset>

      <div className="kit-row">
        <label>
          笔刷
          <input
            type="range"
            min={0}
            max={12}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
            aria-valuetext={`半径 ${brush}`}
          />
          <span className="kit-mono">{brush * 2 + 1}px</span>
        </label>
        <label>
          速度
          <input
            type="range"
            min={1}
            max={4}
            value={speed}
            onChange={(e) => setStepsPerFrame(Number(e.target.value))}
            aria-valuetext={`每帧 ${speed} 步`}
          />
          <span className="kit-mono">×{speed}</span>
        </label>
        <span className="kit-stats">
          <span>
            颗粒 <strong data-testid="sand-total">{total}</strong>
          </span>
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="kit-canvas sand-canvas"
        tabIndex={0}
        aria-label="落沙画布。按住拖动撒元素；键盘用方向键移动画笔，回车放下"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <p className="kit-help">
        {ELEMENTS.find((x) => x.id === element)?.note}。键盘：1–7 选元素、0
        橡皮，[ ] 笔刷大小，空格暂停，C 清空，S 存档，L
        读档；画布上方向键移动画笔（Shift 加速），回车放下。
        {save && hydrated
          ? ` 存档时间 ${new Date(save.savedAt).toLocaleString('zh-CN')}`
          : ''}
      </p>
      <p className="kit-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
