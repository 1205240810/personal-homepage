import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FAULT_LEVELS,
  FAULT_RECORDS_KEY,
  MARK_FAULT,
  MARK_OK,
  UNKNOWN,
  checkDiagnosis,
  consistentFaults,
  cycleMark,
  dailyFaultSeed,
  dailyKey,
  emptyFaultRecords,
  faultHint,
  generateFaultPuzzle,
  loadFaultRecords,
  mergeFaultRecord,
  readSensors,
  saveFaultRecords,
  sensorPool,
  sensorState,
  validateFaultRecords,
  type ModuleMark,
} from '../lib/games/fault-finder.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

const MIN_SENSORS = { cadet: 3, tech: 4, chief: 5 } as const;

void test('每张题都只有一个答案，读数与故障一致，同一编号重建同一张', () => {
  for (const level of FAULT_LEVELS) {
    const seeds = level.id === 'chief' ? 25 : 150;
    for (let s = 0; s < seeds; s++) {
      const seed = (s * 2_654_435_761) >>> 0;
      const p = generateFaultPuzzle(level.id, seed);
      assert.deepEqual(generateFaultPuzzle(level.id, seed), p);
      assert.equal(p.faults.length, level.faults);
      assert.equal(new Set(p.faults).size, level.faults);
      assert(p.faults.every((c) => c >= 0 && c < level.size ** 2));
      assert.deepEqual(readSensors(p.sensors, p.faults), p.readings);
      const all = consistentFaults(p.size, level.faults, p.sensors, p.readings);
      assert.deepEqual(all, [p.faults], `${level.id} #${seed} 答案不唯一`);
      assert(p.sensors.length >= Math.min(MIN_SENSORS[level.id], 3));
    }
  }
});

void test('传感器面板是极小的：去掉任意一个都会出现第二个答案', () => {
  for (const level of FAULT_LEVELS) {
    for (let s = 1; s <= (level.id === 'chief' ? 8 : 30); s++) {
      const p = generateFaultPuzzle(level.id, s * 977);
      for (let i = 0; i < p.sensors.length; i++) {
        const sensors = p.sensors.filter((_, j) => j !== i);
        const readings = p.readings.filter((_, j) => j !== i);
        assert(
          consistentFaults(p.size, level.faults, sensors, readings, 2).length >
            1,
          `${level.id} #${s} 第 ${i} 个传感器是多余的`,
        );
      }
    }
  }
});

void test('传感器池：行、列与 2×2 节点覆盖正确的模块', () => {
  const pool = sensorPool(4);
  assert.equal(pool.length, 4 + 4 + 9);
  assert.deepEqual(pool.find((s) => s.id === 'row-1')!.cells, [4, 5, 6, 7]);
  assert.deepEqual(pool.find((s) => s.id === 'col-2')!.cells, [2, 6, 10, 14]);
  assert.deepEqual(
    pool.find((s) => s.id === 'node-2-1')!.cells,
    [9, 10, 13, 14],
  );
});

void test('每日题：同日同难度相同，不同日期或难度不同', () => {
  assert.equal(
    dailyFaultSeed(2026, 10, 9, 'tech'),
    dailyFaultSeed(2026, 10, 9, 'tech'),
  );
  assert.notEqual(
    dailyFaultSeed(2026, 10, 9, 'tech'),
    dailyFaultSeed(2026, 10, 10, 'tech'),
  );
  assert.notEqual(
    dailyFaultSeed(2026, 10, 9, 'tech'),
    dailyFaultSeed(2026, 10, 9, 'chief'),
  );
  assert.equal(
    dailyKey({ year: 2026, month: 3, day: 7 }, 'cadet'),
    '2026-03-07:cadet',
  );
});

void test('标记循环、传感器状态与诊断判定', () => {
  assert.equal(cycleMark(UNKNOWN), MARK_FAULT);
  assert.equal(cycleMark(MARK_FAULT), MARK_OK);
  assert.equal(cycleMark(MARK_OK), UNKNOWN);
  const p = generateFaultPuzzle('tech', 12345);
  const marks: ModuleMark[] = Array(16).fill(UNKNOWN);
  assert.deepEqual(checkDiagnosis(p, marks), {
    ready: false,
    correct: false,
    found: 0,
  });
  for (const f of p.faults) marks[f] = MARK_FAULT;
  assert.deepEqual(checkDiagnosis(p, marks), {
    ready: true,
    correct: true,
    found: 2,
  });
  p.sensors.forEach((sensor, i) =>
    assert.equal(sensorState(sensor, p.readings[i], marks).state, 'satisfied'),
  );
  const wrong = [...marks];
  wrong[p.faults[0]] = UNKNOWN;
  const other = Array.from({ length: 16 }, (_, i) => i).find(
    (i) => !p.faults.includes(i),
  )!;
  wrong[other] = MARK_FAULT;
  assert.deepEqual(checkDiagnosis(p, wrong), {
    ready: true,
    correct: false,
    found: 1,
  });
  // A row reading 0 with a fault marked in it is a conflict.
  const row = { id: 'row-0', kind: 'row' as const, at: 0, cells: [0, 1, 2, 3] };
  const m: ModuleMark[] = Array(16).fill(UNKNOWN);
  m[1] = MARK_FAULT;
  assert.equal(sensorState(row, 0, m).state, 'conflict');
  m[1] = MARK_OK;
  m[0] = m[2] = m[3] = MARK_OK;
  assert.equal(sensorState(row, 1, m).state, 'conflict');
});

void test('提示：先纠正错标，再用 0 读数，最后确认一个模块，且从不说错', () => {
  for (const level of FAULT_LEVELS) {
    const p = generateFaultPuzzle(level.id, 99);
    const truth = new Set(p.faults);
    const marks: ModuleMark[] = Array(p.size ** 2).fill(UNKNOWN);
    const healthy = Array.from({ length: p.size ** 2 }, (_, i) => i).find(
      (i) => !truth.has(i),
    )!;
    marks[healthy] = MARK_FAULT;
    assert.deepEqual(faultHint(p, marks), { type: 'wrong', cell: healthy });
    marks[healthy] = UNKNOWN;
    // Following hints alone always reaches the answer.
    for (let step = 0; step < p.size ** 2; step++) {
      const hint = faultHint(p, marks);
      if (!hint) break;
      assert.notEqual(hint.type, 'wrong');
      const isFault = truth.has(hint.cell);
      if (hint.type === 'zero') {
        assert.equal(p.readings[hint.sensor], 0);
        assert(!isFault);
      }
      if (hint.type === 'reveal') assert.equal(hint.fault, isFault);
      marks[hint.cell] = isFault ? MARK_FAULT : MARK_OK;
    }
    assert(checkDiagnosis(p, marks).correct);
    assert.equal(faultHint(p, marks), null);
  }
});

void test('本机记录：合并最佳、今日完成去重、拒绝伪造数据、存储不可用不抛错', () => {
  let r = emptyFaultRecords();
  r = mergeFaultRecord(r, 'tech', {
    seconds: 80.4,
    clean: false,
    dailyKey: '2026-10-09:tech',
  });
  r = mergeFaultRecord(r, 'tech', {
    seconds: 50,
    clean: true,
    dailyKey: '2026-10-09:tech',
  });
  r = mergeFaultRecord(r, 'tech', {
    seconds: 90,
    clean: true,
    dailyKey: 'bogus',
  });
  assert.deepEqual(r.best.tech, { seconds: 50, solved: 3, clean: 2 });
  assert.deepEqual(r.daily, ['2026-10-09:tech']);
  const store = memoryStorage();
  assert.equal(saveFaultRecords(r, store), 'saved');
  assert(store.values.has(FAULT_RECORDS_KEY));
  assert.deepEqual(loadFaultRecords(store), { status: 'saved', records: r });
  for (const bad of [
    null,
    [],
    { best: {}, daily: 'x' },
    { best: { boss: { seconds: 1, solved: 1, clean: 0 } }, daily: [] },
    { best: { tech: { seconds: 0, solved: 1, clean: 0 } }, daily: [] },
    { best: { tech: { seconds: 5, solved: 1, clean: 2 } }, daily: [] },
    { best: {}, daily: ['2026-10-09:boss'] },
  ])
    assert.equal(validateFaultRecords(bad), null, JSON.stringify(bad));
  store.values.set(FAULT_RECORDS_KEY, '{');
  assert.equal(loadFaultRecords(store).status, 'invalid');
  assert.equal(loadFaultRecords(null).status, 'unavailable');
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.equal(loadFaultRecords(blocked).status, 'unavailable');
  assert.equal(saveFaultRecords(r, blocked), 'unavailable');
});
