import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../lib/games/kit.ts';
import {
  EMPTY,
  FIRE,
  OIL,
  PLANT,
  SAND,
  SMOKE,
  WALL,
  WATER,
  countElements,
  createSand,
  decodeScene,
  encodeScene,
  loadSandSave,
  paint,
  saveSandSave,
  setParticle,
  stepSand,
  validateSandSave,
  type Sand,
} from '../lib/games/sand.ts';

const run = (s: Sand, n: number, seed = 1) => {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) stepSand(s, r);
};
const at = (s: Sand, x: number, y: number) => s.cells[y * s.width + x];
const r0 = mulberry32(9);

void test('沙子落到底，不会悬空；堆成斜坡', () => {
  const s = createSand(9, 10);
  setParticle(s, 4, 0, SAND, r0);
  run(s, 20);
  assert.equal(at(s, 4, 9), SAND);
  const p = createSand(21, 12);
  for (let i = 0; i < 30; i++) {
    setParticle(p, 10, 0, SAND, r0);
    run(p, 3, i);
  }
  run(p, 60);
  assert.equal(countElements(p)[SAND], 30);
  for (let x = 0; x < p.width; x++)
    for (let y = 0; y < p.height - 1; y++)
      if (at(p, x, y) === SAND)
        assert.notEqual(at(p, x, y + 1), EMPTY, `floating sand at ${x},${y}`);
  assert.ok(at(p, 9, 11) === SAND && at(p, 11, 11) === SAND);
});

void test('水会摊平；沙子沉到水底；油浮在水上', () => {
  const s = createSand(20, 8);
  paint(s, 10, 2, 2, WATER, r0, true);
  const water = countElements(s)[WATER];
  run(s, 200);
  assert.equal(countElements(s)[WATER], water);
  let top = s.height;
  for (let i = 0; i < s.cells.length; i++)
    if (s.cells[i] === WATER) top = Math.min(top, Math.floor(i / s.width));
  assert.ok(top >= s.height - 2, 'water spread flat');

  const m = createSand(5, 10);
  for (let y = 5; y < 10; y++)
    for (let x = 0; x < 5; x++) setParticle(m, x, y, WATER, r0);
  setParticle(m, 2, 0, SAND, r0);
  for (let x = 0; x < 5; x++) setParticle(m, x, 1, OIL, r0);
  run(m, 120);
  assert.equal(countElements(m)[SAND], 1);
  const bottom = [...Array(5)].map((_, x) => at(m, x, 9));
  assert.ok(bottom.includes(SAND), 'sand sank to the floor');
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 10; y++)
      if (at(m, x, y) === OIL) assert.ok(y <= 5, 'oil stays above water');
});

void test('火烧光植物后熄灭，墙不受影响；水浇灭火', () => {
  const s = createSand(20, 20);
  for (let x = 2; x < 18; x++) setParticle(s, x, 18, PLANT, r0);
  for (let x = 0; x < 20; x++) setParticle(s, x, 19, WALL, r0);
  setParticle(s, 2, 17, FIRE, r0);
  run(s, 600);
  const c = countElements(s);
  assert.equal(c[PLANT], 0);
  assert.equal(c[FIRE], 0);
  assert.equal(c[WALL], 20);

  const d = createSand(5, 5);
  setParticle(d, 2, 2, FIRE, r0);
  setParticle(d, 2, 3, WALL, r0);
  setParticle(d, 3, 2, WATER, r0);
  run(d, 1);
  assert.equal(countElements(d)[FIRE], 0);
  assert.ok(countElements(d)[SMOKE] >= 1);
});

void test('植物吸水长大；墙永远不动；画笔不覆盖已有颗粒', () => {
  const s = createSand(10, 10);
  for (let x = 0; x < 10; x++) setParticle(s, x, 9, WALL, r0);
  setParticle(s, 5, 8, PLANT, r0);
  for (let x = 0; x < 10; x++) if (x !== 5) setParticle(s, x, 8, WATER, r0);
  run(s, 400);
  assert.ok(countElements(s)[PLANT] > 1);
  assert.equal(countElements(s)[WALL], 10);
  const b = createSand(10, 10);
  setParticle(b, 5, 5, WALL, r0);
  paint(b, 5, 5, 0, SAND, r0);
  assert.equal(at(b, 5, 5), WALL);
  paint(b, 5, 5, 2, EMPTY, r0);
  assert.equal(countElements(b)[EMPTY], 100);
});

void test('场景存档：RLE 编码往返一致，坏数据被拒绝', () => {
  const s = createSand(30, 20);
  paint(s, 10, 10, 4, SAND, r0, true);
  paint(s, 20, 5, 3, WALL, r0, true);
  const rle = encodeScene(s);
  const back = decodeScene(rle, 30, 20)!;
  assert.deepEqual([...back.cells], [...s.cells]);
  assert.equal(decodeScene('5a', 30, 20), null);
  assert.equal(decodeScene('600a', 30, 20) !== null, true);
  assert.equal(decodeScene('600z', 30, 20), null);
  assert.equal(
    validateSandSave({ width: 30, height: 20, rle: 'x', savedAt: '' }),
    null,
  );
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  const save = { width: 30, height: 20, rle, savedAt: '2026-10-13' };
  assert.equal(saveSandSave(save, st), 'saved');
  assert.deepEqual(loadSandSave(st), save);
});

void test('性能：240×160 满屏混合颗粒 100 步 < 1.5 秒', () => {
  const s = createSand(240, 160);
  const r = mulberry32(3);
  for (let i = 0; i < s.cells.length; i++) {
    const v = r();
    s.cells[i] =
      v < 0.2
        ? SAND
        : v < 0.4
          ? WATER
          : v < 0.45
            ? OIL
            : v < 0.5
              ? PLANT
              : EMPTY;
  }
  const t = performance.now();
  run(s, 100);
  assert.ok(performance.now() - t < 1500, `${performance.now() - t}ms`);
});
