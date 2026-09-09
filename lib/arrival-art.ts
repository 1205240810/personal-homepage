export const ARRIVAL_ART = [
  {
    id: 'industrial-explorer',
    src: '/art/arrival-industrial-explorer.webp',
    alt: '暖日光穿过维护馆高窗，圆形单眼、墨绿装甲与旧铜关节的巨型探索机甲扶着检修架。',
    desktop: '64% 65%',
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
