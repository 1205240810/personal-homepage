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

import { readFileSync } from 'node:fs';
import { joystickVector } from '../lib/world/joystick.ts';
test('触控摇杆：死区静止，斜向等速，推到边缘满速且旋钮不出圈', () => {
  assert.deepEqual(joystickVector(3, 2, 35).direction, { x: 0, y: 0 });
  assert.deepEqual(joystickVector(0, 0, 35).direction, { x: 0, y: 0 });
  const full = joystickVector(100, 0, 35);
  assert.equal(full.direction.x, 1);
  assert.equal(full.knob.x, 35);
  const diagonal = joystickVector(40, -40, 35).direction;
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9);
  assert.ok(diagonal.x > 0.7 && diagonal.y < -0.7, '应支持斜向');
  const half = joystickVector(0, 35 * 0.575, 35).direction;
  assert.ok(Math.abs(half.y - 0.5) < 1e-9, '力度随距离线性增加');
  const knob = joystickVector(-200, 90, 35).knob;
  assert.ok(Math.hypot(knob.x, knob.y) <= 35 + 1e-9);
  const source = readFileSync('components/world/world-shell.tsx', 'utf8');
  assert.ok(source.includes('<VirtualJoystick'), '移动端应使用模拟摇杆');
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
