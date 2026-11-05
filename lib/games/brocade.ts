// 锦绣织造（Splendor 机制，两人）：收集五色丝线，购入作坊、绣庄与名品锦缎，
// 永久的色彩加成越滚越大；凑够加成还能迎来宫廷贵客。先到 15 分的一轮结束时比分。
// 牌组为原创：沿用三档结构与费用分布，按颜色轮换生成。纯规则引擎，前后端共用。

export type Gem = 0 | 1 | 2 | 3 | 4;
export const GOLD = 5;
export type Side = 0 | 1;
export const GEMS = [
  { name: '朱砂', glyph: '朱' },
  { name: '石青', glyph: '青' },
  { name: '藤黄', glyph: '黄' },
  { name: '黛墨', glyph: '黛' },
  { name: '素丝', glyph: '素' },
] as const;
export const GOLD_NAME = '金线';
export const TOKENS_PER_GEM = 4;
export const GOLD_TOKENS = 5;
export const WIN_POINTS = 15;
export const TOKEN_LIMIT = 10;
export const RESERVE_LIMIT = 3;

export type CardDef = {
  id: number;
  tier: 0 | 1 | 2;
  color: Gem;
  points: number;
  cost: number[];
};
export type NobleDef = { id: number; need: number[]; points: number };

type Tpl = [Record<number, number>, number];
const TIERS: Tpl[][] = [
  [
    [{ 1: 1, 2: 1, 3: 1, 4: 1 }, 0],
    [{ 1: 1, 2: 2, 3: 1, 4: 1 }, 0],
    [{ 1: 2, 2: 2, 4: 1 }, 0],
    [{ 0: 1, 1: 3, 3: 1 }, 0],
    [{ 2: 2, 3: 1 }, 0],
    [{ 1: 2, 4: 2 }, 0],
    [{ 2: 3 }, 0],
    [{ 3: 4 }, 1],
  ],
  [
    [{ 1: 3, 2: 2, 3: 2 }, 1],
    [{ 0: 2, 2: 3, 4: 3 }, 1],
    [{ 1: 4, 2: 2, 4: 1 }, 2],
    [{ 2: 5, 1: 3 }, 2],
    [{ 3: 5 }, 2],
    [{ 0: 6 }, 3],
  ],
  [
    [{ 1: 3, 2: 3, 3: 5, 4: 3 }, 3],
    [{ 2: 7 }, 4],
    [{ 0: 3, 2: 6, 1: 3 }, 4],
    [{ 2: 7, 0: 3 }, 5],
  ],
];
export const CARDS: CardDef[] = [];
TIERS.forEach((tpls, tier) => {
  for (let color = 0; color < 5; color++)
    for (const [t, points] of tpls) {
      const cost = [0, 0, 0, 0, 0];
      for (const [off, n] of Object.entries(t))
        cost[(color + Number(off)) % 5] += n;
      CARDS.push({
        id: CARDS.length,
        tier: tier as 0 | 1 | 2,
        color: color as Gem,
        points,
        cost,
      });
    }
});
export const NOBLES: NobleDef[] = [];
for (let c = 0; c < 5; c++) {
  const need = [0, 0, 0, 0, 0];
  need[c] = 4;
  need[(c + 1) % 5] = 4;
  NOBLES.push({ id: NOBLES.length, need, points: 3 });
}
for (let c = 0; c < 5; c++) {
  const need = [0, 0, 0, 0, 0];
  need[c] = 3;
  need[(c + 2) % 5] = 3;
  need[(c + 3) % 5] = 3;
  NOBLES.push({ id: NOBLES.length, need, points: 3 });
}

export type Player = {
  tokens: number[]; // 6 entries, index 5 = gold
  cards: number[];
  reserved: number[];
  nobles: number[];
};
export type Move =
  | { t: 'take'; gems: Gem[]; ret?: number[] }
  | { t: 'reserve'; card: number | null; tier?: number; ret?: number[] }
  | { t: 'buy'; card: number }
  | { t: 'pass' };

export type BrocadeState = {
  decks: number[][];
  market: (number | null)[][]; // 3 tiers × 4
  bank: number[];
  nobles: number[];
  players: [Player, Player];
  toPlay: Side;
  first: Side;
  phase: 'play' | 'over';
  /** Consecutive forced passes; two end a blocked game in a draw. */
  passes: number;
  winner: Side | 'draw' | null;
  last: { side: Side; move: Move; noble?: number } | null;
  /** Reserved-from-deck cards are hidden from the opponent. */
  blind: [number[], number[]];
};

function shuffle<T>(a: T[], rng: () => number): T[] {
  const d = a.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
const emptyPlayer = (): Player => ({
  tokens: [0, 0, 0, 0, 0, 0],
  cards: [],
  reserved: [],
  nobles: [],
});

export function newGame(rng: () => number, first: Side = 0): BrocadeState {
  const decks = [0, 1, 2].map((t) =>
    shuffle(
      CARDS.filter((c) => c.tier === t).map((c) => c.id),
      rng,
    ),
  );
  const market = decks.map((d) => d.splice(0, 4));
  return {
    decks,
    market,
    bank: [4, 4, 4, 4, 4, GOLD_TOKENS],
    nobles: shuffle(
      NOBLES.map((n) => n.id),
      rng,
    ).slice(0, 3),
    players: [emptyPlayer(), emptyPlayer()],
    toPlay: first,
    first,
    phase: 'play',
    passes: 0,
    winner: null,
    last: null,
    blind: [[], []],
  };
}

export const bonuses = (p: Player) => {
  const b = [0, 0, 0, 0, 0];
  for (const id of p.cards) b[CARDS[id].color]++;
  return b;
};
export const points = (p: Player) =>
  p.cards.reduce((a, id) => a + CARDS[id].points, 0) +
  p.nobles.reduce((a, id) => a + NOBLES[id].points, 0);
export const tokenCount = (p: Player) => p.tokens.reduce((a, b) => a + b, 0);

/** Tokens to pay for a card (per colour + gold), or null if unaffordable. */
export function payment(p: Player, id: number): number[] | null {
  const b = bonuses(p);
  const pay = [0, 0, 0, 0, 0, 0];
  let gold = 0;
  CARDS[id].cost.forEach((c, g) => {
    const need = Math.max(0, c - b[g]);
    const use = Math.min(need, p.tokens[g]);
    pay[g] = use;
    gold += need - use;
  });
  if (gold > p.tokens[GOLD]) return null;
  pay[GOLD] = gold;
  return pay;
}

function applyReturn(
  p: Player,
  bank: number[],
  ret: number[] | undefined,
): void {
  const over = tokenCount(p) - TOKEN_LIMIT;
  const r = ret ?? [];
  if (over <= 0) {
    if (r.length) throw new Error('没有超过 10 枚，不需要退还');
    return;
  }
  if (r.length !== over) throw new Error(`手里超过 10 枚，需要退还 ${over} 枚`);
  for (const g of r) {
    if (!Number.isInteger(g) || g < 0 || g > 5 || p.tokens[g] <= 0)
      throw new Error('退还的丝线无效');
    p.tokens[g]--;
    bank[g]++;
  }
}

function finishTurn(s: BrocadeState, side: Side, move: Move): BrocadeState {
  const p = s.players[side];
  const b = bonuses(p);
  let noble: number | undefined;
  const idx = s.nobles.findIndex((id) =>
    NOBLES[id].need.every((n, g) => b[g] >= n),
  );
  let nobles = s.nobles;
  if (idx >= 0) {
    noble = s.nobles[idx];
    p.nobles = [...p.nobles, noble];
    nobles = s.nobles.filter((_, i) => i !== idx);
  }
  const next: BrocadeState = {
    ...s,
    nobles,
    toPlay: (1 - side) as Side,
    last: { side, move, noble },
    passes: move.t === 'pass' && noble === undefined ? s.passes + 1 : 0,
  };
  // Round ends when play returns to the first player.
  if (
    next.toPlay === s.first &&
    s.players.some((q) => points(q) >= WIN_POINTS)
  ) {
    const pts = s.players.map(points);
    const winner: Side | 'draw' =
      pts[0] !== pts[1]
        ? pts[0] > pts[1]
          ? 0
          : 1
        : s.players[0].cards.length !== s.players[1].cards.length
          ? s.players[0].cards.length < s.players[1].cards.length
            ? 0
            : 1
          : 'draw';
    return { ...next, phase: 'over', winner };
  }
  return next.passes >= 2 ? { ...next, phase: 'over', winner: 'draw' } : next;
}

const clone = (s: BrocadeState): BrocadeState => ({
  ...s,
  decks: s.decks.map((d) => d.slice()),
  market: s.market.map((r) => r.slice()),
  bank: s.bank.slice(),
  players: s.players.map((p) => ({
    tokens: p.tokens.slice(),
    cards: p.cards.slice(),
    reserved: p.reserved.slice(),
    nobles: p.nobles.slice(),
  })) as [Player, Player],
  blind: [s.blind[0].slice(), s.blind[1].slice()],
});

function locate(s: BrocadeState, id: number): [number, number] | null {
  for (let t = 0; t < 3; t++) {
    const k = s.market[t].indexOf(id);
    if (k >= 0) return [t, k];
  }
  return null;
}

export function apply(s0: BrocadeState, side: Side, m: Move): BrocadeState {
  if (s0.phase !== 'play') throw new Error('对局已结束');
  if (side !== s0.toPlay) throw new Error('还没轮到你');
  if (!m || typeof m !== 'object') throw new Error('操作无效');
  const s = clone(s0);
  const p = s.players[side];
  if (m.t === 'pass') {
    if (hasAction(s, side)) throw new Error('还有可执行的行动，不能过牌');
    return finishTurn(s, side, m);
  }
  if (m.t === 'take') {
    const g = m.gems;
    if (
      !Array.isArray(g) ||
      !g.every((x) => Number.isInteger(x) && x >= 0 && x < 5)
    )
      throw new Error('丝线无效');
    if (g.length === 2 && g[0] === g[1]) {
      if (s.bank[g[0]] < 4)
        throw new Error('同色拿两枚，需要那一色还剩至少 4 枚');
    } else {
      if (new Set(g).size !== g.length) throw new Error('拿不同颜色时每色一枚');
      const avail = [0, 1, 2, 3, 4].filter((x) => s.bank[x] > 0).length;
      if (g.length !== Math.min(3, avail) || g.length === 0)
        throw new Error('一次拿三种不同颜色各一枚');
      if (g.some((x) => s.bank[x] <= 0)) throw new Error('这种丝线拿完了');
    }
    for (const x of g) {
      s.bank[x]--;
      p.tokens[x]++;
    }
    applyReturn(p, s.bank, m.ret);
    return finishTurn(s, side, m);
  }
  if (m.t === 'reserve') {
    if (p.reserved.length >= RESERVE_LIMIT) throw new Error('最多预订 3 件');
    let id: number;
    if (m.card === null) {
      const t = m.tier;
      if (!Number.isInteger(t) || t! < 0 || t! > 2 || !s.decks[t!].length)
        throw new Error('这一档牌堆空了');
      id = s.decks[t!].shift()!;
      s.blind[side].push(id);
    } else {
      const at = locate(s, m.card);
      if (!at) throw new Error('台面上没有这件');
      id = m.card;
      s.market[at[0]][at[1]] = s.decks[at[0]].shift() ?? null;
    }
    p.reserved.push(id);
    if (s.bank[GOLD] > 0) {
      s.bank[GOLD]--;
      p.tokens[GOLD]++;
    }
    applyReturn(p, s.bank, m.ret);
    return finishTurn(s, side, m);
  }
  if (m.t === 'buy') {
    const id = m.card;
    const at = Number.isInteger(id) ? locate(s, id) : null;
    const fromHand = p.reserved.includes(id);
    if (!at && !fromHand) throw new Error('只能买台面上或自己预订的');
    const pay = payment(p, id);
    if (!pay) throw new Error('丝线不够');
    pay.forEach((n, g) => {
      p.tokens[g] -= n;
      s.bank[g] += n;
    });
    if (at) s.market[at[0]][at[1]] = s.decks[at[0]].shift() ?? null;
    else {
      p.reserved = p.reserved.filter((x) => x !== id);
      s.blind[side] = s.blind[side].filter((x) => x !== id);
    }
    p.cards.push(id);
    return finishTurn(s, side, m);
  }
  throw new Error('操作无效');
}

/** Tokens to return for a hypothetical take (cheapest-first heuristic). */
export function autoReturn(p: Player, gained: number[]): number[] {
  const t = p.tokens.map((n, g) => n + (gained[g] ?? 0));
  let over = t.reduce((a, b) => a + b, 0) - TOKEN_LIMIT;
  const out: number[] = [];
  while (over > 0) {
    let g = 0;
    for (let k = 1; k < 5; k++) if (t[k] > t[g]) g = k;
    t[g]--;
    out.push(g);
    over--;
  }
  return out;
}

/** Whether a player can act, using only their own hand and public supplies. */
export function hasAction(s: BrocadeState | BrocadeView, side: Side): boolean {
  if (s.phase !== 'play') return false;
  const p = s.players[side];
  if (s.bank.slice(0, 5).some((n) => n > 0)) return true;
  if (
    p.reserved.length < RESERVE_LIMIT &&
    (s.market.some((row) => row.some((id) => id !== null)) ||
      ('decks' in s
        ? s.decks.some((d) => d.length > 0)
        : s.deckCounts.some((n) => n > 0)))
  )
    return true;
  return [...s.market.flat(), ...p.reserved].some(
    (id) => id !== null && id >= 0 && payment(p, id) !== null,
  );
}

export function legalMoves(s: BrocadeState): Move[] {
  if (s.phase !== 'play') return [];
  const side = s.toPlay;
  const p = s.players[side];
  const out: Move[] = [];
  for (const id of [...s.market.flat(), ...p.reserved])
    if (id !== null && payment(p, id)) out.push({ t: 'buy', card: id });
  const avail = [0, 1, 2, 3, 4].filter((g) => s.bank[g] > 0) as Gem[];
  const k = Math.min(3, avail.length);
  const combos: Gem[][] = [];
  const rec = (start: number, cur: Gem[]) => {
    if (cur.length === k) return combos.push(cur.slice());
    for (let i = start; i < avail.length; i++) rec(i + 1, [...cur, avail[i]]);
  };
  if (k) rec(0, []);
  for (let g = 0; g < 5; g++)
    if (s.bank[g] >= 4) combos.push([g as Gem, g as Gem]);
  for (const gems of combos) {
    const gained = [0, 0, 0, 0, 0, 0];
    gems.forEach((g) => gained[g]++);
    const ret = autoReturn(p, gained);
    out.push(ret.length ? { t: 'take', gems, ret } : { t: 'take', gems });
  }
  if (p.reserved.length < RESERVE_LIMIT) {
    const gained = [0, 0, 0, 0, 0, s.bank[GOLD] > 0 ? 1 : 0];
    const ret = autoReturn(p, gained);
    for (const id of s.market.flat())
      if (id !== null)
        out.push({ t: 'reserve', card: id, ...(ret.length ? { ret } : {}) });
    s.decks.forEach((deck, tier) => {
      if (deck.length)
        out.push({
          t: 'reserve',
          card: null,
          tier,
          ...(ret.length ? { ret } : {}),
        });
    });
  }
  return out.length ? out : [{ t: 'pass' }];
}

export type BrocadeView = Omit<BrocadeState, 'decks' | 'players' | 'blind'> & {
  you: Side | null;
  deckCounts: number[];
  players: [Player & { hidden: number }, Player & { hidden: number }];
};

export function viewFor(s: BrocadeState, side: Side | null): BrocadeView {
  const { decks, players, blind, ...rest } = s;
  return {
    ...rest,
    you: side,
    deckCounts: decks.map((d) => d.length),
    players: players.map((p, i) => {
      const hide = i !== side && s.phase === 'play';
      return {
        ...p,
        // Blind reservations show only their tier to the opponent (as -1 - tier).
        reserved: hide
          ? p.reserved.map((id) =>
              blind[i].includes(id) ? -1 - CARDS[id].tier : id,
            )
          : p.reserved,
        hidden: hide ? blind[i].length : 0,
      };
    }) as BrocadeView['players'],
  };
}

export function parseMove(raw: unknown): Move | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  const ints = (a: unknown, max: number) =>
    Array.isArray(a) && a.length <= max && a.every((x) => Number.isInteger(x));
  const ret =
    m.ret === undefined
      ? undefined
      : ints(m.ret, 3)
        ? (m.ret as number[])
        : null;
  if (ret === null) return null;
  if (m.t === 'pass') return { t: 'pass' };
  if (m.t === 'take' && ints(m.gems, 3))
    return { t: 'take', gems: m.gems as Gem[], ...(ret ? { ret } : {}) };
  if (m.t === 'reserve' && (m.card === null || Number.isInteger(m.card)))
    return {
      t: 'reserve',
      card: m.card as number | null,
      ...(Number.isInteger(m.tier) ? { tier: m.tier as number } : {}),
      ...(ret ? { ret } : {}),
    };
  if (m.t === 'buy' && Number.isInteger(m.card))
    return { t: 'buy', card: m.card as number };
  return null;
}
