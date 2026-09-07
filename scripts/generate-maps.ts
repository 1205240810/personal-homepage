import { writeFile, mkdir } from 'node:fs/promises';
import { SCENES } from '../lib/world/registry.ts';
await mkdir('public/maps', { recursive: true });
for (const s of SCENES) {
  const objects = s.walkable.map((polygon, i) => ({
    id: i + 1,
    name: `floor-${i}`,
    type: 'floor',
    x: 0,
    y: 0,
    polygon: polygon.map(([x, y]) => ({ x, y })),
    visible: true,
    rotation: 0,
  }));
  const interactions = s.nodes.map((n, i) => ({
    id: 100 + i,
    name: n.id,
    type: n.action.type,
    x: n.x,
    y: n.y,
    width: 0,
    height: 0,
    point: true,
    rotation: 0,
    visible: true,
  }));
  const json = {
    version: '1.10',
    tiledversion: '1.11.2',
    type: 'map',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: Math.ceil(s.width / 32),
    height: Math.ceil(s.height / 32),
    tilewidth: 32,
    tileheight: Math.ceil(s.height / 32),
    infinite: false,
    nextlayerid: 4,
    nextobjectid: 500,
    tilesets: [],
    layers: [
      {
        id: 3,
        name: 'obstacles',
        type: 'objectgroup',
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects: (s.obstacles ?? []).map((polygon, i) => ({
          id: 300 + i,
          name: `obstacle-${i}`,
          type: 'obstacle',
          x: 0,
          y: 0,
          polygon: polygon.map(([x, y]) => ({ x, y })),
          visible: true,
          rotation: 0,
        })),
      },
      {
        id: 1,
        name: 'walkable',
        type: 'objectgroup',
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects,
      },
      {
        id: 2,
        name: 'interactions',
        type: 'objectgroup',
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects: interactions,
      },
    ],
  };
  await writeFile(`public/maps/${s.id}.json`, JSON.stringify(json, null, 2));
}
console.log('4 Tiled maps generated');
