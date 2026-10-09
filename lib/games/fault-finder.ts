// 故障排查：根据传感器读数推断哪些模块出了故障。
// Pure rules only: seeded puzzles with a guaranteed unique answer, deduction
// helpers, hints, diagnosis checks and local records. The React screen is
// components/games/fault-finder.tsx.

export type FaultLevelId = 'cadet' | 'tech' | 'chief';

export type FaultLevel = {
  id: FaultLevelId;
  label: string;
  /** Modules form a size × size bay. */
  size: number;
  faults: number;
  /** Wrong diagnoses allowed before the bay is handed over. */
  strikes: number;
};

export const FAULT_LEVELS: readonly FaultLevel[] = [
  { id: 'cadet', label: '见习', size: 3, faults: 1, strikes: 3 },
  { id: 'tech', label: '技师', size: 4, faults: 2, strikes: 3 },
  { id: 'chief', label: '总工', size: 5, faults: 3, strikes: 3 },
];

export function getFaultLevel(id: FaultLevelId): FaultLevel {
  const level = FAULT_LEVELS.find((item) => item.id === id);
  if (!level) throw new RangeError(`不支持的排查难度：${String(id)}`);
  return level;
}
export const isFaultLevelId = (value: unknown): value is FaultLevelId =>
  FAULT_LEVELS.some((level) => level.id === value);

/** Row = 总线, column = 支路, node = 2 × 2 junction at a grid corner. */
export type SensorKind = 'row' | 'col' | 'node';
export type Sensor = {
  id: string;
  kind: SensorKind;
  /** Row or column index; for nodes, the top-left module of the 2 × 2 block. */
  at: number;
  cells: number[];
};

export type FaultPuzzle = {
  level: FaultLevelId;
  seed: number;
  size: number;
  faults: number[];
  /** Only the sensors kept on the panel, in display order. */
  sensors: Sensor[];
  /** Number of faulty modules each sensor sees. */
  readings: number[];
};

export const MODULE_NAMES = [
  '液压泵',
  '陀螺仪',
  '冷却泵',
  '主控板',
  '伺服臂',
  '电容组',
  '燃料阀',
  '雷达盘',
  '散热鳍',
  '稳压器',
  '推进器',
  '传动轴',
  '光学镜',
  '电池舱',
  '通讯塔',
  '关节轴',
  '涡轮叶',
  '护盾核',
  '导航仪',
  '装甲板',
  '油压表',
  '继电器',
  '滤波器',
  '变频器',
  '储能罐',
];

/** Deterministic PRNG so one seed always rebuilds the same puzzle. */
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

export function dailyFaultSeed(
  year: number,
  month: number,
  day: number,
  level: FaultLevelId,
): number {
  let h = 2166136261;
  const tag = FAULT_LEVELS.findIndex((item) => item.id === level) + 1;
  for (const part of [year, month, day, tag, 0x3f]) {
    h ^= part;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function sensorPool(size: number): Sensor[] {
  const sensors: Sensor[] = [];
  for (let r = 0; r < size; r++)
    sensors.push({
      id: `row-${r}`,
      kind: 'row',
      at: r,
      cells: Array.from({ length: size }, (_, c) => r * size + c),
    });
  for (let c = 0; c < size; c++)
    sensors.push({
      id: `col-${c}`,
      kind: 'col',
      at: c,
      cells: Array.from({ length: size }, (_, r) => r * size + c),
    });
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++) {
      const at = r * size + c;
      sensors.push({
        id: `node-${r}-${c}`,
        kind: 'node',
        at,
        cells: [at, at + 1, at + size, at + size + 1],
      });
    }
  return sensors;
}

export function readSensors(
  sensors: readonly Sensor[],
  faults: readonly number[],
) {
  const set = new Set(faults);
  return sensors.map((s) => s.cells.filter((cell) => set.has(cell)).length);
}

/** Every k-subset of 0..n-1, in lexicographic order. */
function* combinations(n: number, k: number): Generator<number[]> {
  const pick = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield [...pick];
    let i = k - 1;
    while (i >= 0 && pick[i] === n - k + i) i--;
    if (i < 0) return;
    pick[i]++;
    for (let j = i + 1; j < k; j++) pick[j] = pick[j - 1] + 1;
  }
}

/** Fault sets that match every reading (stops after `limit`). */
export function consistentFaults(
  size: number,
  faults: number,
  sensors: readonly Sensor[],
  readings: readonly number[],
  limit = Infinity,
): number[][] {
  const found: number[][] = [];
  for (const combo of combinations(size * size, faults)) {
    const seen = readSensors(sensors, combo);
    if (seen.every((value, i) => value === readings[i])) {
      found.push(combo);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/** Panels smaller than this are too easy; the generator retries a few times. */
const MIN_SENSORS: Record<FaultLevelId, number> = {
  cadet: 3,
  tech: 4,
  chief: 5,
};

export function generateFaultPuzzle(
  level: FaultLevelId,
  seed: number,
): FaultPuzzle {
  const rng = mulberry32(seed);
  let best: FaultPuzzle | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const puzzle = buildPuzzle(level, seed, rng);
    if (!best || puzzle.sensors.length > best.sensors.length) best = puzzle;
    if (puzzle.sensors.length >= MIN_SENSORS[level]) return puzzle;
  }
  return best!;
}

function buildPuzzle(
  level: FaultLevelId,
  seed: number,
  rng: () => number,
): FaultPuzzle {
  const { size, faults: k } = getFaultLevel(level);
  const cells = Array.from({ length: size * size }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (cells.length - i));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const faults = cells.slice(0, k).sort((a, b) => a - b);
  // Start from every sensor (rows alone already pin down 1 fault, and the full
  // pool always identifies the answer), then remove sensors in random order
  // while the answer stays unique. What remains is a minimal panel.
  const pool = sensorPool(size);
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const keep = new Set(order);
  for (const index of order) {
    keep.delete(index);
    const sensors = pool.filter((_, i) => keep.has(i));
    const unique =
      consistentFaults(size, k, sensors, readSensors(sensors, faults), 2)
        .length === 1;
    if (!unique) keep.add(index);
  }
  const sensors = pool.filter((_, i) => keep.has(i));
  return {
    level,
    seed,
    size,
    faults,
    sensors,
    readings: readSensors(sensors, faults),
  };
}

// ---------------------------------------------------------------------------
// Player marks and diagnosis.

export const UNKNOWN = 0;
export const MARK_FAULT = 1;
export const MARK_OK = 2;
export type ModuleMark = typeof UNKNOWN | typeof MARK_FAULT | typeof MARK_OK;

export function cycleMark(mark: ModuleMark): ModuleMark {
  return mark === UNKNOWN
    ? MARK_FAULT
    : mark === MARK_FAULT
      ? MARK_OK
      : UNKNOWN;
}

export type SensorState = 'open' | 'satisfied' | 'conflict';

/** How a sensor relates to the current marks (not to the hidden answer). */
export function sensorState(
  sensor: Sensor,
  reading: number,
  marks: readonly ModuleMark[],
): { state: SensorState; marked: number; unknown: number } {
  let marked = 0,
    unknown = 0;
  for (const cell of sensor.cells) {
    if (marks[cell] === MARK_FAULT) marked++;
    else if (marks[cell] === UNKNOWN) unknown++;
  }
  const state =
    marked > reading || marked + unknown < reading
      ? 'conflict'
      : marked === reading
        ? 'satisfied'
        : 'open';
  return { state, marked, unknown };
}

export function checkDiagnosis(
  puzzle: FaultPuzzle,
  marks: readonly ModuleMark[],
) {
  const chosen = marks.flatMap((mark, i) => (mark === MARK_FAULT ? [i] : []));
  if (chosen.length !== puzzle.faults.length)
    return { ready: false, correct: false, found: 0 };
  const truth = new Set(puzzle.faults);
  const found = chosen.filter((cell) => truth.has(cell)).length;
  return { ready: true, correct: found === puzzle.faults.length, found };
}

export type FaultHint =
  | { type: 'wrong'; cell: number }
  | { type: 'zero'; cell: number; sensor: number }
  | { type: 'reveal'; cell: number; fault: boolean };

/**
 * A hint, in order of preference: fix a wrong mark; mark a module that a zero
 * reading already proves healthy; otherwise confirm one unmarked module.
 */
export function faultHint(
  puzzle: FaultPuzzle,
  marks: readonly ModuleMark[],
): FaultHint | null {
  const truth = new Set(puzzle.faults);
  for (let cell = 0; cell < marks.length; cell++) {
    if (
      (marks[cell] === MARK_FAULT && !truth.has(cell)) ||
      (marks[cell] === MARK_OK && truth.has(cell))
    )
      return { type: 'wrong', cell };
  }
  for (let s = 0; s < puzzle.sensors.length; s++) {
    if (puzzle.readings[s] !== 0) continue;
    const cell = puzzle.sensors[s].cells.find((c) => marks[c] === UNKNOWN);
    if (cell !== undefined) return { type: 'zero', cell, sensor: s };
  }
  const fault = puzzle.faults.find((c) => marks[c] === UNKNOWN);
  if (fault !== undefined) return { type: 'reveal', cell: fault, fault: true };
  const healthy = marks.findIndex((m, i) => m === UNKNOWN && !truth.has(i));
  return healthy >= 0 ? { type: 'reveal', cell: healthy, fault: false } : null;
}

// ---------------------------------------------------------------------------
// Local records: per-level bests and which daily bays were cleared.

export const FAULT_RECORDS_KEY = 'tscjj:fault-finder:v1';
const MAX_RECORD = 10_000_000;
const MAX_DAILY = 120;

export type FaultBest = { seconds: number; solved: number; clean: number };
export type FaultRecords = {
  best: Partial<Record<FaultLevelId, FaultBest>>;
  /** `YYYY-MM-DD:level` keys of cleared daily bays, newest last. */
  daily: string[];
};

function count(value: unknown, min: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= MAX_RECORD
  );
}
const DAILY_KEY = /^\d{4}-\d{2}-\d{2}:(cadet|tech|chief)$/;

export function emptyFaultRecords(): FaultRecords {
  return { best: {}, daily: [] };
}

export function validateFaultRecords(value: unknown): FaultRecords | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const { best, daily } = value as Record<string, unknown>;
  if (best === null || typeof best !== 'object' || Array.isArray(best))
    return null;
  if (!Array.isArray(daily) || daily.length > MAX_DAILY * 10) return null;
  const records = emptyFaultRecords();
  for (const [key, item] of Object.entries(best)) {
    if (!isFaultLevelId(key)) return null;
    if (item === null || typeof item !== 'object' || Array.isArray(item))
      return null;
    const { seconds, solved, clean } = item as Record<string, unknown>;
    if (
      !count(seconds, 1) ||
      !count(solved, 1) ||
      !count(clean, 0) ||
      clean > solved
    )
      return null;
    records.best[key] = { seconds, solved, clean };
  }
  for (const key of daily) {
    if (typeof key !== 'string' || !DAILY_KEY.test(key)) return null;
    if (!records.daily.includes(key)) records.daily.push(key);
  }
  records.daily = records.daily.slice(-MAX_DAILY);
  return records;
}

/** `clean` counts solves with no wrong diagnosis and no hint. */
export function mergeFaultRecord(
  records: FaultRecords,
  level: FaultLevelId,
  result: { seconds: number; clean: boolean; dailyKey?: string },
): FaultRecords {
  const seconds = Math.min(MAX_RECORD, Math.max(1, Math.round(result.seconds)));
  const best = records.best[level];
  const daily =
    result.dailyKey &&
    DAILY_KEY.test(result.dailyKey) &&
    !records.daily.includes(result.dailyKey)
      ? [...records.daily, result.dailyKey].slice(-MAX_DAILY)
      : records.daily;
  return {
    best: {
      ...records.best,
      [level]: best
        ? {
            seconds: Math.min(best.seconds, seconds),
            solved: Math.min(MAX_RECORD, best.solved + 1),
            clean: Math.min(MAX_RECORD, best.clean + (result.clean ? 1 : 0)),
          }
        : { seconds, solved: 1, clean: result.clean ? 1 : 0 },
    },
    daily,
  };
}

export function dailyKey(
  today: { year: number; month: number; day: number },
  level: FaultLevelId,
) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today.year}-${pad(today.month)}-${pad(today.day)}:${level}`;
}

export type FaultRecordsLoad = {
  status: 'saved' | 'empty' | 'invalid' | 'unavailable';
  records: FaultRecords;
};

export function loadFaultRecords(
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): FaultRecordsLoad {
  if (!storage) return { status: 'unavailable', records: emptyFaultRecords() };
  let raw: string | null;
  try {
    raw = storage.getItem(FAULT_RECORDS_KEY);
  } catch {
    return { status: 'unavailable', records: emptyFaultRecords() };
  }
  if (raw === null) return { status: 'empty', records: emptyFaultRecords() };
  try {
    const records =
      raw.length < 100_000 ? validateFaultRecords(JSON.parse(raw)) : null;
    return records
      ? { status: 'saved', records }
      : { status: 'invalid', records: emptyFaultRecords() };
  } catch {
    return { status: 'invalid', records: emptyFaultRecords() };
  }
}

export function saveFaultRecords(
  records: FaultRecords,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): 'saved' | 'unavailable' {
  if (!storage) return 'unavailable';
  try {
    storage.setItem(FAULT_RECORDS_KEY, JSON.stringify(records));
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
