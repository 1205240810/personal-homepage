import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HASHI_SIZES,
  buildEdges,
  countSolutions,
  cycleBridge,
  dailyHashi,
  edgeToward,
  generateHashi,
  hashiStatus,
  loadHashiRecords,
  mergeHashiRecord,
  saveHashiRecords,
  validateHashiRecords,
  type HashiSize,
} from '../lib/games/hashi.ts';

void test('可见岛对与交叉：十字形的横竖桥互相交叉', () => {
  const pts = [
    { x: 0, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
  ];
  const { edges, crossings } = buildEdges(3, pts);
  assert.equal(edges.length, 2);
  assert.deepEqual(crossings, [[1], [0]]);
});

void test('求解器：已知唯一解的小题与多解的小题', () => {
  // Two islands "2 2" side by side: exactly one solution (double bridge).
  const a = [
    { x: 0, y: 0, n: 2 },
    { x: 2, y: 0, n: 2 },
  ];
  const ea = buildEdges(3, a);
  assert.equal(countSolutions(a, ea.edges, ea.crossings).count, 1);
  // A 2×2 square of 2s has two solutions (two ways to pair doubles is not
  // connected; the ring of singles is the only connected one) -> unique.
  const sq = [
    { x: 0, y: 0, n: 2 },
    { x: 2, y: 0, n: 2 },
    { x: 0, y: 2, n: 2 },
    { x: 2, y: 2, n: 2 },
  ];
  const es = buildEdges(3, sq);
  assert.equal(countSolutions(sq, es.edges, es.crossings).count, 1);
  // Square of 3s: ring with two doubles in either orientation -> 2 solutions.
  const s3 = sq.map((p) => ({ ...p, n: 3 }));
  assert.equal(countSolutions(s3, es.edges, es.crossings).count, 2);
  // Disconnected pairs are rejected.
  const pairs = [
    { x: 0, y: 0, n: 1 },
    { x: 2, y: 0, n: 1 },
    { x: 0, y: 2, n: 1 },
    { x: 2, y: 2, n: 1 },
  ];
  const ep = buildEdges(3, pairs);
  assert.equal(countSolutions(pairs, ep.edges, ep.crossings).count, 0);
});

void test('三档各 25 个种子：解唯一、参考解满足全部规则、结果确定', () => {
  for (const size of Object.keys(HASHI_SIZES) as HashiSize[])
    for (let seed = 1; seed <= 25; seed++) {
      const p = generateHashi(size, seed);
      assert.deepEqual(generateHashi(size, seed), p);
      assert.ok(hashiStatus(p, p.solution).solved, p.id);
      const again = countSolutions(
        p.islands,
        p.edges,
        p.crossings,
        2,
        2_000_000,
      );
      assert.equal(again.count, 1, `${p.id} unique`);
      assert.ok(p.islands.every((i) => i.n >= 1 && i.n <= 8));
      assert.ok(p.islands.length >= Math.round(HASHI_SIZES[size] ** 2 * 0.16));
    }
});

void test('今日数桥：同一天相同，连续 60 天都唯一可解', () => {
  const a = dailyHashi({ year: 2026, month: 10, day: 13 });
  assert.deepEqual(a, dailyHashi({ year: 2026, month: 10, day: 13 }));
  assert.equal(a.id, 'daily-2026-10-13');
  for (let d = 0; d < 60; d++) {
    const dt = new Date(2026, 9, 1 + d);
    const p = dailyHashi({
      year: dt.getFullYear(),
      month: dt.getMonth() + 1,
      day: dt.getDate(),
    });
    assert.ok(hashiStatus(p, p.solution).solved);
  }
});

void test('操作：0→1→2→0 循环、不能交叉、按方向找桥、超数提示', () => {
  const p = generateHashi('small', 4);
  const zero = p.edges.map(() => 0);
  let b = cycleBridge(p, zero, 0)!;
  assert.equal(b[0], 1);
  b = cycleBridge(p, b, 0)!;
  assert.equal(b[0], 2);
  assert.equal(cycleBridge(p, b, 0)![0], 0);
  const cross = p.crossings.findIndex((c) => c.length > 0);
  if (cross >= 0) {
    const on = cycleBridge(p, zero, cross)!;
    assert.equal(cycleBridge(p, on, p.crossings[cross][0]), null);
  }
  const e = p.edges[0];
  const me = p.islands[e.a],
    o = p.islands[e.b];
  assert.equal(
    edgeToward(p, e.a, Math.sign(o.x - me.x), Math.sign(o.y - me.y)),
    0,
  );
  const ones = p.islands.findIndex((i) => i.n === 1);
  if (ones >= 0) {
    const mine = p.edges.findIndex((x) => x.a === ones || x.b === ones);
    const two = cycleBridge(p, cycleBridge(p, zero, mine)!, mine)!;
    assert.ok(hashiStatus(p, two).over.includes(ones));
  }
  assert.equal(hashiStatus(p, zero).solved, false);
});

void test('本机记录：每档最快、今日记日期、拒绝坏数据', () => {
  let r = mergeHashiRecord({ best: {}, daily: [] }, 'small', 50);
  r = mergeHashiRecord(r, 'small', 80);
  r = mergeHashiRecord(r, 'medium', 120, '2026-10-13');
  assert.deepEqual(r, {
    best: { small: 50, medium: 120 },
    daily: ['2026-10-13'],
  });
  assert.equal(validateHashiRecords({ best: { huge: 1 }, daily: [] }), null);
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveHashiRecords(r, st);
  assert.deepEqual(loadHashiRecords(st), r);
});
