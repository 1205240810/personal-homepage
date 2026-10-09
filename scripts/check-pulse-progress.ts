import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PULSE_LEVELS, pressPulse, solvePulse } from '../lib/pulse-puzzle.ts';
import {
  MAX_PULSE_HISTORY,
  PULSE_PROGRESS_KEY,
  createPulseProgress,
  loadPulseProgress,
  savePulseProgress,
  validatePulseProgress,
  type PulseProgress,
} from '../lib/pulse-progress.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function solveLevel(levelId: number): PulseProgress {
  const progress = createPulseProgress(levelId);
  const level = PULSE_LEVELS.find((item) => item.id === levelId)!;
  const solution = solvePulse(level.board, level.size)!;
  for (let cell = 0; cell < level.size * level.size; cell++) {
    if (solution & (1 << cell)) {
      progress.history.push(
        pressPulse(progress.history.at(-1)!, cell, level.size),
      );
    }
  }
  progress.results[levelId] = { moves: progress.history.length - 1, hints: 0 };
  return progress;
}

void test('存档重载保留当前关卡、灯阵、撤回历史、提示和通关最佳记录', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadPulseProgress(storage), {
    status: 'empty',
    progress: null,
  });
  const progress = createPulseProgress(9);
  const level = PULSE_LEVELS[8];
  progress.history.push(pressPulse(level.board, 0, level.size));
  progress.history.push(pressPulse(progress.history.at(-1)!, 9, level.size));
  const solution = solvePulse(progress.history.at(-1)!, level.size)!;
  progress.hint = 31 - Math.clz32(solution & -solution);
  progress.hintsUsed = 2;
  progress.results = { 1: { moves: 1, hints: 0 }, 8: { moves: 6, hints: 2 } };
  assert.equal(savePulseProgress(progress, storage), 'saved');
  assert.equal(storage.values.size, 1);
  assert(storage.values.has(PULSE_PROGRESS_KEY));

  // A new component instance reads a fresh object from the same browser store.
  const remounted = loadPulseProgress(storage);
  assert.equal(remounted.status, 'saved');
  assert.deepEqual(remounted.progress, progress);
  assert.notEqual(remounted.progress, progress);
  assert(remounted.progress);
  remounted.progress.history.pop();
  remounted.progress.hint = null;
  assert.equal(savePulseProgress(remounted.progress, storage), 'saved');
  const refreshed = loadPulseProgress(storage);
  assert.equal(refreshed.progress?.history.length, 2);
  assert.equal(
    refreshed.progress?.history.at(-1),
    pressPulse(level.board, 0, level.size),
  );
  assert.deepEqual(refreshed.progress?.results, progress.results);
  assert.equal(progress.history.length, 3, '重载数据与上一次组件状态互不修改');
});

void test('所有关卡的有效通关及重来存档均可恢复，重来保留完成记录', () => {
  const storage = memoryStorage();
  const records: PulseProgress['results'] = {};
  for (const level of PULSE_LEVELS) {
    const solved = solveLevel(level.id);
    assert.equal(solved.history.at(-1), 0);
    Object.assign(records, solved.results);
    solved.results = { ...records };
    assert.equal(savePulseProgress(solved, storage), 'saved');
    assert.deepEqual(loadPulseProgress(storage).progress, solved);
    const restarted = {
      ...createPulseProgress(level.id),
      results: solved.results,
    };
    assert.equal(savePulseProgress(restarted, storage), 'saved');
    assert.deepEqual(loadPulseProgress(storage).progress, restarted);
  }
  assert.equal(
    Object.keys(loadPulseProgress(storage).progress!.results).length,
    12,
  );
});

void test('损坏、未知版本、越界、伪造历史与不可信键不会成为有效存档', () => {
  const original = createPulseProgress();
  const solved = solveLevel(1);
  const malformed: unknown[] = [
    null,
    [],
    {},
    'saved',
    { ...original, version: 2 },
    { ...original, levelId: 0 },
    { ...original, levelId: '1' },
    { ...original, unknown: true },
    { ...original, history: [] },
    { ...original, history: [0] },
    { ...original, history: [original.history[0], -1] },
    { ...original, history: [original.history[0], 2 ** 16] },
    { ...original, history: [original.history[0], 1.5] },
    { ...original, history: [original.history[0], original.history[0]] },
    { ...original, history: [original.history[0], original.history[0] ^ 1] },
    { ...solved, history: [...solved.history, pressPulse(0, 0)] },
    {
      ...original,
      history: Array.from(
        { length: MAX_PULSE_HISTORY + 1 },
        () => original.history[0],
      ),
    },
    { ...original, hint: 0 },
    { ...original, hint: 16, hintsUsed: 1 },
    { ...original, hint: 0, hintsUsed: 1 },
    { ...original, hintsUsed: -1 },
    { ...original, hintsUsed: Infinity },
    { ...original, hintsUsed: 1.5 },
    { ...original, results: [] },
    { ...original, results: { 13: { moves: 1, hints: 0 } } },
    { ...original, results: { '01': { moves: 1, hints: 0 } } },
    { ...original, results: { 1: { moves: 0, hints: 0 } } },
    { ...original, results: { 1: { moves: 1.5, hints: 0 } } },
    { ...original, results: { 1: { moves: 1, hints: -1 } } },
    { ...original, results: { 1: { moves: 1, hints: 0, unknown: true } } },
    { ...original, results: JSON.parse('{"__proto__":{"moves":1,"hints":0}}') },
    { ...solved, results: {} },
    { ...solved, results: { 1: { moves: 2, hints: 0 } } },
    { ...solved, results: { 1: { moves: 1, hints: 1 } } },
    { ...solved, hint: 5, hintsUsed: 1 },
  ];
  for (const candidate of malformed) {
    assert.equal(
      validatePulseProgress(candidate),
      null,
      JSON.stringify(candidate),
    );
  }
  const storage = memoryStorage();
  for (const raw of [
    '{',
    'null',
    '[]',
    '{"version":999}',
    ' '.repeat(200_001),
  ]) {
    storage.setItem(PULSE_PROGRESS_KEY, raw);
    assert.deepEqual(loadPulseProgress(storage), {
      status: 'invalid',
      progress: null,
    });
    // Invalid saves can be safely replaced by a new game.
    assert.equal(savePulseProgress(original, storage), 'saved');
    assert.deepEqual(loadPulseProgress(storage).progress, original);
  }
});

void test('存储被禁用或配额已满不会抛错，不覆盖已有存档', () => {
  const progress = createPulseProgress();
  assert.deepEqual(
    loadPulseProgress({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
    {
      status: 'unavailable',
      progress: null,
    },
  );
  assert.equal(
    savePulseProgress(progress, {
      setItem: () => {
        throw new Error('quota');
      },
    }),
    'unavailable',
  );
  const storage = memoryStorage();
  assert.equal(savePulseProgress(progress, storage), 'saved');
  const old = storage.getItem(PULSE_PROGRESS_KEY);
  assert.equal(
    savePulseProgress({ ...progress, history: [] }, storage),
    'invalid',
  );
  assert.equal(storage.getItem(PULSE_PROGRESS_KEY), old);
  // SSR has no window; callers still receive a safe unavailable result.
  assert.equal(loadPulseProgress().status, 'unavailable');
  assert.equal(savePulseProgress(progress), 'unavailable');
});
