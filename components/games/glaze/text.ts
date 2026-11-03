import { COLORS, type GlazeState, type Move } from '@/lib/games/glaze';

export function describeMove(m: Move): string {
  return `从${m.src === -1 ? '案台' : `第 ${m.src + 1} 窑`}取了${COLORS[m.color].name}，${m.line === -1 ? '直接扔进碎瓷区' : `放上第 ${m.line + 1} 层料架`}`;
}

export function finalText(
  s: Pick<GlazeState, 'boards' | 'bonus'>,
  me: 0 | 1,
  names: [string, string],
): string {
  const o = (1 - me) as 0 | 1;
  const b = s.bonus;
  return `${names[0]} ${s.boards[me].score} 分${b ? `（终局奖励 ${b[me]}）` : ''}，${names[1]} ${s.boards[o].score} 分${b ? `（终局奖励 ${b[o]}）` : ''}`;
}
