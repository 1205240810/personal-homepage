import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CIRCUIT_LEVELS,
  circuitHint,
  circuitPar,
  currentMasks,
  dailyCircuitSeed,
  degree,
  generateCircuit,
  isCircuitSolved,
  loadCircuitRecords,
  mergeCircuitRecord,
  rotateMask,
  saveCircuitRecords,
  tracePower,
  turnsToMatch,
  validateCircuitRecords,
  type CircuitSize,
} from '../lib/games/circuit-repair.ts';

const SEEDS = [0, 1, 42, 20_260_101, 0xffffffff, 123_456_789];

void test('旋转按顺时针循环，四次回到原位', () => {
  assert.equal(rotateMask(1, 1), 2);
  assert.equal(rotateMask(8, 1), 1);
  assert.equal(rotateMask(3, -1), 9);
  for (let mask = 0; mask < 16; mask += 1) {
    assert.equal(rotateMask(mask, 4), mask);
    assert.equal(rotateMask(rotateMask(mask, 3), 1), mask);
  }
  assert.equal(turnsToMatch(5, 10), 1);
  assert.equal(turnsToMatch(1, 3), null);
});

void test('生成的线路是覆盖全盘的生成树，原始朝向即可通关', () => {
  for (const { size } of CIRCUIT_LEVELS)
    for (const seed of SEEDS) {
      const p = generateCircuit(size, seed);
      assert.equal(p.solution.length, size * size);
      const edges = p.solution.reduce((sum, mask) => sum + degree(mask), 0) / 2;
      assert.equal(edges, size * size - 1, '恰好 n-1 条连线');
      assert(p.solution.every((mask) => degree(mask) >= 1));
      assert(isCircuitSolved(size, p.solution, p.source));
      assert(tracePower(size, p.solution, p.source).every(Boolean));
    }
});

void test('同一编号重建同一张线路，开局一定未完成', () => {
  for (const { size } of CIRCUIT_LEVELS)
    for (const seed of SEEDS) {
      const a = generateCircuit(size, seed);
      assert.deepEqual(a, generateCircuit(size, seed));
      assert(!isCircuitSolved(size, currentMasks(a, a.scramble), a.source));
      assert(circuitPar(a) > 0);
    }
});

void test('沿提示逐步旋转一定能修好，且不超过参考步数', () => {
  for (const { size } of CIRCUIT_LEVELS)
    for (const seed of SEEDS) {
      const p = generateCircuit(size, seed);
      const turns = [...p.scramble];
      let rotations = 0;
      for (let guard = 0; guard < size * size; guard += 1) {
        const hint = circuitHint(p, turns);
        if (!hint) break;
        turns[hint.index] += hint.turns;
        rotations += hint.turns;
      }
      assert(isCircuitSolved(size, currentMasks(p, turns), p.source));
      assert.equal(circuitHint(p, turns), null);
      assert(rotations <= circuitPar(p));
    }
});

void test('非法尺寸和编号会被拒绝', () => {
  assert.throws(() => generateCircuit(3 as CircuitSize, 1), RangeError);
  assert.throws(() => generateCircuit(5, -1), RangeError);
  assert.throws(() => generateCircuit(5, 2 ** 32), RangeError);
  assert.throws(() => generateCircuit(5, 1.5), RangeError);
});

void test('今日线路按日期与尺寸稳定', () => {
  assert.equal(
    dailyCircuitSeed(2026, 10, 9, 5),
    dailyCircuitSeed(2026, 10, 9, 5),
  );
  assert.notEqual(
    dailyCircuitSeed(2026, 10, 9, 5),
    dailyCircuitSeed(2026, 10, 10, 5),
  );
  assert.notEqual(
    dailyCircuitSeed(2026, 10, 9, 5),
    dailyCircuitSeed(2026, 10, 9, 6),
  );
});

void test('本机记录：合并最佳成绩、拒绝坏数据、存储不可用不报错', () => {
  let records = mergeCircuitRecord({}, 5, { seconds: 80, moves: 30 });
  records = mergeCircuitRecord(records, 5, { seconds: 95, moves: 22 });
  assert.deepEqual(records[5], { seconds: 80, moves: 22, solved: 2 });

  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
  };
  assert.equal(loadCircuitRecords(storage).status, 'empty');
  assert.equal(saveCircuitRecords(records, storage), 'saved');
  assert.deepEqual(loadCircuitRecords(storage), { status: 'saved', records });

  for (const bad of [
    '{',
    '[]',
    '{"3":{"seconds":1,"moves":1,"solved":1}}',
    '{"5":{"seconds":0,"moves":1,"solved":1}}',
    '{"5":{"seconds":1,"moves":"2","solved":1}}',
  ]) {
    memory.set('tscjj:circuit-repair:v1', bad);
    assert.equal(loadCircuitRecords(storage).status, 'invalid');
  }
  assert.equal(validateCircuitRecords({}) !== null, true);

  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.equal(loadCircuitRecords(broken).status, 'unavailable');
  assert.equal(saveCircuitRecords(records, broken), 'unavailable');
  assert.equal(loadCircuitRecords(null).status, 'unavailable');
});
