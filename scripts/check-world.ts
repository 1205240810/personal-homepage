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
import { createScenePrefetcher, sceneAssets } from '../lib/world/prefetch.ts';
test('门前预取：每个房间的原画和地图只请求一次，失败后允许重试', async () => {
  const urls: string[] = [];
  let fail = true,
    clock = 0;
  const prefetch = createScenePrefetcher(
    (url) => {
      urls.push(url);
      if (fail && url.endsWith('.json'))
        return Promise.reject(new Error('offline'));
      return Promise.resolve();
    },
    () => clock,
  );
  const room = getScene('life');
  prefetch(room);
  prefetch(room);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(urls, sceneAssets(room));
  fail = false;
  clock = 5_000;
  prefetch(room);
  assert.deepEqual(urls.slice(2), [`/maps/${room.id}.json`]);
  for (const scene of SCENES)
    for (const node of scene.nodes)
      if (node.action.type === 'enter-scene')
        assert.ok(
          SCENES.some(
            (s) => s.id === (node.action as { sceneId: string }).sceneId,
          ),
          `${node.id} 指向不存在的场景`,
        );
});
test('断网时逐帧接近舱门不会反复预取，冷却后仍可恢复', async () => {
  let clock = 0,
    calls = 0,
    offline = true;
  const prefetch = createScenePrefetcher(
    async () => {
      calls++;
      if (offline) throw new Error('offline');
    },
    () => clock,
  );
  const room = getScene('life');
  for (let frame = 0; frame < 60; frame++) {
    clock = (frame * 1_000) / 60;
    prefetch(room);
    await Promise.resolve();
  }
  assert.equal(calls, 2, '一秒内60帧只应尝试原画和地图各一次');
  clock = 10_000;
  offline = false;
  prefetch(room);
  await Promise.resolve();
  assert.equal(calls, 4, '网络恢复后继续预热');
  clock = 60_000;
  prefetch(room);
  assert.equal(calls, 4, '已成功的资源不重复预热');
});
test('HTTP 错误和响应体中断都会冷却后重试', async (t) => {
  let clock = 0,
    calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls <= 2) return new Response(null, { status: 503 });
    if (calls <= 4)
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('connection lost'));
          },
        }),
      );
    return new Response('complete');
  });
  const prefetch = createScenePrefetcher(undefined, () => clock),
    room = getScene('life'),
    settle = () => new Promise((resolve) => setImmediate(resolve));
  prefetch(room);
  await settle();
  clock = 1_000;
  prefetch(room);
  assert.equal(calls, 2);
  clock = 10_000;
  prefetch(room);
  await settle();
  assert.equal(calls, 4);
  clock = 20_000;
  prefetch(room);
  await settle();
  assert.equal(calls, 6);
  clock = 60_000;
  prefetch(room);
  assert.equal(calls, 6);
});
test('机甲通道连续，舱室都可原路返回，公开内容不被游戏进度锁定', () => {
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
    const parent = getScene(back.sceneId);
    const point = parent.spawnPoints[back.spawnId];
    assert(point);
    assert(traversable(point, parent.walkable, parent.obstacles));
    assert(
      scene.nodes.some(
        (n) =>
          n.action.type === 'enter-scene' &&
          n.action.sceneId === parent.id &&
          n.action.spawnId === back.spawnId,
      ),
    );
    assert(
      parent.nodes.some(
        (n) =>
          (n.action.type === 'enter-scene' && n.action.sceneId === scene.id) ||
          (scene.id === 'vault' && n.action.type === 'open-vault'),
      ),
    );
  }
  assert.equal(
    traversable({ x: 790, y: 410 }, hub.walkable, hub.obstacles),
    false,
    '人物不能走进背景机身',
  );
});

void test('试作间街机具有实体碰撞，可从舱门接近并保留所有旧节点的通路', () => {
  const room = getScene('graduate');
  const arcade = room.nodes.find((node) => node.id === 'arcade-terminal');
  assert(arcade && arcade.action.type === 'open-arcade');
  assert(room.fixtures?.some((fixture) => fixture.nodeId === arcade.id));
  assert.equal(
    traversable({ x: 285, y: 440 }, room.walkable, room.obstacles),
    false,
    '街机柜体不是可以穿过的贴图',
  );
  assert(traversable(arcade, room.walkable, room.obstacles));
  assert(
    findRoute(room.spawnPoints.default, arcade, room.walkable, room.obstacles),
    '舱门到街机操作位置的地面应连通',
  );
  for (const id of [
    'project-console',
    'circuit-console',
    'workshop-notes',
    'tiny-repairer',
    'graduate-exit',
  ]) {
    const node = room.nodes.find((item) => item.id === id);
    assert(node);
    assert(
      findRoute(arcade, node, room.walkable, room.obstacles),
      `街机应保留到旧节点 ${id} 的通路`,
    );
  }
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
