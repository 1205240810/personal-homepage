export const ARRIVAL_ART = [
  {
    id: 'industrial-explorer',
    src: '/art/arrival-industrial-explorer-depth.webp',
    alt: '近处的暗色检修设备框住维护馆，暖日光勾勒墨绿单眼机甲与旧铜关节，远处的廊柱隐入冷灰色光尘。',
    desktop: '64% 20%',
    mobile: '69% 50%',
  },
  {
    id: 'navigator',
    src: '/art/arrival-navigator-depth.webp',
    alt: '钴蓝导航机甲站在暖光勾勒的仪器馆中，椭圆观测头与环形肩轴清晰，冷灰拱廊和天体仪向远处延伸。',
    desktop: '64% 15%',
    mobile: '73% 50%',
  },
  {
    id: 'maintainer',
    src: '/art/arrival-maintainer-depth.webp',
    alt: '旧铜重型检修机甲的宽肩和双眼映着高窗暖光，暗色前景与冷灰廊柱衬出厚重金属和维护馆的纵深。',
    desktop: '64% 10%',
    mobile: '71% 50%',
  },
  {
    id: 'surveyor',
    src: '/art/arrival-surveyor-depth.webp',
    alt: '石墨勘探机甲背着传感器，琥珀观察镜和金属边缘微亮；近处检修设备、远处展廊与雪山窗景层层展开。',
    desktop: '62% 0%',
    mobile: '73% 50%',
  },
] as const;

export type ArrivalArt = (typeof ARRIVAL_ART)[number];
