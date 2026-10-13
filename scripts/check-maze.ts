import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALGORITHMS,
  DIRS,
  E,
  MAZE_SIZES,
  S,
  W,
  applyCarves,
  canMove,
  carveSteps,
  dailyMaze,
  generateMaze,
  loadMazeRecords,
  mergeMazeRecord,
  move,
  run,
  saveMazeRecords,
  solve,
  validateMazeRecords,
  type Algorithm,
  type Maze,
  type MazeSize,
} from '../lib/games/maze.ts';
import { mulberry32 } from '../lib/games/kit.ts';

function assertPerfect(m: Maze) {
  // Walls are symmetric, every cell reachable, edges = cells - 1 (a tree).
  let edges = 0;
  for (let i = 0; i < m.cells.length; i++) {
    if (canMove(m, i, E)) {
      edges++;
      assert.ok(canMove(m, i + 1, 8));
    }
    if (canMove(m, i, S)) {
      edges++;
      assert.ok(canMove(m, i + m.width, 1));
    }
    if (i % m.width === m.width - 1) assert.equal(canMove(m, i, E), false);
  }
  assert.equal(edges, m.cells.length - 1);
  for (let i = 0; i < m.cells.length; i++) assert.ok(solve(m, 0, i).length > 0);
}

void test('四种算法 × 三档尺寸 × 10 个种子：都是完美迷宫（连通且无环），结果确定', () => {
  for (const alg of Object.keys(ALGORITHMS) as Algorithm[])
    for (const size of Object.keys(MAZE_SIZES) as MazeSize[])
      for (let seed = 1; seed <= 10; seed++) {
        const g = generateMaze(alg, size, seed);
        assertPerfect(g.maze);
        assert.equal(g.steps.length, g.maze.cells.length - 1);
        assert.deepEqual(
          generateMaze(alg, size, seed).maze.cells,
          g.maze.cells,
        );
      }
});

void test('分步生成：前 k 步的局部迷宫墙数递增', () => {
  const steps = carveSteps('prim', 8, 8, mulberry32(4));
  const open = (k: number) =>
    applyCarves(8, 8, steps, k).cells.reduce(
      (a, c) => a + c.toString(2).split('1').length - 1,
      0,
    );
  assert.equal(open(0), 0);
  assert.equal(open(10), 20);
  assert.equal(open(steps.length), 2 * 63);
});

void test('移动、快跑到岔路、最短路', () => {
  const { maze } = generateMaze('backtracker', 'small', 7);
  const goal = maze.cells.length - 1;
  const path = solve(maze, 0, goal);
  assert.equal(path[0], 0);
  assert.equal(path[path.length - 1], goal);
  for (let k = 1; k < path.length; k++) {
    const d = DIRS.find((x) => move(maze, path[k - 1], x) === path[k]);
    assert.ok(d !== undefined, 'path steps are legal moves');
  }
  // Walls stop movement.
  const blocked = DIRS.find((d) => !canMove(maze, 0, d))!;
  assert.equal(move(maze, 0, blocked), 0);
  // Running stops at a cell that is not a plain corridor.
  const open = DIRS.find((d) => canMove(maze, 0, d))!;
  const end = run(maze, 0, open);
  assert.notEqual(end, 0);
  // A plain corridor cell has two openings; only the goal can stop a run there.
  if (end !== goal)
    assert.notEqual(DIRS.filter((d) => canMove(maze, end, d)).length, 2);
});

void test('今日迷宫：同一天相同，算法按日期轮换，一年都完美', () => {
  const a = dailyMaze({ year: 2026, month: 10, day: 13 });
  assert.deepEqual(
    a.maze.cells,
    dailyMaze({ year: 2026, month: 10, day: 13 }).maze.cells,
  );
  const algs = new Set<string>();
  for (let d = 0; d < 366; d += 3) {
    const dt = new Date(2026, 0, 1 + d);
    const m = dailyMaze({
      year: dt.getFullYear(),
      month: dt.getMonth() + 1,
      day: dt.getDate(),
    });
    algs.add(m.alg);
    assert.equal(m.steps.length, 255);
  }
  assert.equal(algs.size, 4);
});

void test('本机记录：每档最快、今日最快，拒绝坏数据', () => {
  let r = mergeMazeRecord({ best: {}, daily: {} }, 'small', 12.34);
  r = mergeMazeRecord(r, 'small', 15);
  r = mergeMazeRecord(r, 'medium', 40, '2026-10-13');
  r = mergeMazeRecord(r, 'medium', 35, '2026-10-13');
  assert.deepEqual(r, {
    best: { small: 12.3, medium: 35 },
    daily: { '2026-10-13': 35 },
  });
  assert.equal(validateMazeRecords({ best: { small: -1 }, daily: {} }), null);
  assert.equal(validateMazeRecords({ best: {}, daily: { bad: 3 } }), null);
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveMazeRecords(r, st);
  assert.deepEqual(loadMazeRecords(st), r);
});

void test('快跑在走廊中的终点停止，不能越过终点', () => {
  const maze = applyCarves(2, 2, [
    { a: 0, dir: E },
    { a: 1, dir: S },
    { a: 3, dir: W },
  ]);
  assert.equal(run(maze, 0, E), 3);
  assert.equal(run(maze, 1, S), 3);
});
