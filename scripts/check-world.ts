import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSegment,
  traversable,
  findRoute,
  slideMove,
} from '../lib/world/navigation.ts';
import { insidePolygon, canWalk } from '../lib/world/geometry.ts';
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
test('撞到斜墙时沿墙滑行，不会穿墙，也不会卡死', () => {
  // A 45° corridor: holding only “right” used to stop dead at its wall.
  const corridor = [
    [
      [0, 40],
      [40, 0],
      [240, 200],
      [200, 240],
    ],
  ];
  let p = { x: 30, y: 40 };
  for (let i = 0; i < 120; i++) {
    p = slideMove(p, { x: 1.2, y: 0 }, corridor);
    assert.ok(traversable(p, corridor), `滑出了走廊 ${JSON.stringify(p)}`);
  }
  assert.ok(p.x > 100 && p.y > 60, `应沿斜墙前进，实际 ${JSON.stringify(p)}`);
  // Walking straight into a flat wall stays put instead of drifting sideways.
  const room = [
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
  ];
  let q = { x: 50, y: 50 };
  for (let i = 0; i < 200; i++) q = slideMove(q, { x: 0, y: -1.2 }, room);
  assert.ok(q.y >= 9 && Math.abs(q.x - 50) < 1e-6, JSON.stringify(q));
  // Holding D at the hub spawn now follows the isometric walkway.
  const hub = getScene('hub');
  let h = { x: 1065, y: 783 };
  for (let i = 0; i < 90; i++)
    h = slideMove(
      h,
      { x: (170 * 0.43) / 60, y: 0 },
      hub.walkable,
      hub.obstacles,
    );
  assert.ok(h.x - 1065 > 80, `栈道上按住 D 1.5 秒只走了 ${h.x - 1065}px`);
});
test('包围盒剔除后的可行走判定与逐个多边形判定一致', () => {
  for (const scene of SCENES)
    for (let i = 0; i < 400; i++) {
      const p = {
        x: (((i * 7919) % 1000) / 1000) * scene.width,
        y: (((i * 104729) % 997) / 997) * scene.height,
      };
      const naive =
        scene.walkable.some((a) => insidePolygon(p, a)) &&
        !(scene.obstacles ?? []).some((a) => insidePolygon(p, a));
      assert.equal(canWalk(p, scene.walkable, scene.obstacles), naive);
    }
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
