import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLAGGED,
  HIDDEN,
  REVEALED,
  SWEEPER_LEVELS,
  countNearby,
  createSweeper,
  dailySweeperSeed,
  faultsRemaining,
  generateSweeperField,
  getSweeperLevel,
  loadSweeperRecords,
  mergeSweeperRecord,
  neighbors,
  revealCell,
  saveSweeperRecords,
  toggleFlag,
  validateSweeperRecords,
  type SweeperField,
  type SweeperLevelId,
  type SweeperState,
} from '../lib/games/mech-sweeper.ts';

const SEEDS = [0, 1, 7, 42, 20_261_009, 0xffffffff];

function solveByOpeningSafeCells(state: SweeperState) {
  let next = state;
  next.mines.forEach((mine, i) => {
    if (!mine && next.marks[i] === HIDDEN) next = revealCell(next, i);
  });
  return next;
}

void test('同一编号重建同一张检修舱，故障数正确且起点九宫格安全', () => {
  for (const level of SWEEPER_LEVELS)
    for (const seed of SEEDS) {
      const field = generateSweeperField(level.id, seed);
      assert.deepEqual(field, generateSweeperField(level.id, seed));
      assert.equal(field.mines.length, level.cols * level.rows);
      assert.equal(field.mines.filter(Boolean).length, level.mines);
      for (const i of [
        field.start,
        ...neighbors(level.cols, level.rows, field.start),
      ])
        assert(!field.mines[i]);
      assert.equal(countNearby(level, field.mines)[field.start], 0);
    }
});

void test('从扫描起点开局会连片展开', () => {
  for (const level of SWEEPER_LEVELS)
    for (const seed of SEEDS) {
      const field = generateSweeperField(level.id, seed);
      const s = revealCell(createSweeper(field), field.start);
      assert.equal(s.status === 'won' ? 'won' : 'playing', s.status);
      assert(s.marks.filter((m) => m === REVEALED).length >= 9);
    }
});

void test('第一次扫描一定安全：故障移走且总数不变', () => {
  for (const level of SWEEPER_LEVELS)
    for (const seed of SEEDS) {
      const field = generateSweeperField(level.id, seed);
      const mine = field.mines.indexOf(true);
      const s = revealCell(createSweeper(field), mine);
      assert.notEqual(s.status, 'lost');
      assert.equal(s.mines[mine], false);
      assert.equal(s.mines.filter(Boolean).length, level.mines);
      assert.equal(s.shorted.length, 0);
    }
});

void test('第二次误触故障即短路（无保险丝难度）', () => {
  const field = generateSweeperField('tech', 42);
  let s = revealCell(createSweeper(field), field.start);
  const mine = s.mines.findIndex((m, i) => m && s.marks[i] === HIDDEN);
  s = revealCell(s, mine);
  assert.equal(s.status, 'lost');
  assert.deepEqual(s.shorted, [mine]);
  assert.equal(revealCell(s, field.start), s, '结束后不再改变');
});

void test('见习难度的保险丝吸收一次短路，第二次才失败', () => {
  const field = generateSweeperField('cadet', 7);
  let s = revealCell(createSweeper(field), field.start);
  const faults = s.mines
    .map((m, i) => (m && s.marks[i] === HIDDEN ? i : -1))
    .filter((i) => i >= 0);
  s = revealCell(s, faults[0]);
  assert.equal(s.status, 'playing');
  assert.equal(s.fusesLeft, 0);
  assert.equal(s.marks[faults[0]], FLAGGED);
  s = revealCell(s, faults[1]);
  assert.equal(s.status, 'lost');
});

void test('打开全部安全格即胜利，故障自动插旗', () => {
  for (const level of SWEEPER_LEVELS)
    for (const seed of SEEDS) {
      const field = generateSweeperField(level.id, seed);
      const s = solveByOpeningSafeCells(
        revealCell(createSweeper(field), field.start),
      );
      assert.equal(s.status, 'won');
      assert.equal(faultsRemaining(s), 0);
      assert(
        s.marks.every((m, i) => (s.mines[i] ? m === FLAGGED : m === REVEALED)),
      );
    }
});

void test('插旗与数字连开：旗数相符才展开，旗下格子不会被扫开', () => {
  const field: SweeperField = {
    level: 'cadet',
    seed: 0,
    start: 63,
    mines: Array.from({ length: 64 }, (_, i) => i === 0 || i === 10),
  };
  // Signal at index 1 sees faults 0 and 10.
  let s = createSweeper(field);
  s = revealCell(s, 1);
  assert.equal(countNearby(getSweeperLevel('cadet'), s.mines)[1], 2);
  const before = s;
  assert.equal(revealCell(s, 1), before, '旗数不足时不连开');
  s = toggleFlag(s, 0);
  assert.equal(revealCell(s, 0), s, '旗下格子不可扫描');
  s = toggleFlag(s, 10);
  assert.equal(faultsRemaining(s), getSweeperLevel('cadet').mines - 2);
  s = revealCell(s, 1);
  assert.equal(s.status, 'playing');
  for (const n of neighbors(8, 8, 1))
    if (!s.mines[n]) assert.equal(s.marks[n], REVEALED);
  // A wrong flag makes the chord open a real fault.
  let w = toggleFlag(revealCell(createSweeper(field), 1), 0);
  w = toggleFlag(w, 2);
  w = revealCell(w, 1);
  // 见习的保险丝替误标挡下这次短路。
  assert.deepEqual(w.shorted, [10]);
  assert.equal(w.status, 'playing');
  assert.equal(w.fusesLeft, 0);
  assert.equal(toggleFlag(w, 2).marks[2], HIDDEN);
});

void test('非法难度与编号会被拒绝；今日检修按日期与难度稳定', () => {
  assert.throws(
    () => generateSweeperField('boss' as SweeperLevelId, 1),
    RangeError,
  );
  assert.throws(() => generateSweeperField('cadet', -1), RangeError);
  assert.throws(() => generateSweeperField('cadet', 2 ** 32), RangeError);
  assert.equal(
    dailySweeperSeed(2026, 10, 9, 'tech'),
    dailySweeperSeed(2026, 10, 9, 'tech'),
  );
  assert.notEqual(
    dailySweeperSeed(2026, 10, 9, 'tech'),
    dailySweeperSeed(2026, 10, 10, 'tech'),
  );
  assert.notEqual(
    dailySweeperSeed(2026, 10, 9, 'tech'),
    dailySweeperSeed(2026, 10, 9, 'chief'),
  );
});

void test('本机记录：合并最佳、拒绝坏数据、存储不可用不报错', () => {
  let records = mergeSweeperRecord({}, 'tech', { seconds: 120, clean: true });
  records = mergeSweeperRecord(records, 'tech', { seconds: 95, clean: false });
  assert.deepEqual(records.tech, { seconds: 95, wins: 2, clean: 1 });

  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
  };
  assert.equal(loadSweeperRecords(storage).status, 'empty');
  assert.equal(saveSweeperRecords(records, storage), 'saved');
  assert.deepEqual(loadSweeperRecords(storage), { status: 'saved', records });
  for (const bad of [
    '{',
    '[]',
    '{"boss":{"seconds":1,"wins":1,"clean":0}}',
    '{"tech":{"seconds":0,"wins":1,"clean":0}}',
    '{"tech":{"seconds":5,"wins":1,"clean":2}}',
  ]) {
    memory.set('tscjj:mech-sweeper:v1', bad);
    assert.equal(loadSweeperRecords(storage).status, 'invalid');
  }
  assert.notEqual(validateSweeperRecords({}), null);
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.equal(loadSweeperRecords(broken).status, 'unavailable');
  assert.equal(saveSweeperRecords(records, broken), 'unavailable');
});
