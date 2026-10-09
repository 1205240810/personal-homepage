// 机甲扫雷：扫描检修舱，标出故障模块；误触故障模块会造成短路。
// Pure rules only: seeded fields, first-click safety, flood reveal, chording,
// fuses and local records. The React screen is components/games/mech-sweeper.tsx.

export type SweeperLevelId = 'cadet' | 'tech' | 'chief';

export type SweeperLevel = {
  id: SweeperLevelId;
  label: string;
  cols: number;
  rows: number;
  mines: number;
  /** Spare fuses: each absorbs one short circuit instead of ending the run. */
  fuses: number;
};

export const SWEEPER_LEVELS: readonly SweeperLevel[] = [
  { id: 'cadet', label: '见习', cols: 8, rows: 8, mines: 10, fuses: 1 },
  { id: 'tech', label: '技师', cols: 10, rows: 12, mines: 20, fuses: 0 },
  { id: 'chief', label: '总工', cols: 12, rows: 16, mines: 36, fuses: 0 },
];

export function getSweeperLevel(id: SweeperLevelId): SweeperLevel {
  const level = SWEEPER_LEVELS.find((item) => item.id === id);
  if (!level) throw new RangeError(`不支持的扫雷难度：${String(id)}`);
  return level;
}

export const HIDDEN = 0;
export const REVEALED = 1;
export const FLAGGED = 2;
export type CellMark = typeof HIDDEN | typeof REVEALED | typeof FLAGGED;

export type SweeperField = {
  level: SweeperLevelId;
  seed: number;
  mines: boolean[];
  /** Pre-scanned safe zone: the cell and its neighbours never hold a fault. */
  start: number;
};

export type SweeperStatus = 'ready' | 'playing' | 'won' | 'lost';

export type SweeperState = {
  level: SweeperLevelId;
  /** May differ from the field when the very first click had to be rescued. */
  mines: boolean[];
  marks: CellMark[];
  status: SweeperStatus;
  fusesLeft: number;
  /** Faults that were touched: blown fuses, then the final short circuit. */
  shorted: number[];
  /** Revealed or chorded clicks that changed the board. */
  moves: number;
};

/** Deterministic PRNG so one seed always rebuilds the same field. */
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

export function dailySweeperSeed(
  year: number,
  month: number,
  day: number,
  level: SweeperLevelId,
): number {
  let h = 2166136261;
  const tag = SWEEPER_LEVELS.findIndex((item) => item.id === level) + 1;
  for (const part of [year, month, day, tag, 0x5e]) {
    h ^= part;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function neighbors(cols: number, rows: number, index: number): number[] {
  const r = Math.floor(index / cols);
  const c = index % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1)
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols)
        out.push(nr * cols + nc);
    }
  return out;
}

export function generateSweeperField(
  levelId: SweeperLevelId,
  seed: number,
): SweeperField {
  const level = getSweeperLevel(levelId);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError(`扫描编号必须是 32 位无符号整数：${seed}`);
  const random = mulberry32(seed);
  const total = level.cols * level.rows;
  // Keep the pre-scanned start away from the outer frame so it opens an area.
  const r = 1 + Math.floor(random() * (level.rows - 2));
  const c = 1 + Math.floor(random() * (level.cols - 2));
  const start = r * level.cols + c;
  const safe = new Set([start, ...neighbors(level.cols, level.rows, start)]);
  const pool = Array.from({ length: total }, (_, i) => i).filter(
    (i) => !safe.has(i),
  );
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const mines = Array.from({ length: total }, () => false);
  for (const index of pool.slice(0, level.mines)) mines[index] = true;
  return { level: level.id, seed, mines, start };
}

export function countNearby(
  level: SweeperLevel,
  mines: readonly boolean[],
): number[] {
  return mines.map((_, i) =>
    neighbors(level.cols, level.rows, i).reduce(
      (sum, n) => sum + (mines[n] ? 1 : 0),
      0,
    ),
  );
}

export function createSweeper(field: SweeperField): SweeperState {
  const level = getSweeperLevel(field.level);
  return {
    level: level.id,
    mines: [...field.mines],
    marks: field.mines.map(() => HIDDEN),
    status: 'ready',
    fusesLeft: level.fuses,
    shorted: [],
    moves: 0,
  };
}

export function flagsPlaced(state: SweeperState): number {
  return state.marks.filter((mark) => mark === FLAGGED).length;
}

export function faultsRemaining(state: SweeperState): number {
  return getSweeperLevel(state.level).mines - flagsPlaced(state);
}

function finished(state: SweeperState) {
  return state.status === 'won' || state.status === 'lost';
}

export function toggleFlag(state: SweeperState, index: number): SweeperState {
  if (finished(state) || state.marks[index] === REVEALED) return state;
  const marks = [...state.marks];
  marks[index] = marks[index] === FLAGGED ? HIDDEN : FLAGGED;
  return { ...state, marks };
}

/**
 * Open a hidden cell, or chord a satisfied number. The first opening of a run
 * is always safe: a fault under it moves to the first free cell in reading
 * order, as in the classic game.
 */
export function revealCell(state: SweeperState, index: number): SweeperState {
  if (finished(state) || index < 0 || index >= state.marks.length) return state;
  const level = getSweeperLevel(state.level);
  const mark = state.marks[index];
  if (mark === FLAGGED) return state;

  let mines = state.mines;
  if (state.status === 'ready' && mines[index]) {
    mines = [...mines];
    mines[index] = false;
    const target = mines.findIndex((m, i) => !m && i !== index);
    mines[target] = true;
  }
  const nearby = countNearby(level, mines);

  let targets: number[];
  if (mark === REVEALED) {
    const around = neighbors(level.cols, level.rows, index);
    const flags = around.filter((n) => state.marks[n] === FLAGGED).length;
    targets = around.filter((n) => state.marks[n] === HIDDEN);
    // Chord only when the flags match the signal; otherwise nothing happens.
    if (!nearby[index] || flags !== nearby[index] || !targets.length)
      return state;
  } else targets = [index];

  const marks = [...state.marks];
  const shorted = [...state.shorted];
  let fusesLeft = state.fusesLeft;
  let lost = false;
  const queue: number[] = [];
  for (const target of targets) {
    if (mines[target]) {
      shorted.push(target);
      if (fusesLeft > 0) {
        // The fuse blows; the fault is exposed and marked, the run continues.
        fusesLeft -= 1;
        marks[target] = FLAGGED;
      } else lost = true;
      continue;
    }
    queue.push(target);
  }
  if (!lost)
    while (queue.length) {
      const cell = queue.shift()!;
      if (marks[cell] === REVEALED) continue;
      marks[cell] = REVEALED;
      if (nearby[cell] === 0)
        for (const n of neighbors(level.cols, level.rows, cell))
          if (marks[n] === HIDDEN && !mines[n]) queue.push(n);
    }

  const next: SweeperState = {
    level: state.level,
    mines,
    marks,
    status: lost ? 'lost' : 'playing',
    fusesLeft,
    shorted,
    moves: state.moves + 1,
  };
  if (!lost && marks.every((m, i) => mines[i] || m === REVEALED)) {
    next.status = 'won';
    next.marks = marks.map((m, i) => (mines[i] ? FLAGGED : m));
  }
  return next;
}

// ---------------------------------------------------------------------------
// Local best records per level. Boards in progress are not saved.

export const SWEEPER_RECORDS_KEY = 'tscjj:mech-sweeper:v1';

export type SweeperBest = { seconds: number; wins: number; clean: number };
export type SweeperRecords = Partial<Record<SweeperLevelId, SweeperBest>>;

const MAX_RECORD = 10_000_000;

function count(value: unknown, min: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= MAX_RECORD
  );
}

export function validateSweeperRecords(value: unknown): SweeperRecords | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const records: SweeperRecords = {};
  for (const [key, best] of Object.entries(value)) {
    if (!SWEEPER_LEVELS.some((level) => level.id === key)) return null;
    if (best === null || typeof best !== 'object' || Array.isArray(best))
      return null;
    const { seconds, wins, clean } = best as Record<string, unknown>;
    if (!count(seconds, 1) || !count(wins, 1) || !count(clean, 0)) return null;
    if (clean > wins) return null;
    records[key as SweeperLevelId] = { seconds, wins, clean };
  }
  return records;
}

/** `clean` counts wins without a blown fuse. */
export function mergeSweeperRecord(
  records: SweeperRecords,
  level: SweeperLevelId,
  result: { seconds: number; clean: boolean },
): SweeperRecords {
  const seconds = Math.min(MAX_RECORD, Math.max(1, Math.round(result.seconds)));
  const best = records[level];
  return {
    ...records,
    [level]: best
      ? {
          seconds: Math.min(best.seconds, seconds),
          wins: Math.min(MAX_RECORD, best.wins + 1),
          clean: Math.min(MAX_RECORD, best.clean + (result.clean ? 1 : 0)),
        }
      : { seconds, wins: 1, clean: result.clean ? 1 : 0 },
  };
}

export type SweeperRecordsLoad = {
  status: 'saved' | 'empty' | 'invalid' | 'unavailable';
  records: SweeperRecords;
};

export function loadSweeperRecords(
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): SweeperRecordsLoad {
  if (!storage) return { status: 'unavailable', records: {} };
  let raw: string | null;
  try {
    raw = storage.getItem(SWEEPER_RECORDS_KEY);
  } catch {
    return { status: 'unavailable', records: {} };
  }
  if (raw === null) return { status: 'empty', records: {} };
  try {
    const records = validateSweeperRecords(JSON.parse(raw));
    return records
      ? { status: 'saved', records }
      : { status: 'invalid', records: {} };
  } catch {
    return { status: 'invalid', records: {} };
  }
}

export function saveSweeperRecords(
  records: SweeperRecords,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): 'saved' | 'unavailable' {
  if (!storage) return 'unavailable';
  try {
    storage.setItem(SWEEPER_RECORDS_KEY, JSON.stringify(records));
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
