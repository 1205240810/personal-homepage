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

// ---- 每日灯阵（lib/pulse-daily.ts）----
import {
  PULSE_DAILY_KEY,
  PULSE_DAILY_SIZES,
  boardAfter,
  createDailySave,
  dailyPuzzle,
  loadDailySave,
  localDate,
  pressCell,
  solveDaily,
  starsFor,
  storeDailySave,
  validateDailySave,
  withDailyResult,
} from '../lib/pulse-daily.ts';

void test('每日灯阵按日期与尺寸确定生成，可解且最短步数达到下限', () => {
  const minPar = { 4: 4, 5: 6, 6: 8 } as const;
  const start = new Date(2026, 0, 1);
  for (let day = 0; day < 120; day++) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    const ds = localDate(date);
    for (const size of PULSE_DAILY_SIZES) {
      const p = dailyPuzzle(ds, size);
      assert.deepEqual(dailyPuzzle(ds, size), p, '同一天同尺寸题目一致');
      assert.equal(p.board.length, size * size);
      const solution = solveDaily(p.board, size)!;
      assert.equal(solution.length, p.par);
      assert(p.par >= minPar[size], `${ds} ${size}×${size} 最短 ${p.par} 步`);
      assert(boardAfter(p, solution).every((x) => x === 0));
    }
  }
  assert.notDeepEqual(
    dailyPuzzle('2026-10-09', 6).board,
    dailyPuzzle('2026-10-10', 6).board,
  );
});

void test('6×6 求解器与暴力最短解一致（小盘交叉验证），并处理不可解盘面', () => {
  // 4×4 has a 4-dimensional null space: compare with the 32-bit level solver.
  for (const level of PULSE_LEVELS.filter((l) => l.size === 4)) {
    const board = Array.from({ length: 16 }, (_, i) => (level.board >> i) & 1);
    const bits = solvePulse(level.board, 4)!;
    let count = 0;
    for (let i = 0; i < 16; i++) if (bits & (1 << i)) count++;
    assert.equal(solveDaily(board, 4)!.length, count);
  }
  // A single lit corner on 4×4 is not solvable.
  const lone = Array<number>(16).fill(0);
  lone[0] = 1;
  assert.equal(solveDaily(lone, 4), null);
  // On 6×6 every press set is the unique solution of its board.
  const presses = [0, 7, 14, 21, 28, 35, 5];
  const board = presses.reduce(
    (b, cell) => pressCell(b, cell, 6),
    Array<number>(36).fill(0),
  );
  assert.deepEqual(
    [...solveDaily(board, 6)!].sort((a, b) => a - b),
    [...presses].sort((a, b) => a - b),
  );
});

void test('星级：最短步数三星，小幅超出二星，其余一星', () => {
  assert.equal(starsFor(6, 6), 3);
  assert.equal(starsFor(8, 6), 2);
  assert.equal(starsFor(9, 6), 1);
  assert.equal(starsFor(13, 12), 2);
  assert.equal(starsFor(16, 12), 2);
  assert.equal(starsFor(17, 12), 1);
});

void test('每日存档：按尺寸保留进度，跨日只保留记录，非法数据拒绝，最佳记录不倒退', () => {
  const store = memoryStorage();
  const today = '2026-10-09';
  assert.equal(loadDailySave(today, store).status, 'empty');
  const p5 = dailyPuzzle(today, 5);
  const p6 = dailyPuzzle(today, 6);
  let save = createDailySave(today, 6);
  save.boards[6] = { presses: [0, 1], hints: 1 };
  const solution = solveDaily(p5.board, 5)!;
  save = withDailyResult(save, p5, solution.length + 3, 0);
  assert.equal(save.records[`${today}:5`].stars, 2);
  save = withDailyResult(save, p5, solution.length, 2);
  assert.deepEqual(save.records[`${today}:5`], {
    moves: p5.par,
    hints: 2,
    stars: 3,
  });
  assert.equal(
    withDailyResult(save, p5, solution.length + 1, 0),
    save,
    '更差成绩不覆盖',
  );
  assert(storeDailySave(save, store));
  assert(store.values.has(PULSE_DAILY_KEY));
  const again = loadDailySave(today, store);
  assert.equal(again.status, 'saved');
  assert.deepEqual(again.save, save);
  // Next day: records kept, boards reset.
  const tomorrow = loadDailySave('2026-10-10', store);
  assert.deepEqual(tomorrow.save.boards[6], { presses: [], hints: 0 });
  assert.deepEqual(tomorrow.save.records, save.records);
  // Pressing after the board is cleared, or an out-of-range cell, is rejected.
  const cleared = solveDaily(p6.board, 6)!;
  const bad = structuredClone(save);
  bad.boards[6] = { presses: [...cleared, 0], hints: 0 };
  assert.equal(validateDailySave(bad, today), null);
  bad.boards[6] = { presses: [36], hints: 0 };
  assert.equal(validateDailySave(bad, today), null);
  assert.equal(
    validateDailySave(
      { ...save, records: { 'x:5': { moves: 1, hints: 0, stars: 3 } } },
      today,
    ),
    null,
  );
  store.values.set(PULSE_DAILY_KEY, '{');
  assert.equal(loadDailySave(today, store).status, 'invalid');
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(loadDailySave(today, blocked).status, 'unavailable');
});

void test('每日存档合并各标签页最佳成绩，按步数再按提示数取优，损坏存档仍可重新保存', () => {
  const store = memoryStorage();
  const today = '2026-10-09';
  const puzzle = dailyPuzzle(today, 5);
  const initial = createDailySave(today);
  const oldTab = withDailyResult(initial, puzzle, puzzle.par + 2, 0);
  const improved = withDailyResult(initial, puzzle, puzzle.par, 2);
  assert(storeDailySave(improved, store));
  const reconciled = storeDailySave(oldTab, store)!;
  assert.deepEqual(reconciled.records[`${today}:5`], {
    moves: puzzle.par,
    hints: 2,
    stars: 3,
  });
  assert.deepEqual(
    loadDailySave(today, store).save.records,
    reconciled.records,
  );
  const fewerHints = withDailyResult(initial, puzzle, puzzle.par, 0);
  assert(storeDailySave(fewerHints, store));
  assert(storeDailySave(improved, store));
  assert.equal(loadDailySave(today, store).save.records[`${today}:5`].hints, 0);

  store.values.set(PULSE_DAILY_KEY, '{');
  assert(storeDailySave(initial, store));
  assert.equal(loadDailySave(today, store).status, 'saved');
  assert.equal(
    storeDailySave(initial, {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    }),
    null,
  );
});
