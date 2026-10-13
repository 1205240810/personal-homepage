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
import fs from 'node:fs';
test('场景原画以 WebP 分发，单张不超过 800 KB，原始 PNG 仍保留', () => {
  for (const scene of SCENES) {
    assert.match(scene.art, /\.webp$/, `${scene.id} 应使用 WebP 原画`);
    const size = fs.statSync(`public${scene.art}`).size;
    assert.ok(size < 800_000, `${scene.art} 体积 ${size} 过大`);
    fs.statSync(`public${scene.art.replace(/\.webp$/, '.png')}`);
  }
  const portrait = fs.readFileSync('components/world/start-screen.tsx', 'utf8');
  assert.ok(
    !portrait.includes('mecha-avatar.png'),
    '46px 头像不应加载 1.6 MB 原图',
  );
  assert.ok(fs.statSync('public/art/mecha-avatar-192.webp').size < 40_000);
});
