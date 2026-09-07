import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSegment,
  traversable,
  findRoute,
} from '../lib/world/navigation.ts';
import {
  BASE_TILES,
  initialCircuit,
  circuitState,
  rotatePipe,
  shuffledSignals,
} from '../lib/world/puzzles.ts';
test('行走不能漏过狭缝或擦过家具顶点，路径必须绕行', () => {
  const floor = [
    [
      [0, 0],
      [120, 0],
      [120, 120],
      [0, 120],
    ],
  ];
  const furniture = [
    [
      [40, 50],
      [60, 40],
      [60, 60],
    ],
  ];
  assert.equal(traversable({ x: 31, y: 50 }, floor, furniture), false);
  assert.equal(
    clearSegment({ x: 31, y: 30 }, { x: 31, y: 70 }, floor, furniture),
    false,
  );
  assert.equal(
    clearSegment({ x: 30, y: 30 }, { x: 30, y: 70 }, floor, furniture),
    true,
  );
  const walls = [
    [
      [55, 0],
      [65, 0],
      [65, 85],
      [55, 85],
    ],
  ];
  const start = { x: 30, y: 30 },
    end = { x: 90, y: 30 },
    route = findRoute(start, end, floor, walls);
  assert(route && route.length > 1);
  let previous = start;
  for (const point of route) {
    assert(clearSegment(previous, point, floor, walls));
    previous = point;
  }
  assert.equal(
    findRoute(start, end, floor, [
      [
        [55, 0],
        [65, 0],
        [65, 120],
        [55, 120],
      ],
    ]),
    null,
  );
});
test('电路初始未解，旋转能解，断开的出口不算完成', () => {
  const initial = initialCircuit();
  assert.equal(circuitState(initial).solved, false);
  const solved = BASE_TILES;
  assert.equal(circuitState(solved).solved, true);
  for (let i = 0; i < 9; i++)
    assert(
      Array.from({ length: 4 }, (_, turns) =>
        rotatePipe(initial[i], turns),
      ).includes(solved[i]),
    );
  assert.equal(
    circuitState(solved.map((tile, i) => (i === 8 ? 5 : tile))).solved,
    false,
  );
  assert.deepEqual([...shuffledSignals()].sort(), [0, 0, 1, 1, 2, 2, 3, 3]);
});

import {
  INITIAL_EXPLORATION,
  turnValve,
  restoreExploration,
  collisionFor,
} from '../lib/world/exploration.ts';
import { getScene } from '../lib/world/registry.ts';
test('两个水阀共同改变桥面通路；已开启状态稳定，非法进度不会恢复捷径', () => {
  const hub = getScene('hub'),
    west = { x: 1170, y: 850 },
    east = { x: 1550, y: 850 };
  const before = collisionFor(hub, INITIAL_EXPLORATION);
  assert.equal(clearSegment(west, east, before.areas, before.obstacles), false);
  for (const valve of ['intake', 'outlet'] as const) {
    let s = { ...INITIAL_EXPLORATION };
    for (let i = 0; i < 3; i++) s = turnValve(s, valve);
    assert.equal(s.bridge, false, '只操作一侧不能完成机关');
  }
  let s = turnValve(INITIAL_EXPLORATION, 'outlet');
  s = turnValve(s, 'intake');
  assert.equal(s.bridge, true);
  const after = collisionFor(hub, s);
  assert.equal(clearSegment(west, east, after.areas, after.obstacles), true);
  assert.deepEqual(turnValve(s, 'outlet'), s);
  assert.equal(
    restoreExploration({ lift: true, bridge: false, intake: 99 }).lift,
    false,
  );
  assert.equal(restoreExploration({ lift: true, bridge: true }).lift, true);
});
test('场景家具与地图边界不可穿过，草地保持可达', () => {
  for (const [id, p] of [
    ['hub', { x: 215, y: 780 }],
    ['life', { x: 1750, y: 635 }],
    ['life', { x: 750, y: 935 }],
  ] as const) {
    const def = getScene(id);
    assert.equal(traversable(p, def.walkable, def.obstacles), false);
  }
  const def = getScene('hub');
  assert.equal(
    traversable({ x: 2440, y: 1100 }, def.walkable, def.obstacles),
    false,
  );
  assert(
    findRoute(
      def.spawnPoints.default,
      { x: 870, y: 1000 },
      def.walkable,
      def.obstacles,
    ),
  );
});
