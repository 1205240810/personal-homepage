import {
  CARDS,
  GEMS,
  GOLD_NAME,
  NOBLES,
  points,
  type BrocadeState,
  type BrocadeView,
  type Move,
  type Side,
} from '@/lib/games/brocade';

const TIERS = ['作坊', '绣庄', '名品'];
const gemName = (g: number) => (g === 5 ? GOLD_NAME : GEMS[g].name);

export function describeMove(m: Move, noble?: number): string {
  let s: string;
  if (m.t === 'take') s = `取了${m.gems.map(gemName).join('、')}`;
  else if (m.t === 'buy')
    s = `购入${TIERS[CARDS[m.card].tier]}${gemName(CARDS[m.card].color)}一件`;
  else
    s =
      m.card === null
        ? `从${TIERS[m.tier ?? 0]}牌堆暗订一件`
        : `预订了${TIERS[CARDS[m.card].tier]}${gemName(CARDS[m.card].color)}一件`;
  if (m.t !== 'buy' && m.ret?.some((n) => n > 0)) s += '并退还多余丝线';
  if (noble !== undefined) s += `，贵客登门（+${NOBLES[noble]?.points ?? 3}）`;
  return s;
}

export function finalText(
  s: BrocadeState | BrocadeView,
  me: Side,
  names: [string, string],
): string {
  const a = points(s.players[me]);
  const b = points(s.players[(1 - me) as Side]);
  return `声望 ${names[0]} ${a} : ${b} ${names[1]}，织品 ${s.players[me].cards.length} : ${s.players[1 - me].cards.length}${a === b ? '（同分比织品少者胜）' : ''}`;
}
