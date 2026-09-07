import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SCENES } from '../lib/world/registry.ts';
import { canWalk, distance } from '../lib/world/geometry.ts';
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
  const tiled = JSON.parse(
    await readFile(`public/maps/${scene.id}.json`, 'utf8'),
  );
  assert.equal(tiled.orientation, 'orthogonal');
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
  for (const [id, spawn] of Object.entries(scene.spawnPoints))
    assert(canWalk(spawn, floor), `出生点不在地面: ${scene.id}/${id}`);
  // Flood the actual collision floor from the spawn. A nearby but isolated node must fail.
  const start = scene.spawnPoints.default,
    seen = new Set<string>(),
    queue = [start];
  const step = 8;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const p = queue[cursor];
    for (const [dx, dy] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const q = { x: p.x + dx, y: p.y + dy },
        key = `${q.x},${q.y}`;
      if (!seen.has(key) && canWalk(q, floor)) {
        seen.add(key);
        queue.push(q);
      }
    }
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
    assert(
      queue.some((p) => distance(p, n) < (n.radius ?? 90)),
      `节点无法接近: ${n.id}`,
    );
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
  `世界检查通过：${ids.size} 张地图、${nodeIds.size} 个可达节点、出生点、入口与文章引用有效`,
);
