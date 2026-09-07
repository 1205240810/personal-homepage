import { INTERIOR_LAYERS } from './interior-layers.ts';
import { COURTYARD_LAYERS } from './courtyard-layers.ts';
import { ROOM_DEFINITIONS } from './room-definitions.ts';
import type { SceneDefinition, WorldAction } from './types';
import type { SceneryLayer } from './scenery';
const rect = (x: number, y: number, w: number, h: number) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const prop = (
  id: string,
  source: string,
  x: number,
  y: number,
  width: number,
  nodeId?: string,
): SceneryLayer => ({
  ...COURTYARD_LAYERS.find((l) => l.id === source)!,
  id,
  x,
  y,
  width,
  nodeId,
});
const trees = (points: number[][]) =>
  points.map(([x, y, w], i) => prop(`river-tree-${i}`, 'tree-0', x, y, w));
const shrubs = (points: number[][]) =>
  points.map(([x, y, w], i) => prop(`river-shrub-${i}`, 'shrub-0', x, y, w));
const west = [
  [110, 210],
  [330, 115],
  [740, 100],
  [1040, 195],
  [1180, 345],
  [1210, 620],
  [1260, 790],
  [1260, 950],
  [1190, 1180],
  [960, 1350],
  [400, 1380],
  [140, 1220],
  [80, 960],
  [60, 600],
];
const east = [
  [1460, 390],
  [1670, 230],
  [2030, 220],
  [2290, 365],
  [2370, 350],
  [2370, 1390],
  [1920, 1370],
  [1590, 1190],
  [1460, 960],
  [1460, 790],
  [1395, 600],
];
const hill = [
  [20, 808],
  [165, 808],
  [160, 650],
  [490, 400],
  [660, 225],
  [1010, 160],
  [1230, 260],
  [1590, 180],
  [2060, 220],
  [2320, 480],
  [2360, 1120],
  [2110, 1360],
  [1520, 1340],
  [1330, 1160],
  [1130, 1080],
  [960, 1210],
  [610, 1220],
  [350, 1360],
  [90, 1250],
  [120, 1040],
  [165, 910],
  [20, 910],
];
const hubTrees = [
  [240, 320, 220],
  [410, 270, 185],
  [970, 340, 235],
  [1100, 470, 210],
  [205, 750, 240],
  [270, 1240, 235],
  [750, 1320, 205],
  [1080, 1150, 240],
  [1650, 550, 225],
  [1800, 400, 220],
  [2160, 520, 220],
  [2330, 1290, 240],
  [1780, 1200, 240],
  [2000, 1280, 185],
];
const hillTrees = [
  [130, 580, 195],
  [540, 540, 210],
  [720, 390, 230],
  [1100, 360, 190],
  [1770, 320, 210],
  [2060, 470, 240],
  [2220, 1100, 260],
  [1850, 1270, 225],
  [1600, 1190, 230],
  [920, 1110, 240],
  [620, 1140, 215],
  [280, 1210, 220],
];
const trunks = (points: number[][]) =>
  points.map(([x, y]) => rect(x - 12, y - 15, 24, 24));
const hub: SceneDefinition = {
  id: 'hub',
  title: '河湾书屋',
  en: 'THE RIVERBEND',
  description: '沿着水声，走到下一页。',
  art: '/art/river-materials.png',
  width: 2400,
  height: 1440,
  outdoor: true,
  layoutVersion: 10,
  overview: { x: 28, y: 55 },
  terrain: {
    islands: [west, east],
    paths: [
      {
        points: [
          [430, 1120],
          [510, 970],
          [690, 875],
          [790, 780],
          [780, 640],
        ],
        width: 100,
      },
      {
        points: [
          [690, 875],
          [960, 870],
          [1150, 860],
          [1560, 860],
          [1770, 970],
          [2020, 1030],
          [2350, 930],
        ],
        width: 108,
      },
      {
        points: [
          [1070, 865],
          [1100, 700],
          [1100, 625],
        ],
        width: 80,
      },
      {
        points: [
          [1080, 875],
          [1080, 975],
          [1090, 1060],
        ],
        width: 70,
      },
      {
        points: [
          [510, 970],
          [405, 850],
          [365, 835],
        ],
        width: 75,
      },
      {
        points: [
          [1810, 990],
          [1910, 770],
          [1950, 665],
        ],
        width: 78,
      },
    ],
    bridges: [{ x: 1220, y: 829, width: 285, height: 62, gated: true }],
  },
  spawnPoints: {
    default: { x: 470, y: 1080 },
    blog: { x: 780, y: 668 },
    'bridge-return': { x: 2280, y: 930 },
    'lift-return': { x: 475, y: 1010 },
  },
  walkable: [west, east, rect(1210, 829, 310, 62)],
  obstacles: [
    rect(496, 365, 434, 247),
    rect(188, 707, 249, 115),
    rect(1920, 580, 144, 62),
    rect(1110, 621, 47, 27),
    rect(1110, 1031, 47, 27),
    ...trunks(hubTrees),
  ],
  layers: [
    prop('library', 'library', 780, 620, 455, 'blog-door'),
    prop('residence', 'residence', 380, 810, 265, 'profile-badge'),
    prop('reading-bench', 'reading-bench', 1990, 635, 156, 'bench-notes'),
    ...trees(hubTrees),
    ...shrubs([
      [550, 630, 145],
      [900, 640, 135],
      [310, 850, 135],
      [1700, 1130, 150],
      [2050, 685, 120],
      [1050, 500, 130],
    ]),
  ],
  doors: [
    { nodeId: 'blog-door', x: 780, y: 620, width: 56, height: 103 },
    { nodeId: 'profile-badge', x: 380, y: 810, width: 41, height: 81 },
  ],
  nodes: [
    {
      id: 'blog-door',
      x: 780,
      y: 645,
      label: '推开书屋的门',
      hint: '旧文章与新记录，都在书架上。',
      radius: 50,
      category: 'blog',
      action: { type: 'enter-scene', sceneId: 'undergraduate' },
    },
    {
      id: 'profile-badge',
      x: 380,
      y: 835,
      label: '门边的档案袋',
      hint: '简介、教育与荣誉，装在同一份档案里。',
      radius: 46,
      category: 'profile',
      action: { type: 'open-content', contentId: 'profile' },
    },
    {
      id: 'sluice-intake',
      x: 1090,
      y: 650,
      label: '转动上游进水阀',
      hint: '每次转动增加一档进水；第三次回到关闭。',
      radius: 63,
      category: 'play',
      action: { type: 'adjust-sluice', valve: 'intake' },
    },
    {
      id: 'sluice-outlet',
      x: 1090,
      y: 1060,
      label: '转动旁路泄水阀',
      hint: '让浮桥上的水线对准石岸的金线。',
      radius: 63,
      category: 'play',
      action: { type: 'adjust-sluice', valve: 'outlet' },
    },
    {
      id: 'sluice-note',
      x: 1160,
      y: 770,
      label: '浮桥旁的旧铭牌',
      hint: '水面停在金线，桥面才能与两岸齐平。',
      radius: 46,
      action: {
        type: 'inspect',
        text: '铭牌：上游阀进水，旁路阀泄水。把水位留在金色刻度，浮桥就会扣住两岸。',
      },
    },
    {
      id: 'river-crossing',
      x: 2325,
      y: 930,
      label: '沿河前往水车坡地',
      hint: '桥那头传来水车的声音。',
      radius: 68,
      requires: 'bridge',
      automatic: true,
      category: 'exit',
      action: { type: 'enter-scene', sceneId: 'life' },
    },
    {
      id: 'hub-lift',
      x: 475,
      y: 940,
      label: '河岸索道台',
      hint: '工坊的传动装置接通后，可以从这里往返。',
      radius: 60,
      category: 'exit',
      action: { type: 'use-lift' },
    },
    {
      id: 'bench-notes',
      x: 1900,
      y: 690,
      label: '长椅上的记录册',
      hint: '在河边翻一页代码之外的生活。',
      radius: 55,
      requires: 'bridge',
      action: { type: 'open-collection', chapter: 'life' },
    },
    {
      id: 'mechanical-cat',
      x: 590,
      y: 1180,
      label: '树影里的一对耳朵',
      hint: '有一位住客，已经在这里晒了很久的太阳。',
      radius: 46,
      hidden: true,
      action: { type: 'discover', discovery: 'maintenance-cat' },
    },
  ],
};
const life: SceneDefinition = {
  id: 'life',
  title: '水车坡地',
  en: 'THE MILL PATH',
  description: '让停下来的水车，重新转动。',
  art: '/art/river-materials.png',
  width: 2400,
  height: 1440,
  outdoor: true,
  layoutVersion: 10,
  overview: { x: 72, y: 44 },
  terrain: {
    islands: [hill],
    paths: [
      {
        points: [
          [90, 850],
          [400, 850],
          [650, 775],
          [870, 710],
          [1110, 650],
          [1450, 665],
          [1730, 725],
        ],
        width: 104,
      },
      {
        points: [
          [400, 850],
          [560, 990],
          [970, 970],
          [1120, 865],
        ],
        width: 88,
      },
      {
        points: [
          [1730, 725],
          [1950, 875],
          [2080, 1000],
        ],
        width: 90,
      },
      {
        points: [
          [1110, 650],
          [1130, 470],
        ],
        width: 80,
      },
    ],
    bridges: [],
  },
  spawnPoints: {
    default: { x: 150, y: 850 },
    workshop: { x: 1470, y: 700 },
    lift: { x: 1090, y: 940 },
  },
  walkable: [hill],
  obstacles: [
    rect(1250, 518, 548, 141),
    rect(940, 610, 88, 88),
    rect(943, 140, 72, 480),
    rect(709, 925, 82, 28),
    rect(2020, 990, 150, 55),
    ...trunks(hillTrees),
  ],
  layers: [
    prop('workshop', 'workshop', 1470, 650, 560, 'projects-door'),
    prop(
      'viewpoint-bench',
      'reading-bench',
      2110,
      1040,
      154,
      'viewpoint-notes',
    ),
    ...trees(hillTrees),
    ...shrubs([
      [1220, 683, 140],
      [1700, 665, 160],
      [1870, 1080, 150],
      [1050, 395, 140],
      [370, 750, 155],
    ]),
  ],
  doors: [{ nodeId: 'projects-door', x: 1470, y: 650, width: 55, height: 102 }],
  nodes: [
    {
      id: 'river-return',
      x: 60,
      y: 850,
      label: '沿河回到书屋',
      hint: '浮桥通向来时的河湾。',
      radius: 65,
      automatic: true,
      category: 'exit',
      action: { type: 'enter-scene', sceneId: 'hub', spawnId: 'bridge-return' },
    },
    {
      id: 'projects-door',
      x: 1470,
      y: 675,
      label: '走进水车工坊',
      hint: '项目与传动装置的控制板，都在工作台上。',
      radius: 50,
      category: 'projects',
      action: { type: 'enter-scene', sceneId: 'graduate' },
    },
    {
      id: 'mill-wheel',
      x: 1080,
      y: 710,
      label: '停住的传动轮',
      hint: '水流还在，控制板上的回路却断开了。',
      radius: 56,
      action: {
        type: 'inspect',
        text: '水车旁的便笺：工坊右侧工作台上有控制板。接通回路，水车和河岸索道台就能一起运转。',
      },
    },
    {
      id: 'mill-lift',
      x: 1090,
      y: 890,
      label: '乘索道回到河湾',
      hint: '修复工坊的回路，开启这条返回捷径。',
      radius: 60,
      category: 'exit',
      action: { type: 'use-lift' },
    },
    {
      id: 'viewpoint-notes',
      x: 2020,
      y: 1090,
      label: '远处的河湾',
      hint: '旅途可以在这里停一会。',
      radius: 60,
      action: { type: 'open-collection', chapter: 'life' },
    },
    {
      id: 'memory-table',
      x: 750,
      y: 980,
      label: '石桌上的旅行卡片',
      hint: '八张卡片，四对沿途收集的图案。',
      radius: 50,
      category: 'play',
      action: { type: 'open-game', game: 'memory' },
    },
    {
      id: 'mecha-eye',
      x: 1120,
      y: 430,
      label: '草丛里的旧零件',
      hint: '一枚还会眨眼的机甲镜头。',
      radius: 42,
      hidden: true,
      action: { type: 'discover', discovery: 'sleepy-eye' },
    },
  ],
};
// Rooms retain independent foreground furniture, but use the same human scale as the outdoors.
const rooms = ROOM_DEFINITIONS.map((source): SceneDefinition => {
  const scale = 0.42;
  const points = (p: number[][][]) =>
    p.map((poly) => poly.map(([x, y]) => [x * scale, y * scale]));
  const id = source.id;
  return {
    ...source,
    width: 1536 * scale,
    height: 1024 * scale,
    layoutVersion: 10,
    title: id === 'graduate' ? '工坊内室' : '书屋内室',
    layers: INTERIOR_LAYERS[id].map((l) => ({
      ...l,
      nodeId: l.nodeId === 'armor-lever' ? 'lab-circuit' : l.nodeId,
      x: l.x * scale,
      y: l.y * scale,
      width: l.width * scale,
      depth: l.depth === undefined ? undefined : l.depth * scale,
    })),
    spawnPoints: Object.fromEntries(
      Object.entries(source.spawnPoints).map(([k, p]) => [
        k,
        { x: p.x * scale, y: p.y * scale },
      ]),
    ),
    walkable: points(source.walkable),
    obstacles: points(source.obstacles ?? []),
    nodes: source.nodes
      .filter((n) => !['armor-lever', 'mecha-eye'].includes(n.id))
      .map((n) => ({
        ...n,
        x: (n.id === 'lab-circuit' ? 365 : n.x) * scale,
        y: (n.id === 'lab-circuit' ? 585 : n.y) * scale,
        radius: Math.max(34, (n.radius ?? 50) * scale),
        action:
          n.action.type === 'enter-scene'
            ? {
                type: 'enter-scene',
                sceneId: id === 'graduate' ? 'life' : 'hub',
                spawnId: id === 'graduate' ? 'workshop' : 'blog',
              }
            : n.action,
        label:
          n.action.type === 'enter-scene'
            ? '推门回到河边'
            : n.id === 'lab-circuit'
              ? '水车的控制板'
              : n.label,
        hint:
          n.action.type === 'enter-scene'
            ? '沿着门前的小路继续走。'
            : n.id === 'lab-circuit'
              ? '接通水车与升降台的动力回路。'
              : n.hint,
      })),
  };
});
export const SCENES: SceneDefinition[] = [hub, life, ...rooms];
export const getScene = (id: string) => SCENES.find((s) => s.id === id) ?? hub;
export const CHAPTERS = [
  {
    id: 'undergraduate',
    title: '本科',
    subtitle: '2019–2023',
    scene: 'undergraduate',
  },
  {
    id: 'graduate',
    title: '研究生',
    subtitle: '2025 至今',
    scene: 'undergraduate',
  },
  { id: 'life', title: '杂谈', subtitle: '沿途拾录', scene: 'undergraduate' },
] as const;
export const DISTRICTS: {
  id: string;
  title: string;
  subtitle: string;
  nodeId: string;
  action: WorldAction;
  sceneId?: string;
  position: { x: number; y: number };
}[] = [
  {
    id: 'blog',
    title: '河湾书屋',
    subtitle: '本科、研习与生活记录',
    nodeId: 'blog-door',
    sceneId: 'undergraduate',
    action: { type: 'open-collection' },
    position: { x: 25, y: 40 },
  },
  {
    id: 'profile',
    title: '门边的档案',
    subtitle: '简介、教育、经历与荣誉',
    nodeId: 'profile-badge',
    action: { type: 'open-content', contentId: 'profile' },
    position: { x: 16, y: 64 },
  },
  {
    id: 'projects',
    title: '水车工坊',
    subtitle: 'GitHub 公开项目',
    nodeId: 'projects-door',
    sceneId: 'graduate',
    action: { type: 'open-projects' },
    position: { x: 70, y: 39 },
  },
  {
    id: 'play',
    title: '沿途的小发现',
    subtitle: '水闸、回路与旅行卡片',
    nodeId: 'sluice-intake',
    action: { type: 'open-game', game: 'memory' },
    position: { x: 47, y: 56 },
  },
];
