export const categories = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'three',
  'four',
  'house',
  'small',
  'large',
  'yahtzee',
  'chance',
] as const;
export type Category = (typeof categories)[number];
export const labels: Record<Category, string> = {
  ones: '一点',
  twos: '二点',
  threes: '三点',
  fours: '四点',
  fives: '五点',
  sixes: '六点',
  three: '三条',
  four: '四条',
  house: '葫芦',
  small: '小顺',
  large: '大顺',
  yahtzee: '快艇',
  chance: '全选',
};
export const descriptions = [
  '所有 1 的总和',
  '所有 2 的总和',
  '所有 3 的总和',
  '所有 4 的总和',
  '所有 5 的总和',
  '所有 6 的总和',
  '至少三个相同：五骰总和',
  '至少四个相同：五骰总和',
  '三同 + 二同：25 分',
  '四个连续点数：30 分',
  '五个连续点数：40 分',
  '五个相同：50 分',
  '任意组合：五骰总和',
];
export type Card = Partial<Record<Category, number>>;
export const counts = (dice: number[]) =>
  Array.from({ length: 6 }, (_, i) => dice.filter((d) => d === i + 1).length);
export const upper = (card: Card) =>
  categories.slice(0, 6).reduce((n, c) => n + (card[c] ?? 0), 0);
export const total = (card: Card, bonus = 0) =>
  Object.values(card).reduce((n, s) => n + (s ?? 0), 0) +
  (upper(card) >= 63 ? 35 : 0) +
  bonus;
export function options(
  dice: number[],
  card: Card,
): Partial<Record<Category, number>> {
  if (
    dice.length !== 5 ||
    dice.some((d) => !Number.isInteger(d) || d < 1 || d > 6)
  )
    return {};
  const n = counts(dice),
    sum = dice.reduce((a, b) => a + b, 0),
    max = Math.max(...n),
    repeat = max === 5 && card.yahtzee !== undefined;
  const matching = categories[dice[0] - 1],
    lowerOpen = categories.slice(6).some((c) => card[c] === undefined);
  const out: Partial<Record<Category, number>> = {};
  for (const [i, c] of categories.entries()) {
    if (card[c] !== undefined) continue;
    if (repeat && card[matching] === undefined && c !== matching) continue;
    if (repeat && card[matching] !== undefined && lowerOpen && i < 6) continue;
    const straight = (len: number) =>
      Array.from({ length: 7 - len }, (_, start) =>
        n.slice(start, start + len).every((v) => v > 0),
      ).some(Boolean);
    out[c] =
      i < 6
        ? n[i] * (i + 1)
        : c === 'three'
          ? max >= 3
            ? sum
            : 0
          : c === 'four'
            ? max >= 4
              ? sum
              : 0
            : c === 'house'
              ? repeat || (n.includes(3) && n.includes(2))
                ? 25
                : 0
              : c === 'small'
                ? repeat || straight(4)
                  ? 30
                  : 0
                : c === 'large'
                  ? repeat || straight(5)
                    ? 40
                    : 0
                  : c === 'yahtzee'
                    ? max === 5
                      ? 50
                      : 0
                    : sum;
  }
  return out;
}
export function bonusFor(dice: number[], card: Card) {
  return new Set(dice).size === 1 &&
    dice.length === 5 &&
    dice.every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 6,
    ) &&
    card.yahtzee === 50
    ? 100
    : 0;
}
export type Difficulty = 'easy' | 'normal';
export type State = {
  version: 1;
  id: string;
  turn: 'player' | 'ai' | 'done';
  dice: number[];
  held: boolean[];
  rolls: number;
  cards: [Card, Card];
  bonus: [number, number];
  difficulty: Difficulty;
  log: string[];
  lastAI: string;
};
export const initial = (difficulty: Difficulty = 'normal'): State => ({
  version: 1,
  id: Date.now() + '-' + Math.random(),
  turn: 'player',
  dice: [1, 2, 3, 4, 5],
  held: Array(5).fill(false),
  rolls: 0,
  cards: [{}, {}],
  bonus: [0, 0],
  difficulty,
  log: [],
  lastAI: '我会在行动后解释自己的选择。',
});
export function roll(state: State, rng = Math.random): State {
  if (
    state.turn === 'done' ||
    state.rolls >= 3 ||
    (state.rolls > 0 && state.held.every(Boolean))
  )
    return state;
  return {
    ...state,
    dice: state.dice.map((v, i) => {
      if (state.rolls > 0 && state.held[i]) return v;
      const value = rng();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new Error('骰子随机数必须位于 [0, 1)');
      return 1 + Math.floor(value * 6);
    }),
    rolls: state.rolls + 1,
  };
}
export function score(state: State, c: Category): State {
  if (state.turn === 'done' || state.rolls === 0) return state;
  const p = state.turn === 'player' ? 0 : 1,
    card = state.cards[p],
    points = options(state.dice, card)[c];
  if (points === undefined) return state;
  const cards: [Card, Card] = [{ ...state.cards[0] }, { ...state.cards[1] }];
  cards[p][c] = points;
  const bonus: [number, number] = [...state.bonus];
  bonus[p] += bonusFor(state.dice, card);
  const message = `${p === 0 ? '你' : '蓝调'}将 ${state.dice.join(' · ')} 记入${labels[c]}，获得 ${points} 分${bonusFor(state.dice, card) ? '，快艇奖励 +100' : ''}。`;
  return {
    ...state,
    cards,
    bonus,
    turn:
      p === 0 ? 'ai' : Object.keys(cards[1]).length === 13 ? 'done' : 'player',
    rolls: 0,
    held: Array(5).fill(false),
    log: [message, ...state.log].slice(0, 26),
    lastAI: p === 1 ? message : state.lastAI,
  };
}
const baselines = [2, 5, 8, 11, 14, 17, 18, 12, 17, 23, 25, 12, 22];
export function utility(
  c: Category,
  points: number,
  card: Card,
  difficulty: Difficulty,
) {
  if (difficulty === 'easy') return points;
  const i = categories.indexOf(c),
    remaining = categories
      .slice(0, 6)
      .reduce((n, k, j) => n + (card[k] === undefined ? 3 * (j + 1) : 0), 0),
    need = Math.max(0, 63 - upper(card));
  const upperValue =
    i < 6 && need > 0 && remaining >= need * 0.6
      ? Math.min(points, need) * 0.4
      : 0;
  return points - baselines[i] * 0.72 + upperValue;
}
export function bestScore(
  dice: number[],
  card: Card,
  difficulty: Difficulty,
): { category: Category; value: number } {
  let best = { category: 'chance' as Category, value: -Infinity };
  const scores = options(dice, card),
    bonus = bonusFor(dice, card);
  for (const c of categories) {
    const pts = scores[c];
    if (pts === undefined) continue;
    const value = utility(c, pts, card, difficulty) + bonus;
    if (value > best.value) best = { category: c, value };
  }
  return best;
}
const distributions = new Map<number, { dice: number[]; prob: number }[]>();
function outcomes(n: number) {
  if (distributions.has(n)) return distributions.get(n)!;
  const list: { dice: number[]; prob: number }[] = [];
  const factorial = [1, 1, 2, 6, 24, 120];
  function visit(left: number, start: number, d: number[]) {
    if (!left) {
      const denom = counts(d).reduce((a, b) => a * factorial[b], 1);
      list.push({ dice: d, prob: factorial[n] / denom / 6 ** n });
      return;
    }
    for (let i = start; i <= 6; i++) visit(left - 1, i, [...d, i]);
  }
  visit(n, 1, []);
  distributions.set(n, list);
  return list;
}
export function chooseHold(dice: number[], card: Card, difficulty: Difficulty) {
  // Exact one-reroll distribution, with category opportunity/upper-bonus heuristic.
  let best = bestScore(dice, card, difficulty).value,
    mask = 31;
  const seen = new Set<string>();
  for (let m = 0; m < 31; m++) {
    const kept = dice.filter((_, i) => m & (1 << i)),
      key = kept.slice().sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    let ev = 0;
    for (const o of outcomes(5 - kept.length))
      ev += o.prob * bestScore([...kept, ...o.dice], card, difficulty).value;
    if (ev > best + 0.00001) {
      best = ev;
      mask = m;
    }
  }
  return { held: dice.map((_, i) => Boolean(mask & (1 << i))), value: best };
}
export const STORAGE = 'blue-dice:v1';
export function restore(raw: string | null): State | null {
  try {
    if (raw && raw.length > 30000) return null;
    const s = JSON.parse(raw ?? 'null');
    if (
      !s ||
      s.version !== 1 ||
      typeof s.id !== 'string' ||
      s.id.length === 0 ||
      s.id.length > 160 ||
      !['player', 'ai', 'done'].includes(s.turn) ||
      !['easy', 'normal'].includes(s.difficulty) ||
      !Array.isArray(s.dice) ||
      s.dice.length !== 5 ||
      s.dice.some((n: number) => !Number.isInteger(n) || n < 1 || n > 6) ||
      !Array.isArray(s.held) ||
      s.held.length !== 5 ||
      s.held.some((v: unknown) => typeof v !== 'boolean') ||
      !Number.isInteger(s.rolls) ||
      s.rolls < 0 ||
      s.rolls > 3 ||
      !Array.isArray(s.cards) ||
      s.cards.length !== 2 ||
      !Array.isArray(s.bonus) ||
      s.bonus.length !== 2 ||
      s.bonus.some(
        (v: number) =>
          !Number.isInteger(v) || v < 0 || v > 1200 || v % 100 !== 0,
      ) ||
      !Array.isArray(s.log) ||
      s.log.length > 26 ||
      s.log.some((v: unknown) => typeof v !== 'string' || v.length > 500) ||
      typeof s.lastAI !== 'string' ||
      s.lastAI.length > 500 ||
      (s.rolls === 0 && s.held.some(Boolean)) ||
      (s.turn === 'done' && s.rolls !== 0)
    )
      return null;
    for (const card of s.cards) {
      if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
      for (const [c, v] of Object.entries(card)) {
        const i = categories.indexOf(c as Category);
        if (
          i < 0 ||
          typeof v !== 'number' ||
          !Number.isInteger(v) ||
          v < 0 ||
          v >
            (i < 6
              ? 5 * (i + 1)
              : c === 'yahtzee'
                ? 50
                : c === 'large'
                  ? 40
                  : 30)
        )
          return null;
        if (i < 6 && v % (i + 1) !== 0) return null;
        if (
          (['three', 'four'].includes(c) && v > 0 && v < 5) ||
          (c === 'chance' && v < 5)
        )
          return null;
        if (
          (c === 'house' && ![0, 25].includes(v)) ||
          (c === 'small' && ![0, 30].includes(v)) ||
          (c === 'large' && ![0, 40].includes(v)) ||
          (c === 'yahtzee' && ![0, 50].includes(v))
        )
          return null;
      }
    }
    for (let p = 0; p < 2; p++) {
      if (
        s.bonus[p] > 0 &&
        (s.cards[p].yahtzee !== 50 ||
          s.bonus[p] > 100 * (Object.keys(s.cards[p]).length - 1))
      )
        return null;
    }
    const [a, b] = s.cards.map((c: Card) => Object.keys(c).length);
    if (
      (s.turn === 'player' && (a !== b || a === 13)) ||
      (s.turn === 'ai' && a !== b + 1) ||
      (s.turn === 'done' && (a !== 13 || b !== 13))
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
export async function chooseHoldAsync(
  dice: number[],
  card: Card,
  difficulty: Difficulty,
  aborted: () => boolean,
) {
  let best = bestScore(dice, card, difficulty).value,
    mask = 31;
  const seen = new Set<string>();
  for (let m = 0; m < 31; m++) {
    if (m % 4 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (aborted()) return null;
    }
    const kept = dice.filter((_, i) => m & (1 << i)),
      key = kept.slice().sort().join();
    if (seen.has(key)) continue;
    seen.add(key);
    let ev = 0;
    for (const o of outcomes(5 - kept.length))
      ev += o.prob * bestScore([...kept, ...o.dice], card, difficulty).value;
    if (ev > best + 0.00001) {
      best = ev;
      mask = m;
    }
  }
  return { held: dice.map((_, i) => Boolean(mask & (1 << i))), value: best };
}
