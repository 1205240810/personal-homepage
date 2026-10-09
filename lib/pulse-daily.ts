// Daily Signal Pulse: one generated board per size per local calendar day.
// Boards are arrays of 0/1 so 6 × 6 (36 cells) does not overflow 32-bit masks.
export const PULSE_DAILY_KEY = 'signal-pulse:daily:v1';
export const PULSE_DAILY_SIZES = [4, 5, 6] as const;
export type PulseDailySize = (typeof PULSE_DAILY_SIZES)[number];
export type PulseDailyPuzzle = {
  date: string;
  size: PulseDailySize;
  board: number[];
  par: number;
};
export type PulseDailyRecord = { moves: number; hints: number; stars: number };
export type PulseDailyRun = { presses: number[]; hints: number };
export type PulseDailySave = {
  version: 1;
  date: string;
  /** Last selected size. */
  size: PulseDailySize;
  /** Today's in-progress presses per size, so switching size keeps each board. */
  boards: Record<PulseDailySize, PulseDailyRun>;
  records: Record<string, PulseDailyRecord>;
};

const MAX_PRESSES = 10_000;
const MAX_RECORDS = 400;
// Pressed-cell count and minimum shortest-solution length per size.
const SHAPE: Record<
  PulseDailySize,
  { presses: [number, number]; minPar: number }
> = {
  4: { presses: [5, 7], minPar: 4 },
  5: { presses: [7, 10], minPar: 6 },
  6: { presses: [9, 13], minPar: 8 },
};

export const isDailySize = (value: unknown): value is PulseDailySize =>
  value === 4 || value === 5 || value === 6;

export function localDate(now: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pressCell(
  board: readonly number[],
  cell: number,
  size: number,
) {
  const next = [...board];
  const row = Math.floor(cell / size),
    col = cell % size;
  for (const [r, c] of [
    [row, col],
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ])
    if (r >= 0 && r < size && c >= 0 && c < size) next[r * size + c] ^= 1;
  return next;
}

/** Shortest set of presses that clears the board, or null when unsolvable. */
export function solveDaily(
  board: readonly number[],
  size: number,
): number[] | null {
  if (board.length !== size * size) return null;
  let best: number[] | null = null;
  // Choosing the first row fixes every later row (each must clear the row
  // above), so enumerating 2^size first rows finds every solution exactly.
  for (let first = 0; first < 1 << size; first++) {
    let state = [...board];
    const presses: number[] = [];
    for (let col = 0; col < size; col++)
      if (first & (1 << col)) {
        state = pressCell(state, col, size);
        presses.push(col);
      }
    for (let cell = size; cell < size * size; cell++)
      if (state[cell - size]) {
        state = pressCell(state, cell, size);
        presses.push(cell);
      }
    if (state.every((v) => v === 0) && (!best || presses.length < best.length))
      best = presses;
  }
  return best;
}

export function dailyPuzzle(
  date: string,
  size: PulseDailySize,
): PulseDailyPuzzle {
  const rng = mulberry32(hash(`signal-pulse:${date}:${size}`));
  const shape = SHAPE[size];
  for (let attempt = 0; ; attempt++) {
    const count =
      shape.presses[0] +
      Math.floor(rng() * (shape.presses[1] - shape.presses[0] + 1));
    let board = Array<number>(size * size).fill(0);
    const cells = Array.from({ length: size * size }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rng() * (cells.length - i));
      [cells[i], cells[j]] = [cells[j], cells[i]];
      board = pressCell(board, cells[i], size);
    }
    const solution = solveDaily(board, size);
    // Generated from presses, so it is always solvable; keep only boards whose
    // shortest solution is long enough (fallback guarantees termination).
    if (solution && (solution.length >= shape.minPar || attempt > 200))
      return { date, size, board, par: solution.length };
  }
}

/** 3 stars at par, 2 within par + ⌈par/3⌉ (at least +2), otherwise 1. */
export function starsFor(moves: number, par: number) {
  if (moves <= par) return 3;
  if (moves <= par + Math.max(2, Math.ceil(par / 3))) return 2;
  return 1;
}

export const recordKey = (date: string, size: number) => `${date}:${size}`;

export function boardAfter(
  puzzle: PulseDailyPuzzle,
  presses: readonly number[],
) {
  return presses.reduce(
    (b, cell) => pressCell(b, cell, puzzle.size),
    puzzle.board,
  );
}

export function createDailySave(
  date: string,
  size: PulseDailySize = 5,
): PulseDailySave {
  return {
    version: 1,
    date,
    size,
    boards: { 4: emptyRun(), 5: emptyRun(), 6: emptyRun() },
    records: {},
  };
}
const emptyRun = (): PulseDailyRun => ({ presses: [], hints: 0 });

const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function validateRun(
  raw: unknown,
  puzzle: PulseDailyPuzzle,
): PulseDailyRun | null {
  if (
    !plain(raw) ||
    !Array.isArray(raw.presses) ||
    !int(raw.hints, 0, MAX_PRESSES)
  )
    return null;
  if (raw.presses.length > MAX_PRESSES) return null;
  let board = puzzle.board;
  for (const cell of raw.presses) {
    // Every press must be a real cell, and a cleared board cannot be pressed.
    if (
      !int(cell, 0, puzzle.size * puzzle.size - 1) ||
      board.every((x) => x === 0)
    )
      return null;
    board = pressCell(board, cell, puzzle.size);
  }
  return { presses: [...(raw.presses as number[])], hints: raw.hints };
}

/** Validates untrusted storage. A save from an earlier day keeps only its records. */
export function validateDailySave(
  value: unknown,
  today: string,
): PulseDailySave | null {
  if (
    !plain(value) ||
    value.version !== 1 ||
    typeof value.date !== 'string' ||
    !DATE.test(value.date) ||
    !isDailySize(value.size) ||
    !plain(value.boards) ||
    !plain(value.records)
  )
    return null;
  // Keep only the newest records; ISO dates sort lexicographically.
  const entries = Object.entries(value.records);
  if (entries.length > MAX_RECORDS * 10) return null;
  entries.sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  entries.length = Math.min(entries.length, MAX_RECORDS);
  const records: Record<string, PulseDailyRecord> = {};
  for (const [key, r] of entries) {
    const [date, sizeText, extra] = key.split(':');
    if (
      extra !== undefined ||
      !DATE.test(date ?? '') ||
      !isDailySize(Number(sizeText))
    )
      return null;
    if (
      !plain(r) ||
      !int(r.moves, 1, MAX_PRESSES) ||
      !int(r.hints, 0, MAX_PRESSES) ||
      !int(r.stars, 1, 3)
    )
      return null;
    records[recordKey(date, Number(sizeText))] = {
      moves: r.moves,
      hints: r.hints,
      stars: r.stars,
    };
  }
  const fresh = createDailySave(today, value.size);
  if (value.date !== today) return { ...fresh, records };
  for (const size of PULSE_DAILY_SIZES) {
    const run = validateRun(value.boards[size], dailyPuzzle(today, size));
    if (!run) return null;
    fresh.boards[size] = run;
  }
  return { ...fresh, records };
}

/** Applies a finished run, keeping the better record (fewer moves, then fewer hints). */
export function withDailyResult(
  save: PulseDailySave,
  puzzle: PulseDailyPuzzle,
  moves: number,
  hints: number,
): PulseDailySave {
  const key = recordKey(puzzle.date, puzzle.size);
  const best = save.records[key];
  if (
    best &&
    (best.moves < moves || (best.moves === moves && best.hints <= hints))
  )
    return save;
  const records = {
    ...save.records,
    [key]: { moves, hints, stars: starsFor(moves, puzzle.par) },
  };
  const keys = Object.keys(records).sort().reverse();
  for (const old of keys.slice(MAX_RECORDS)) delete records[old];
  return { ...save, records };
}

export function loadDailySave(
  today: string,
  storage?: Pick<Storage, 'getItem'>,
) {
  try {
    const raw = (storage ?? window.localStorage).getItem(PULSE_DAILY_KEY);
    if (raw === null)
      return { status: 'empty' as const, save: createDailySave(today) };
    const save =
      raw.length < 200_000 ? validateDailySave(JSON.parse(raw), today) : null;
    return save
      ? { status: 'saved' as const, save }
      : { status: 'invalid' as const, save: createDailySave(today) };
  } catch (error) {
    return {
      status:
        error instanceof SyntaxError
          ? ('invalid' as const)
          : ('unavailable' as const),
      save: createDailySave(today),
    };
  }
}

export function storeDailySave(
  save: PulseDailySave,
  storage?: Pick<Storage, 'setItem'>,
) {
  try {
    (storage ?? window.localStorage).setItem(
      PULSE_DAILY_KEY,
      JSON.stringify(save),
    );
    return true;
  } catch {
    return false;
  }
}
