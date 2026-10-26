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
    src: '/art/arrival-navigator.webp',
    alt: '钴蓝色的天文导航机甲站在高窗下，椭圆观测头与环形肩部轴承映着自然日光。',
    desktop: '64% 48%',
    mobile: '73% 50%',
  },
  {
    id: 'maintainer',
    src: '/art/arrival-maintainer.webp',
    alt: '旧铜装甲的重型检修机甲伫立在维护馆中，宽肩和两枚温暖的观测镜头清晰可见。',
    desktop: '64% 50%',
    mobile: '71% 50%',
  },
  {
    id: 'surveyor',
    src: '/art/arrival-surveyor.webp',
    alt: '石墨色远行勘探机甲背着传感器，竖向琥珀观察镜在临山维护馆的日光中微微亮起。',
    desktop: '62% 50%',
    mobile: '73% 50%',
  },
] as const;

export type ArrivalArt = (typeof ARRIVAL_ART)[number];
