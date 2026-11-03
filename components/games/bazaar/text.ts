import {
  GOODS,
  cardLabel,
  type BazaarState,
  type Move,
  type Side,
} from '@/lib/games/bazaar';

export function describeMove(m: Move): string {
  if (m.t === 'take') return `拿了一件货`;
  if (m.t === 'camels') return `牵走了骆驼`;
  if (m.t === 'swap')
    return `换了 ${m.take.length} 件货（放下 ${m.give.map(cardLabel).join('、')}）`;
  return `卖出 ${m.n} 件${GOODS[m.good].name}`;
}

export function roundSummary(
  r: NonNullable<BazaarState['roundResult']>,
  me: Side,
  names: [string, string],
): string {
  const opp = (1 - me) as Side;
  return `本局 ${r.winner === me ? names[0] : names[1]}胜：${names[0]} ${r.points[me]} 两，${names[1]} ${r.points[opp]} 两${
    r.camelBonus === null
      ? ''
      : `（驼队赏 5 两归${r.camelBonus === me ? names[0] : names[1]}）`
  }`;
}
