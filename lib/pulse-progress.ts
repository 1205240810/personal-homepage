import { PULSE_LEVELS, pressPulse, solvePulse } from './pulse-puzzle.ts';

export const PULSE_PROGRESS_KEY = 'signal-pulse:progress:v1';
export const PULSE_PROGRESS_VERSION = 1;
// Bound work when inspecting untrusted browser storage without truncating undo.
export const MAX_PULSE_HISTORY = 10_001;
const MAX_COUNTER = 1_000_000;
const MAX_SAVE_LENGTH = 200_000;

export type PulseResult = { moves: number; hints: number };
export type PulseProgress = {
  version: typeof PULSE_PROGRESS_VERSION;
  levelId: number;
  history: number[];
  hint: number | null;
  hintsUsed: number;
  // A best record also identifies a completed level; keep one source of truth.
  results: Record<number, PulseResult>;
};

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;
export type PulseProgressLoad =
  | { status: 'saved'; progress: PulseProgress }
  | { status: 'empty' | 'invalid' | 'unavailable'; progress: null };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function createPulseProgress(
  levelId: number = PULSE_LEVELS[0].id,
): PulseProgress {
  const level =
    PULSE_LEVELS.find((item) => item.id === levelId) ?? PULSE_LEVELS[0];
  return {
    version: PULSE_PROGRESS_VERSION,
    levelId: level.id,
    history: [level.board],
    hint: null,
    hintsUsed: 0,
    results: {},
  };
}

export function validatePulseProgress(value: unknown): PulseProgress | null {
  if (
    !object(value) ||
    !exactKeys(value, [
      'version',
      'levelId',
      'history',
      'hint',
      'hintsUsed',
      'results',
    ]) ||
    value.version !== PULSE_PROGRESS_VERSION
  )
    return null;
  const level = PULSE_LEVELS.find((item) => item.id === value.levelId);
  if (
    !level ||
    !Array.isArray(value.history) ||
    value.history.length === 0 ||
    value.history.length > MAX_PULSE_HISTORY ||
    value.history[0] !== level.board ||
    !integer(value.hintsUsed, 0, MAX_COUNTER) ||
    !object(value.results)
  )
    return null;

  const history: number[] = [];
  const masks = new Set(
    Array.from({ length: level.size * level.size }, (_, cell) =>
      pressPulse(0, cell, level.size),
    ),
  );
  for (const board of value.history) {
    if (!integer(board, 0, 2 ** (level.size * level.size) - 1)) return null;
    const previous = history.at(-1);
    // Every step must be one legal press, and a solved board cannot be pressed.
    if (
      previous !== undefined &&
      (previous === 0 || !masks.has(previous ^ board))
    )
      return null;
    history.push(board);
  }
  const board = history[history.length - 1];
  if (value.hint !== null) {
    if (
      board === 0 ||
      value.hintsUsed === 0 ||
      !integer(value.hint, 0, level.size * level.size - 1)
    )
      return null;
    const solution = solvePulse(board, level.size);
    if (!solution || value.hint !== 31 - Math.clz32(solution & -solution))
      return null;
  }

  const results: Record<number, PulseResult> = {};
  for (const [key, result] of Object.entries(value.results)) {
    const completedLevel = PULSE_LEVELS.find((item) => String(item.id) === key);
    if (
      !completedLevel ||
      !object(result) ||
      !exactKeys(result, ['moves', 'hints']) ||
      !integer(result.moves, completedLevel.par, MAX_COUNTER) ||
      !integer(result.hints, 0, MAX_COUNTER)
    )
      return null;
    results[completedLevel.id] = { moves: result.moves, hints: result.hints };
  }
  if (board === 0) {
    const result = results[level.id];
    const moves = history.length - 1;
    if (
      !result ||
      result.moves > moves ||
      (result.moves === moves && result.hints > value.hintsUsed)
    )
      return null;
  }
  return {
    version: PULSE_PROGRESS_VERSION,
    levelId: level.id,
    history,
    hint: value.hint,
    hintsUsed: value.hintsUsed,
    results,
  };
}

export function loadPulseProgress(storage?: ReadStorage): PulseProgressLoad {
  try {
    // Accessing localStorage itself can throw when browser storage is blocked.
    const raw = (storage ?? window.localStorage).getItem(PULSE_PROGRESS_KEY);
    if (raw === null) return { status: 'empty', progress: null };
    if (raw.length > MAX_SAVE_LENGTH)
      return { status: 'invalid', progress: null };
    const progress = validatePulseProgress(JSON.parse(raw));
    return progress
      ? { status: 'saved', progress }
      : { status: 'invalid', progress: null };
  } catch (error) {
    return {
      status: error instanceof SyntaxError ? 'invalid' : 'unavailable',
      progress: null,
    };
  }
}

export function savePulseProgress(
  progress: PulseProgress,
  storage?: WriteStorage,
): 'saved' | 'invalid' | 'unavailable' {
  const valid = validatePulseProgress(progress);
  if (!valid) return 'invalid';
  try {
    (storage ?? window.localStorage).setItem(
      PULSE_PROGRESS_KEY,
      JSON.stringify(valid),
    );
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
