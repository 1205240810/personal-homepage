import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HANDCRAFTED,
  SIZES,
  dailyLaser,
  dims,
  generateLevel,
  hint,
  loadLaserRecords,
  mergeLaserRecord,
  placementsAllowed,
  saveLaserRecords,
  solutionPlacements,
  starsFor,
  trace,
  validateLaserRecords,
  type Level,
  type Placements,
  type Size,
} from '../lib/games/laser.ts';

function assertGood(l: Level) {
  const sol = solutionPlacements(l);
  assert.ok(trace(l, sol).solved, `${l.id} solution solves`);
  assert.equal(trace(l, new Map()).solved, false, `${l.id} not solved empty`);
  assert.equal(sol.size, l.par);
  assert.ok(placementsAllowed(l, sol).ok, `${l.id} inventory covers solution`);
  const { width, height } = dims(l);
  assert.ok(
    l.grid.every((r) => r.length === width) && l.grid.length === height,
  );
  assert.ok(l.grid.join('').includes('T'));
}

void test('光路：镜子 / 与 \\ 的四个方向、分光镜分两路、墙挡光、循环不死', () => {
  const base = (grid: string[]): Level => ({
    id: 'x',
    name: '',
    grid,
    mirrors: 9,
    splitters: 9,
    par: 0,
    solution: grid,
  });
  const one = (grid: string[], placed: Placements = new Map()) =>
    trace(base(grid), placed);
  assert.ok(one(['>./', '...', '..T'].map((r) => r)).lit.size >= 1);
  // '/' sends a rightward beam up.
  assert.ok(one(['..T', '>./']).solved);
  // '\' sends a rightward beam down.
  assert.ok(one(['>.\\', '..T']).solved);
  // Splitter: straight and turned.
  assert.ok(one(['.T.', '>aT']).solved);
  // Wall stops light.
  assert.equal(one(['>#T']).solved, false);
  // A closed mirror loop terminates.
  const loop = one(['/..\\', '....', '\\../', '>...']);
  assert.ok(loop.segments.length < 50);
});

void test('手工关卡：参考解能解、空盘不能解、道具数够用', () => {
  assert.equal(HANDCRAFTED.length, 6);
  for (const l of HANDCRAFTED) assertGood(l);
  assert.deepEqual(
    HANDCRAFTED.map((l) => l.par),
    [1, 2, 1, 3, 2, 3],
  );
});

void test('随机关卡：三种尺寸各 60 个种子都可解，参考解每块都必要', () => {
  for (const size of Object.keys(SIZES) as Size[])
    for (let seed = 1; seed <= 60; seed++) {
      const l = generateLevel(size, seed);
      assertGood(l);
      const sol = solutionPlacements(l);
      for (const [i] of sol) {
        const without = new Map(sol);
        without.delete(i);
        assert.equal(
          trace(l, without).solved,
          false,
          `${l.id} piece ${i} needed`,
        );
      }
      assert.deepEqual(generateLevel(size, seed), l, 'deterministic');
    }
});

void test('今日关卡：同一天相同，一年都可解', () => {
  const a = dailyLaser({ year: 2026, month: 10, day: 13 });
  assert.deepEqual(a, dailyLaser({ year: 2026, month: 10, day: 13 }));
  assert.equal(a.id, 'daily-2026-10-13');
  for (let d = 0; d < 366; d++) {
    const dt = new Date(2026, 0, 1 + d);
    assertGood(
      dailyLaser({
        year: dt.getFullYear(),
        month: dt.getMonth() + 1,
        day: dt.getDate(),
      }),
    );
  }
});

void test('道具上限、提示、星级', () => {
  const l = HANDCRAFTED[1];
  const too: Placements = new Map([
    [1, { kind: 'mirror', ori: 0 }],
    [2, { kind: 'mirror', ori: 0 }],
    [6, { kind: 'mirror', ori: 0 }],
  ]);
  assert.deepEqual(placementsAllowed(l, too), {
    ok: false,
    reason: '镜子不够了',
  });
  assert.equal(
    placementsAllowed(l, new Map([[3, { kind: 'mirror', ori: 0 }]])).ok,
    false,
  );
  const h = hint(l, new Map());
  assert.ok(h && solutionPlacements(l).get(h.index));
  assert.equal(hint(l, solutionPlacements(l)), null);
  assert.equal(starsFor(l, 2, 0), 3);
  assert.equal(starsFor(l, 3, 0), 2);
  assert.equal(starsFor(l, 2, 1), 2);
  assert.equal(starsFor(l, 4, 2), 1);
});

void test('本机记录：星级取最高，今日记日期，拒绝坏数据', () => {
  let r = mergeLaserRecord({ stars: {}, daily: [] }, 'h1', 2);
  r = mergeLaserRecord(r, 'h1', 1);
  r = mergeLaserRecord(r, 'daily-2026-10-13', 3);
  r = mergeLaserRecord(r, 'bogus', 3);
  assert.deepEqual(r, { stars: { h1: 2 }, daily: ['2026-10-13'] });
  assert.equal(validateLaserRecords({ stars: { h1: 4 }, daily: [] }), null);
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveLaserRecords(r, st);
  assert.deepEqual(loadLaserRecords(st), r);
});
