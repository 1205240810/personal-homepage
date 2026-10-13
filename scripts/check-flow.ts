import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../lib/games/kit.ts';
import {
  FLOW_SIZES,
  adjacent,
  dailyFlow,
  emptyPaths,
  extendPath,
  flowStatus,
  generateFlow,
  hamiltonianPath,
  loadFlowRecords,
  mergeFlowRecord,
  saveFlowRecords,
  solutionPath,
  startPath,
  validateFlowRecords,
  type FlowPuzzle,
} from '../lib/games/flow.ts';

function solvedPaths(p: FlowPuzzle) {
  return p.pairs.map((_, c) => solutionPath(p, c));
}

void test('哈密顿路径：覆盖每格一次且相邻', () => {
  for (const size of FLOW_SIZES) {
    const path = hamiltonianPath(size, mulberry32(size));
    assert.equal(new Set(path).size, size * size);
    for (let i = 1; i < path.length; i++)
      assert.ok(adjacent(size, path[i - 1], path[i]));
  }
});

void test('5–9 各 40 个种子：参考解填满棋盘，端点不相邻，每条至少 3 格，结果确定', () => {
  for (const size of FLOW_SIZES)
    for (let seed = 1; seed <= 40; seed++) {
      const p = generateFlow(size, seed);
      assert.deepEqual(generateFlow(size, seed), p);
      assert.ok(
        p.pairs.length >= size - 1 && p.pairs.length <= size + 1,
        `${p.id} colours ${p.pairs.length}`,
      );
      const paths = solvedPaths(p);
      paths.forEach((path, c) => {
        assert.ok(path.length >= 3);
        assert.equal(path[path.length - 1], p.pairs[c][1]);
        assert.ok(!adjacent(size, p.pairs[c][0], p.pairs[c][1]));
      });
      assert.ok(flowStatus(p, paths).solved, p.id);
      const ends = p.pairs.flat();
      assert.equal(new Set(ends).size, ends.length);
    }
});

void test('画线：从端点开始、回退截断、穿过别人的线会剪断、不能踩别色端点', () => {
  // 5×5: colour 0 joins 0–4 along the top row; colour 1 joins 20–24; colour 2 joins 10–14.
  const p: FlowPuzzle = {
    id: 't',
    size: 5,
    pairs: [
      [0, 4],
      [20, 24],
      [10, 14],
    ],
    solution: [],
    routes: [],
  };
  let paths = emptyPaths(p);
  const s = startPath(p, paths, 0)!;
  assert.equal(s.colour, 0);
  paths = s.paths;
  for (const c of [1, 2, 3, 4]) paths = extendPath(p, paths, 0, c)!;
  assert.equal(flowStatus(p, paths).connected, 1);
  // A finished path does not grow further.
  assert.equal(extendPath(p, paths, 0, 9), null);
  // Backtracking truncates.
  assert.deepEqual(extendPath(p, paths, 0, 1)![0], [0, 1]);
  // Non-adjacent moves are refused.
  assert.equal(extendPath(p, [[0], [], []], 0, 2), null);
  // Restarting from the middle keeps the start.
  assert.deepEqual(startPath(p, paths, 2)!.paths[0], [0, 1, 2]);
  // Colour 1 climbs 20→15; 10 is colour 2's endpoint, so it is blocked.
  let q = startPath(p, paths, 20)!.paths;
  q = extendPath(p, q, 1, 15)!;
  assert.equal(extendPath(p, q, 1, 10), null);
  // Colour 2 goes 10→5→6→1: crossing colour 0 at 1 cuts it back to [0].
  q = startPath(p, q, 10)!.paths;
  for (const c of [5, 6]) q = extendPath(p, q, 2, c)!;
  const cut = extendPath(p, q, 2, 1)!;
  assert.deepEqual(cut[0], [0]);
  assert.deepEqual(cut[2], [10, 5, 6, 1]);
});

void test('判定：缺格不算完成；路径重叠不算', () => {
  const p = generateFlow(6, 9);
  const paths = solvedPaths(p);
  const partial = paths.map((x, i) => (i === 0 ? [] : x));
  const st = flowStatus(p, partial);
  assert.equal(st.solved, false);
  assert.equal(st.connected, p.pairs.length - 1);
  const dup = paths.map((x) => [...x]);
  dup[0] = [...dup[0], dup[1][1]];
  assert.equal(flowStatus(p, dup).solved, false);
});

void test('今日谜题：7×7，同一天相同，一年都可解', () => {
  const a = dailyFlow({ year: 2026, month: 10, day: 13 });
  assert.equal(a.size, 7);
  assert.deepEqual(a, dailyFlow({ year: 2026, month: 10, day: 13 }));
  for (let d = 0; d < 366; d++) {
    const dt = new Date(2026, 0, 1 + d);
    const p = dailyFlow({
      year: dt.getFullYear(),
      month: dt.getMonth() + 1,
      day: dt.getDate(),
    });
    assert.ok(flowStatus(p, solvedPaths(p)).solved);
  }
});

void test('本机记录：每个尺寸最短用时，今日记日期，拒绝坏数据', () => {
  let r = mergeFlowRecord({ best: {}, daily: [] }, 5, 40);
  r = mergeFlowRecord(r, 5, 55);
  r = mergeFlowRecord(r, 7, 90, '2026-10-13');
  assert.deepEqual(r, { best: { '5': 40, '7': 90 }, daily: ['2026-10-13'] });
  assert.equal(validateFlowRecords({ best: { '4': 3 }, daily: [] }), null);
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveFlowRecords(r, st);
  assert.deepEqual(loadFlowRecords(st), r);
});

void test('合法铺满不必与参考路线一致', () => {
  const routes = [
    [0, 4, 8, 12],
    [3, 2, 1, 5, 6, 7, 11, 10, 9, 13, 14, 15],
  ];
  const p: FlowPuzzle = {
    id: 'alternative',
    size: 4,
    pairs: [
      [0, 12],
      [3, 15],
    ],
    solution: Array.from({ length: 16 }, (_, cell) =>
      routes.findIndex((route) => route.includes(cell)),
    ),
    routes,
  };
  const other = [
    [0, 1, 2, 6, 5, 4, 8, 9, 10, 14, 13, 12],
    [3, 7, 11, 15],
  ];
  assert.notDeepEqual(other, p.routes);
  assert.ok(flowStatus(p, p.routes).solved);
  assert.ok(flowStatus(p, other).solved);
  assert.ok(
    flowStatus(
      p,
      other.map((route) => [...route].reverse()),
    ).solved,
  );
});
