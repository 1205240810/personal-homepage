import type { SceneDefinition, WorldAction } from './types';
const floor = (width: number, y: number) => [
  [
    [38, y - 18],
    [width - 38, y - 18],
    [width - 38, y + 18],
    [38, y + 18],
  ],
];
const hubY = 870,
  roomY = 535;
const room = (
  id: string,
  title: string,
  en: string,
  frame: number,
  returnSpawn: string,
  nodes: SceneDefinition['nodes'],
): SceneDefinition => ({
  id,
  title,
  en,
  description: '沿着维修通道，翻开这里的记录。',
  art: '/art/mecha-cabins.png',
  frame,
  width: 1600,
  height: 600,
  groundY: [535, 517, 508][frame],
  playerScale: 0.78,
  layoutVersion: 20,
  returnTo: { sceneId: 'hub', spawnId: returnSpawn },
  overview: { x: 20 + frame * 30, y: 50 },
  spawnPoints: { default: { x: 285, y: [535, 517, 508][frame] } },
  walkable: floor(1600, [535, 517, 508][frame]),
  nodes: [
    {
      id: `${id}-exit`,
      x: 155,
      y: roomY,
      label: '回到维修通道',
      hint: '回到刚才的舱门外。',
      category: 'exit' as const,
      radius: 64,
      action: {
        type: 'enter-scene' as const,
        sceneId: 'hub',
        spawnId: returnSpawn,
      },
    },
    ...nodes,
  ].map((n) => ({ ...n, y: [535, 517, 508][frame] })),
});
export const SCENES: SceneDefinition[] = [
  {
    id: 'hub',
    title: '沉睡机甲 · 维修通道',
    en: 'THE SLEEPING ARCHIVE',
    description: '从驾驶舱，到机身右侧的检修工坊。',
    art: '/art/mecha-section.png',
    width: 1800,
    height: 1200,
    groundY: hubY,
    playerScale: 0.48,
    layoutVersion: 20,
    overview: { x: 50, y: 75 },
    spawnPoints: {
      default: { x: 420, y: hubY },
      cockpit: { x: 295, y: hubY },
      archive: { x: 950, y: hubY },
      workshop: { x: 1645, y: hubY },
    },
    walkable: floor(1800, hubY),
    nodes: [
      {
        id: 'cockpit-door',
        x: 190,
        y: hubY,
        label: '驾驶舱',
        hint: '工牌、教育经历与荣誉。',
        radius: 65,
        category: 'profile',
        action: { type: 'enter-scene', sceneId: 'life' },
      },
      {
        id: 'archive-door',
        x: 850,
        y: hubY,
        label: '胸腔档案库',
        hint: '算法、工程与生活里的记录。',
        radius: 65,
        category: 'blog',
        action: { type: 'enter-scene', sceneId: 'undergraduate' },
      },
      {
        id: 'workshop-door',
        x: 1555,
        y: hubY,
        label: '检修工坊',
        hint: '项目，以及可以亲手接通的小回路。',
        radius: 65,
        category: 'projects',
        action: { type: 'enter-scene', sceneId: 'graduate' },
      },
      {
        id: 'hull-record',
        x: 1730,
        y: hubY,
        label: '机身铭牌',
        hint: '一行刻在旧装甲上的字。',
        radius: 54,
        hidden: true,
        action: {
          type: 'inspect',
          text: '「拆开，是为了理解它如何运转。」这台机甲的故事还会继续。',
        },
      },
    ],
  },
  room('life', '驾驶舱', 'THE COCKPIT', 0, 'cockpit', [
    {
      id: 'profile-badge',
      x: 1400,
      y: roomY,
      label: '驾驶员档案',
      hint: '简介、教育、经历与荣誉，收在同一份档案里。',
      category: 'profile',
      action: { type: 'open-content', contentId: 'profile' },
    },
    {
      id: 'cockpit-log',
      x: 790,
      y: roomY,
      label: '航行日志',
      hint: '代码之外的生活记录。',
      category: 'blog',
      action: { type: 'open-collection', chapter: 'life' },
    },
    {
      id: 'sleeping-signal',
      x: 920,
      y: roomY,
      label: '旧通讯器',
      hint: '试着向沉睡的机甲问一声好。',
      hidden: true,
      action: { type: 'discover', discovery: 'sleepy-eye' },
    },
  ]),
  room('undergraduate', '胸腔档案库', 'THE MEMORY CORE', 1, 'archive', [
    {
      id: 'all-articles',
      x: 770,
      y: roomY,
      label: '档案终端',
      hint: '所有文章与笔记，按栏目整理。',
      category: 'blog',
      action: { type: 'open-collection' },
    },
    {
      id: 'competition-log',
      x: 1360,
      y: roomY,
      label: '比赛记录册',
      hint: 'ICPC 2022 合肥赛区 · SZTU_AtDawn 队总结。',
      category: 'blog',
      action: { type: 'open-content', contentId: 'cnblogs-16913984' },
    },
  ]),
  room('graduate', '检修工坊', 'THE ENGINEERING BAY', 2, 'workshop', [
    {
      id: 'project-console',
      x: 700,
      y: roomY,
      label: '项目工作台',
      hint: '打开 GitHub 作品与在线演示。',
      category: 'projects',
      action: { type: 'open-projects' },
    },
    {
      id: 'circuit-console',
      x: 1080,
      y: roomY,
      label: '备用电路',
      hint: '转动接头，试着让电流走到出口。',
      category: 'play',
      action: { type: 'open-game', game: 'circuit' },
    },
    {
      id: 'workshop-notes',
      x: 1370,
      y: roomY,
      label: '工程笔记',
      hint: '研习、验证与协作的记录。',
      category: 'blog',
      action: { type: 'open-collection', chapter: 'graduate' },
    },
  ]),
];
export const getScene = (id: string) =>
  SCENES.find((s) => s.id === id) ?? SCENES[0];
export const CHAPTERS = [
  {
    id: 'undergraduate',
    title: '本科',
    subtitle: '2019–2023',
    scene: 'undergraduate',
  },
  { id: 'graduate', title: '研究生', subtitle: '2025 至今', scene: 'graduate' },
  { id: 'life', title: '杂谈', subtitle: '沿途拾录', scene: 'life' },
] as const;
export const DISTRICTS: {
  id: string;
  title: string;
  subtitle: string;
  nodeId: string;
  action: WorldAction;
  sceneId: string;
  position: { x: number; y: number };
}[] = [
  {
    id: 'profile',
    title: '驾驶舱',
    subtitle: '简介、教育、经历与荣誉',
    nodeId: 'cockpit-door',
    sceneId: 'life',
    action: { type: 'open-content', contentId: 'profile' },
    position: { x: 10.5, y: 50 },
  },
  {
    id: 'blog',
    title: '胸腔档案库',
    subtitle: '全部文章与笔记',
    nodeId: 'archive-door',
    sceneId: 'undergraduate',
    action: { type: 'open-collection' },
    position: { x: 47.4, y: 50 },
  },
  {
    id: 'projects',
    title: '检修工坊',
    subtitle: 'GitHub 作品与在线演示',
    nodeId: 'workshop-door',
    sceneId: 'graduate',
    action: { type: 'open-projects' },
    position: { x: 86.4, y: 50 },
  },
];
