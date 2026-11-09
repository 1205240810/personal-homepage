// 军棋布阵：几套预设阵型 + 合理的随机布阵（AI 与「随机布阵」按钮共用）。
// 阵型按 RED_SLOTS 顺序：第 1 排 5 格、第 2 排 3 格（左中右）、第 3 排 4 格、
// 第 4 排 3 格、第 5 排 5 格、底排 5 格（第 2、4 格是大本营）。
import {
  BOMB,
  ENG,
  FLAG,
  JUN,
  LIAN,
  LV,
  MINE,
  PAI,
  RED_SLOTS,
  SHI,
  SI,
  TUAN,
  YING,
  checkLayout,
  rowFor,
  xOf,
  type Kind,
  type Layout,
} from './junqi.ts';

export type Preset = { id: string; name: string; note: string; layout: Layout };

// prettier-ignore
export const PRESETS: Preset[] = [
  {
    id: 'center',
    name: '稳守中路',
    note: '军旗在左营，三雷护旗，司令坐镇中路',
    layout: [
      LIAN, SHI, PAI, JUN, LIAN,
      ENG, TUAN, ENG,
      YING, BOMB, SI, LV,
      TUAN, PAI, BOMB,
      LV, MINE, YING, SHI, ENG,
      MINE, FLAG, MINE, PAI, LIAN,
    ],
  },
  {
    id: 'left',
    name: '左路强攻',
    note: '司令、军长压在左侧铁路，军旗藏在右营',
    layout: [
      SI, LIAN, PAI, LIAN, ENG,
      JUN, YING, TUAN,
      SHI, BOMB, ENG, LV,
      TUAN, BOMB, PAI,
      SHI, YING, PAI, MINE, LV,
      LIAN, ENG, MINE, FLAG, MINE,
    ],
  },
  {
    id: 'iron',
    name: '铁桶阵',
    note: '双雷挡在旗前，炸弹守营，稳扎稳打',
    layout: [
      LV, LIAN, SHI, PAI, TUAN,
      ENG, SI, ENG,
      LIAN, JUN, BOMB, YING,
      PAI, BOMB, SHI,
      MINE, MINE, TUAN, YING, LV,
      LIAN, FLAG, MINE, PAI, ENG,
    ],
  },
];

/** 左右镜像一个阵型（行营、大本营左右对称，镜像后依然合法）。 */
export function mirrorLayout(layout: Layout): Layout {
  const out = layout.slice();
  RED_SLOTS.forEach((c, slot) => {
    const mirrored = c - xOf(c) + (4 - xOf(c));
    out[RED_SLOTS.indexOf(mirrored)] = layout[slot];
  });
  return out;
}

const MOBILE = (k: Kind) => k >= ENG;

/**
 * 合理的随机布阵：从预设出发，随机镜像，再在「能动的棋子」之间洗几次，
 * 炸弹偶尔换到第 2–4 排的其他位置。保证合法。
 */
export function randomLayout(rng: () => number = Math.random): Layout {
  let l = PRESETS[Math.floor(rng() * PRESETS.length)].layout.slice();
  if (rng() < 0.5) l = mirrorLayout(l);
  const pick = () => Math.floor(rng() * l.length);
  for (let n = 0; n < 40; n++) {
    const a = pick();
    const b = pick();
    if (a === b) continue;
    const ka = l[a];
    const kb = l[b];
    const okA = MOBILE(ka) || ka === BOMB;
    const okB = MOBILE(kb) || kb === BOMB;
    if (!okA || !okB) continue;
    // 底排大本营里的子走不动，别把高级军官换进去。
    const hq = (s: number) =>
      rowFor(0, RED_SLOTS[s]) === 5 &&
      (xOf(RED_SLOTS[s]) === 1 || xOf(RED_SLOTS[s]) === 3);
    if ((hq(a) && kb >= TUAN) || (hq(b) && ka >= TUAN)) continue;
    const next = l.slice();
    next[a] = kb;
    next[b] = ka;
    if (checkLayout(next).errors.length === 0) l = next;
  }
  return l;
}

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
