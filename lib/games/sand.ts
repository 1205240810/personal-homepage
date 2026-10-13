// 落沙模拟：a cellular falling-sand toy on typed arrays. Pure logic only; the
// screen is components/games/sand.tsx.
import { isPlainObject, loadJson, saveJson } from './kit.ts';

export const EMPTY = 0,
  SAND = 1,
  WATER = 2,
  WALL = 3,
  FIRE = 4,
  PLANT = 5,
  SMOKE = 6,
  OIL = 7;
export type Element = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ELEMENTS: readonly {
  id: Element;
  key: string;
  name: string;
  note: string;
}[] = [
  { id: SAND, key: '1', name: '沙', note: '下落堆积，能沉进水和油里' },
  { id: WATER, key: '2', name: '水', note: '流动摊平，浇灭火，让植物生长' },
  { id: WALL, key: '3', name: '墙', note: '一动不动' },
  { id: FIRE, key: '4', name: '火', note: '点燃植物和油，最后化成烟' },
  { id: PLANT, key: '5', name: '植物', note: '吸水生长，易燃' },
  { id: OIL, key: '6', name: '油', note: '浮在水面上，一点就着' },
  { id: SMOKE, key: '7', name: '烟', note: '往上飘，慢慢散掉' },
  { id: EMPTY, key: '0', name: '橡皮', note: '擦掉' },
];

export type Sand = {
  width: number;
  height: number;
  cells: Uint8Array;
  /** Remaining life for fire and smoke; a colour jitter for the rest. */
  life: Uint8Array;
  /** Frame stamp so a moved particle is not updated twice in one step. */
  moved: Uint8Array;
  tick: number;
};
export function createSand(width: number, height: number): Sand {
  const n = width * height;
  return {
    width,
    height,
    cells: new Uint8Array(n),
    life: new Uint8Array(n),
    moved: new Uint8Array(n),
    tick: 0,
  };
}

const density = (e: number) =>
  e === SAND
    ? 3
    : e === WATER
      ? 2
      : e === OIL
        ? 1
        : e === EMPTY || e === SMOKE || e === FIRE
          ? 0
          : 99;

export function setParticle(
  s: Sand,
  x: number,
  y: number,
  e: Element,
  random: () => number,
) {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
  const i = y * s.width + x;
  s.cells[i] = e;
  s.life[i] =
    e === FIRE
      ? 40 + Math.floor(random() * 40)
      : e === SMOKE
        ? 60 + Math.floor(random() * 60)
        : Math.floor(random() * 32);
}
/** Paint a filled disc. Non-eraser brushes only fill empty cells unless `overwrite`. */
export function paint(
  s: Sand,
  cx: number,
  cy: number,
  radius: number,
  e: Element,
  random: () => number,
  overwrite = false,
) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx,
        y = cy + dy;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
      const i = y * s.width + x;
      if (e === EMPTY || overwrite || s.cells[i] === EMPTY) {
        // Loose brushes are sprinkled so piles look natural.
        if (
          (e === SAND || e === WATER || e === OIL) &&
          radius > 1 &&
          random() < 0.35
        )
          continue;
        setParticle(s, x, y, e, random);
      }
    }
}

function swap(s: Sand, a: number, b: number) {
  const c = s.cells[a],
    l = s.life[a];
  s.cells[a] = s.cells[b];
  s.life[a] = s.life[b];
  s.cells[b] = c;
  s.life[b] = l;
  s.moved[b] = s.tick;
  s.moved[a] = s.tick;
}

/** One simulation step. Rows go bottom-up; x order alternates per tick. */
export function stepSand(s: Sand, random: () => number) {
  const { width: w, height: h, cells, life } = s;
  s.tick = (s.tick % 255) + 1;
  const t = s.tick;
  const ltr = t % 2 === 0;
  const get = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? WALL : cells[y * w + x];
  // Falling things: bottom-up.
  for (let y = h - 1; y >= 0; y--) {
    for (let k = 0; k < w; k++) {
      const x = ltr ? k : w - 1 - k;
      const i = y * w + x;
      const e = cells[i];
      if (e === EMPTY || e === WALL || s.moved[i] === t) continue;
      if (e === SAND || e === WATER || e === OIL) {
        const d = density(e);
        const below = get(x, y + 1);
        if (y + 1 < h && density(below) < d) {
          swap(s, i, i + w);
          continue;
        }
        const dir = random() < 0.5 ? -1 : 1;
        let moved = false;
        for (const sx of [dir, -dir]) {
          const nx = x + sx;
          if (
            y + 1 < h &&
            density(get(nx, y + 1)) < d &&
            density(get(nx, y)) < 99
          ) {
            swap(s, i, (y + 1) * w + nx);
            moved = true;
            break;
          }
        }
        if (moved || e === SAND) continue;
        // Liquids spread sideways a few cells.
        const spread = e === WATER ? 4 : 3;
        for (const sx of [dir, -dir]) {
          let nx = x;
          for (
            let n = 0;
            n < spread &&
            density(get(nx + sx, y)) < d &&
            get(nx + sx, y) !== WALL;
            n++
          )
            nx += sx;
          if (nx !== x) {
            swap(s, i, y * w + nx);
            moved = true;
            break;
          }
        }
        continue;
      }
      if (e === PLANT) {
        // Drink an adjacent water cell and grow into it.
        if (random() < 0.08) {
          const nx = x + Math.floor(random() * 3) - 1;
          const ny = y + Math.floor(random() * 3) - 1;
          if (get(nx, ny) === WATER) {
            const j = ny * w + nx;
            cells[j] = PLANT;
            s.moved[j] = t;
          }
        }
        continue;
      }
    }
  }
  // Rising things and fire: top-down.
  for (let y = 0; y < h; y++) {
    for (let k = 0; k < w; k++) {
      const x = ltr ? k : w - 1 - k;
      const i = y * w + x;
      const e = cells[i];
      if (s.moved[i] === t) continue;
      if (e === SMOKE) {
        if (life[i] <= 1 || random() < 0.01) {
          cells[i] = EMPTY;
          life[i] = 0;
          continue;
        }
        life[i]--;
        const nx = x + Math.floor(random() * 3) - 1;
        if (y > 0 && get(nx, y - 1) === EMPTY) swap(s, i, (y - 1) * w + nx);
        else if (y > 0 && get(x, y - 1) === EMPTY) swap(s, i, i - w);
        continue;
      }
      if (e === FIRE) {
        let doused = false;
        let fuel = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const n = get(x + dx, y + dy);
            if (n === WATER) doused = true;
            if (n === PLANT || n === OIL) fuel = true;
            if (n === WATER) continue;
            if (
              (n === PLANT && random() < 0.2) ||
              (n === OIL && random() < 0.35)
            ) {
              const j = (y + dy) * w + x + dx;
              cells[j] = FIRE;
              life[j] = 30 + Math.floor(random() * 40);
              s.moved[j] = t;
            }
          }
        if (doused) {
          cells[i] = SMOKE;
          life[i] = 40;
          continue;
        }
        if (life[i] <= 1) {
          cells[i] = random() < 0.5 ? SMOKE : EMPTY;
          life[i] = cells[i] === SMOKE ? 50 : 0;
          continue;
        }
        life[i]--;
        if (!fuel && y > 0 && random() < 0.3) {
          const nx = x + Math.floor(random() * 3) - 1;
          if (get(nx, y - 1) === EMPTY) swap(s, i, (y - 1) * w + nx);
        }
      }
    }
  }
}

export function countElements(s: Sand): number[] {
  const out = Array.from({ length: 8 }, () => 0);
  for (let i = 0; i < s.cells.length; i++) out[s.cells[i]]++;
  return out;
}

// ---- saved scene: one slot, run-length encoded.
export const SAND_SAVE_KEY = 'tscjj:sand:v1';
export type SandSave = {
  width: number;
  height: number;
  rle: string;
  savedAt: string;
};
export function encodeScene(s: Sand): string {
  const out: string[] = [];
  let prev = s.cells[0],
    run = 0;
  for (let i = 0; i <= s.cells.length; i++) {
    const c = i < s.cells.length ? s.cells[i] : -1;
    if (c === prev && run < 9999) run++;
    else {
      out.push(`${run}${String.fromCharCode(97 + prev)}`);
      prev = c;
      run = 1;
    }
  }
  return out.join('');
}
export function decodeScene(
  rle: string,
  width: number,
  height: number,
): Sand | null {
  const s = createSand(width, height);
  let i = 0;
  const re = /(\d+)([a-h])/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(rle))) {
    if (m.index !== consumed) return null;
    consumed += m[0].length;
    const n = Number(m[1]),
      e = m[2].charCodeAt(0) - 97;
    if (i + n > s.cells.length) return null;
    s.cells.fill(e, i, i + n);
    i += n;
  }
  if (consumed !== rle.length || i !== s.cells.length) return null;
  for (let k = 0; k < s.cells.length; k++)
    s.life[k] = s.cells[k] === FIRE || s.cells[k] === SMOKE ? 60 : (k * 7) % 32;
  return s;
}
export function validateSandSave(v: unknown): SandSave | null {
  if (!isPlainObject(v)) return null;
  const { width, height, rle, savedAt } = v;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    typeof rle !== 'string' ||
    typeof savedAt !== 'string'
  )
    return null;
  if (
    (width as number) < 8 ||
    (height as number) < 8 ||
    (width as number) * (height as number) > 200_000
  )
    return null;
  return decodeScene(rle, width as number, height as number)
    ? { width: width as number, height: height as number, rle, savedAt }
    : null;
}
export const loadSandSave = (st?: Pick<Storage, 'getItem'> | null) =>
  loadJson<SandSave | null>(SAND_SAVE_KEY, validateSandSave, () => null, st);
export const saveSandSave = (
  v: SandSave,
  st?: Pick<Storage, 'setItem'> | null,
) => saveJson(SAND_SAVE_KEY, v, st);
