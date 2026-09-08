import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SCENES } from '../lib/world/registry.ts';
import {
  traversable,
  findRoute,
  clearSegment,
} from '../lib/world/navigation.ts';
const catalog = JSON.parse(
  await readFile('lib/content/generated.json', 'utf8'),
);
const contents = new Set([
  'profile',
  'education',
  'honors',
  'experience',
  'graduate-log',
  ...catalog.posts.map((p: { id: string }) => p.id),
]);
const ids = new Set<string>();
const nodeIds = new Set<string>();
for (const scene of SCENES) {
  assert(!ids.has(scene.id), `重复场景 ID: ${scene.id}`);
  ids.add(scene.id);
  await access(`public${scene.art}`);
  for (const light of scene.lighting ?? []) {
    assert(
      [light.x, light.y, light.radius, light.color, light.strength].every(
        Number.isFinite,
      ) &&
        light.x >= 0 &&
        light.x <= scene.width &&
        light.y >= 0 &&
        light.y <= scene.height &&
        light.radius > 0 &&
        light.strength >= 0 &&
        light.strength <= 1,
      `无效场景灯光: ${scene.id}`,
    );
  }
  const layerIds = new Set<string>();
  for (const layer of scene.layers ?? []) {
    assert(!layerIds.has(layer.id), `重复图层 ID: ${scene.id}/${layer.id}`);
    layerIds.add(layer.id);
    await access(`public${layer.art}`);
    assert(
      [
        layer.x,
        layer.y,
        layer.width,
        layer.sourceWidth,
        layer.anchor.x,
        layer.anchor.y,
      ].every(Number.isFinite) &&
        layer.width > 0 &&
        layer.sourceWidth > 0,
      `无效图层位置: ${layer.id}`,
    );
    if (layer.outline)
      assert(
        layer.outline.length >= 3 &&
          layer.outline.flat().every(Number.isFinite),
        `无效图层轮廓: ${layer.id}`,
      );
    if (layer.nodeId)
      assert(
        scene.nodes.some((node) => node.id === layer.nodeId),
        `图层互动不存在: ${layer.id}`,
      );
  }
  const doorIds = new Set<string>();
  for (const door of scene.doors ?? []) {
    assert(!doorIds.has(door.nodeId), `重复门: ${door.nodeId}`);
    doorIds.add(door.nodeId);
    assert(
      scene.nodes.some((node) => node.id === door.nodeId),
      `门缺少互动: ${door.nodeId}`,
    );
    assert(
      [door.x, door.y, door.width, door.height].every(Number.isFinite) &&
        door.width > 0 &&
        door.height > 0,
      `门坐标无效: ${door.nodeId}`,
    );
  }
  const tiled = JSON.parse(
    await readFile(`public/maps/${scene.id}.json`, 'utf8'),
  );
  assert.equal(tiled.orientation, 'orthogonal');
  assert.equal(tiled.width, Math.ceil(scene.width / 32));
  assert.equal(tiled.height, Math.ceil(scene.height / 32));
  const floor = tiled.layers
    .find((l: { name: string }) => l.name === 'walkable')
    .objects.map(
      (o: { x: number; y: number; polygon: { x: number; y: number }[] }) =>
        o.polygon.map((p) => [o.x + p.x, o.y + p.y]),
    );
  assert.deepEqual(
    floor,
    scene.walkable,
    `Tiled 与注册表地面不一致: ${scene.id}，运行 npm run maps`,
  );
  const obstacles =
    tiled.layers
      .find((l: { name: string }) => l.name === 'obstacles')
      ?.objects.map(
        (o: { x: number; y: number; polygon: { x: number; y: number }[] }) =>
          o.polygon.map((p) => [o.x + p.x, o.y + p.y]),
      ) ?? [];
  assert.deepEqual(
    obstacles,
    scene.obstacles ?? [],
    `Tiled 障碍不一致: ${scene.id}`,
  );
  for (const polygon of [...floor, ...obstacles]) {
    assert(polygon.length >= 3, `地面/障碍缺少顶点: ${scene.id}`);
    assert(polygon.flat().every(Number.isFinite), `无效坐标: ${scene.id}`);
  }
  for (const [id, spawn] of Object.entries(scene.spawnPoints)) {
    assert(
      traversable(spawn, floor, obstacles),
      `出生点碰撞: ${scene.id}/${id}`,
    );
    assert(
      findRoute(scene.spawnPoints.default, spawn, floor, obstacles),
      `返回点未连通: ${scene.id}/${id}`,
    );
  }
  const objects = tiled.layers.find(
    (l: { name: string }) => l.name === 'interactions',
  ).objects;
  assert.equal(
    objects.length,
    scene.nodes.length,
    `节点数量不一致: ${scene.id}`,
  );
  for (const n of scene.nodes) {
    assert(!nodeIds.has(n.id), `重复互动 ID: ${n.id}`);
    nodeIds.add(n.id);
    const object = objects.find((o: { name: string }) => o.name === n.id);
    assert(object, `Tiled 缺少节点: ${n.id}`);
    assert.equal(object.x, n.x);
    assert.equal(object.y, n.y);
    assert(traversable(n, floor, obstacles), `节点站位碰撞: ${n.id}`);
    const route = findRoute(scene.spawnPoints.default, n, floor, obstacles);
    assert(route, `节点无法沿地面到达: ${n.id}`);
    let previous = scene.spawnPoints.default;
    for (const point of route) {
      assert(
        clearSegment(previous, point, floor, obstacles),
        `路线穿过障碍: ${n.id}`,
      );
      previous = point;
    }
    if (n.action.type === 'open-content')
      assert(contents.has(n.action.contentId), `无效内容节点: ${n.id}`);
    if (n.action.type === 'enter-scene') {
      const action = n.action,
        next = SCENES.find((s) => s.id === action.sceneId);
      assert(
        next?.spawnPoints[action.spawnId ?? 'default'],
        `无效场景入口: ${n.id}`,
      );
    }
  }
}
assert(
  catalog.preview ||
    catalog.posts.every((p: { status: string }) => p.status === 'published'),
  '正式构建含草稿',
);
console.log(
  `世界检查通过：${ids.size} 张地图、${nodeIds.size} 个可达节点、家具障碍、路径、出生点、入口与文章引用有效`,
);
