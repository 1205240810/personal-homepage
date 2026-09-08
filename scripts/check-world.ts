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

import { SCENES, getScene } from '../lib/world/registry.ts';
test('机甲通道连续，三个舱室都可原路返回，探索不锁定内容', () => {
  const hub = getScene('hub');
  for (const scene of SCENES) {
    for (const node of scene.nodes) {
      assert.equal(
        node.requires,
        undefined,
        '可阅读内容和舱门不能被小游戏进度锁定',
      );
      assert(
        findRoute(
          scene.spawnPoints.default,
          node,
          scene.walkable,
          scene.obstacles,
        ),
      );
    }
    if (scene.id === 'hub') continue;
    const back = scene.returnTo!;
    assert.equal(back.sceneId, 'hub');
    const point = hub.spawnPoints[back.spawnId];
    assert(point);
    assert(traversable(point, hub.walkable, hub.obstacles));
    assert(
      scene.nodes.some(
        (n) =>
          n.action.type === 'enter-scene' &&
          n.action.sceneId === 'hub' &&
          n.action.spawnId === back.spawnId,
      ),
    );
    assert(
      hub.nodes.some(
        (n) => n.action.type === 'enter-scene' && n.action.sceneId === scene.id,
      ),
    );
  }
  assert.equal(
    traversable({ x: 790, y: 410 }, hub.walkable, hub.obstacles),
    false,
    '人物不能走进背景机身',
  );
});

import { addressPlan } from '../lib/project-preview.ts';
test('OSPF 示例对应公开项目的四节点规划，参数变化后重新生成全部地址', () => {
  const base = addressPlan(1, 20)!;
  assert.deepEqual(
    base.map((n) => [n.id, n.ip]),
    [
      ['PC1', '10.10.1.20/24'],
      ['FRR1', '10.10.1.1/24'],
      ['FRR2', '10.10.2.1/24'],
      ['PC2', '10.10.2.20/24'],
    ],
  );
  assert(base[1].config.includes('ip address 10.255.1.1/30'));
  assert(base[2].config.includes('network 10.10.2.0/24 area 0'));
  assert(addressPlan(7, 42)![3].config.includes('default via 10.10.8.1'));
  for (const [lan, host] of [
    [0, 20],
    [251, 20],
    [1, 1],
    [1, 255],
    [1, 2.5],
  ])
    assert.equal(addressPlan(lan, host), null);
});
