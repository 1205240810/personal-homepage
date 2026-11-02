// 花街七席 AI。低档是带噪声的启发式；高档是“确定化蒙特卡洛搜索”（PIMC）：
// 只看自己能看到的信息，把未知花笺（对手手牌、对手藏牌与弃牌、暗抽牌、牌堆）
// 按剩余张数随机分配成许多个“可能的世界”，在每个世界里把本轮推演到底，
// 选平均结果最好的行动。AI 从不读取对手的真实手牌。
import {
  ACTIONS,
  ACTION_SIZE,
  VALUES,
  apply,
  decider,
  fullDeck,
  other,
  scoreOf,
  type ActionKind,
  type Card,
  type HanamiState,
  type HanamiView,
  type Move,
  type Side,
} from './hanami.ts';

export type HanamiLevel = 1 | 2 | 3 | 4 | 5;
export const HANAMI_LEVELS: Record<
  HanamiLevel,
  { name: string; note: string; worlds: number; noise: number; timeMs: number }
> = {
  1: { name: '1 · 新手', note: '随手出牌', worlds: 0, noise: 1, timeMs: 0 },
  2: {
    name: '2 · 入门',
    note: '会抢分，常算错',
    worlds: 0,
    noise: 0.6,
    timeMs: 0,
  },
  3: { name: '3 · 熟练', note: '一步攻守判断', worlds: 0, noise: 0, timeMs: 0 },
  4: {
    name: '4 · 高手',
    note: '推演约 60 个可能的牌局',
    worlds: 60,
    noise: 0,
    timeMs: 900,
  },
  5: {
    name: '5 · 大师',
    note: '推演约 240 个可能的牌局',
    worlds: 240,
    noise: 0,
    timeMs: 1800,
  },
};

// ---------- static evaluation ----------
function patronEdge(
  mine: number,
  theirs: number,
  marker: Side | null,
  me: Side,
) {
  const d = mine - theirs;
  if (d === 0) return marker === me ? 0.35 : marker === null ? 0 : -0.35;
  return Math.tanh(d * 0.9);
}
/** Board value from `me`'s side using only counts on the table. */
export function evaluate(
  played: [number[], number[]],
  favour: (Side | null)[],
  me: Side,
) {
  let s = 0;
  for (let p = 0; p < 7; p++)
    s +=
      VALUES[p] *
      patronEdge(played[me][p], played[other(me)][p], favour[p], me);
  return s;
}

function terminal(s: HanamiState, me: Side) {
  if (s.result)
    return s.result.winner === me ? 100 : s.result.winner === null ? 0 : -100;
  const a = scoreOf(s.favour, me);
  const b = scoreOf(s.favour, other(me));
  // Close to a win counts extra.
  const near = (x: { points: number; patrons: number }) =>
    Math.max(x.points / 11, x.patrons / 4) ** 3 * 20;
  return a.points - b.points + 2 * (a.patrons - b.patrons) + near(a) - near(b);
}

// ---------- move generation ----------
function combos(hand: Card[], k: number): Card[][] {
  const out: Card[][] = [];
  const seen = new Set<string>();
  const rec = (start: number, acc: Card[]) => {
    if (acc.length === k) {
      const key = acc.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(acc.slice());
      }
      return;
    }
    for (let i = start; i < hand.length; i++) {
      acc.push(hand[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

export function legalMoves(hand: Card[], used: ActionKind[]): Move[] {
  const h = hand.slice().sort((a, b) => a - b);
  const out: Move[] = [];
  for (const kind of ACTIONS) {
    if (used.includes(kind) || h.length < ACTION_SIZE[kind]) continue;
    for (const c of combos(h, ACTION_SIZE[kind])) {
      if (kind !== 'contest') {
        out.push({ type: kind, cards: c } as Move);
        continue;
      }
      // Three ways to split four cards into two pairs; dedupe equal splits.
      const seen = new Set<string>();
      for (const [a, b, x, y] of [
        [0, 1, 2, 3],
        [0, 2, 1, 3],
        [0, 3, 1, 2],
      ]) {
        const p = [c[a], c[b]].sort((m, n) => m - n);
        const q = [c[x], c[y]].sort((m, n) => m - n);
        const key = [p.join(''), q.join('')].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: 'contest', cards: [p[0], p[1], q[0], q[1]] });
      }
    }
  }
  return out;
}

const responses = (s: HanamiState): Move[] =>
  s.offer!.kind === 'gift'
    ? [0, 1, 2].map((index) => ({ type: 'pick', index }))
    : [0, 1].map((index) => ({ type: 'pick', index }));

// ---------- greedy policy (fast; used by low tiers and inside rollouts) ----------
function withCards(played: [number[], number[]], side: Side, cards: Card[]) {
  const p: [number[], number[]] = [played[0].slice(), played[1].slice()];
  for (const c of cards) p[side][c]++;
  return p;
}

/** Value of a move for the actor, assuming the responder answers greedily. */
function greedyValue(s: HanamiState, side: Side, m: Move): number {
  const opp = other(side);
  const base = evaluate(s.played, s.favour, side);
  if (m.type === 'secret')
    return evaluate(withCards(s.played, side, m.cards), s.favour, side) - base;
  if (m.type === 'discard') {
    // Discarding throws away potential; prefer low-impact cards.
    let loss = 0;
    for (const c of m.cards)
      loss += evaluate(withCards(s.played, side, [c]), s.favour, side) - base;
    return -loss * 0.5 + 0.2;
  }
  if (m.type === 'pick') return 0;
  const options =
    m.type === 'gift'
      ? [0, 1, 2].map((i) => ({
          theirs: [m.cards[i]],
          mine: m.cards.filter((_, k) => k !== i),
        }))
      : [0, 1].map((i) => ({
          theirs: m.cards.slice(i * 2, i * 2 + 2),
          mine: m.cards.slice((1 - i) * 2, (1 - i) * 2 + 2),
        }));
  let worst = Infinity;
  for (const o of options) {
    const p = withCards(withCards(s.played, side, o.mine), opp, o.theirs);
    worst = Math.min(worst, evaluate(p, s.favour, side) - base);
  }
  return worst;
}

function greedyPick(s: HanamiState, side: Side): Move {
  const o = s.offer!;
  let best = 0;
  let bestV = -Infinity;
  const n = o.kind === 'gift' ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const mine =
      o.kind === 'gift' ? [o.cards[i]] : o.cards.slice(i * 2, i * 2 + 2);
    const theirs =
      o.kind === 'gift'
        ? o.cards.filter((_, k) => k !== i)
        : o.cards.slice((1 - i) * 2, (1 - i) * 2 + 2);
    const p = withCards(withCards(s.played, side, mine), o.from, theirs);
    const v = evaluate(p, s.favour, side);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return { type: 'pick', index: best };
}

// Using a strong action early has an opportunity cost; a mild ordering prior.
const ORDER_BONUS: Record<ActionKind, number> = {
  secret: 0,
  discard: -0.1,
  gift: 0.15,
  contest: 0.1,
};

function greedyMove(
  s: HanamiState,
  side: Side,
  rng: () => number,
  noise: number,
): Move {
  if (s.phase === 'respond') {
    if (noise && rng() < noise * 0.5) {
      const r = responses(s);
      return r[Math.floor(rng() * r.length)];
    }
    return greedyPick(s, side);
  }
  const moves = legalMoves(s.hands[side], s.used[side]);
  if (noise >= 1) return moves[Math.floor(rng() * moves.length)];
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves) {
    const v =
      greedyValue(s, side, m) +
      ORDER_BONUS[m.type as ActionKind] +
      (noise ? (rng() - 0.5) * noise * 6 : (rng() - 0.5) * 0.02);
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

// ---------- determinization ----------
/** Cards `me` cannot see, as a multiset. */
function unseen(v: HanamiView, me: Side): Card[] {
  const count = Array(7).fill(0);
  for (const c of fullDeck()) count[c]++;
  const drop = (c: Card) => count[c]--;
  v.hand.forEach(drop);
  if (v.mySecret !== null) drop(v.mySecret);
  v.mySecretDiscards.forEach(drop);
  for (const side of [0, 1] as Side[])
    v.played[side].forEach((n, p) => {
      count[p] -= n;
    });
  v.offer?.cards.forEach(drop);
  const out: Card[] = [];
  count.forEach((n, p) => {
    for (let i = 0; i < n; i++) out.push(p);
  });
  void me;
  return out;
}

/** One possible full state consistent with what `me` sees. */
function determinize(
  v: HanamiView,
  me: Side,
  base: HanamiState,
  rng: () => number,
): HanamiState {
  const pool = unseen(v, me);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const opp = other(me);
  const s: HanamiState = {
    ...base,
    hands: [[], []],
    secret: [null, null],
    discarded: [[], []],
    played: [v.played[0].slice(), v.played[1].slice()],
    used: [v.used[0].slice(), v.used[1].slice()],
    favour: v.favour.slice(),
    log: [],
    offer: v.offer && { ...v.offer, cards: v.offer.cards.slice() },
  };
  s.hands[me] = v.hand.slice();
  s.secret[me] = v.mySecret;
  s.discarded[me] = v.mySecretDiscards.slice();
  s.hands[opp] = pool.splice(0, v.handCounts[opp]);
  if (v.hasSecret[opp]) s.secret[opp] = pool.pop()!;
  if (v.used[opp].includes('discard')) s.discarded[opp] = pool.splice(0, 2);
  s.removed = pool.pop() ?? null;
  s.deck = pool; // remaining = deckCount
  return s;
}

function rollout(s0: HanamiState, me: Side, rng: () => number): number {
  let s = s0;
  for (
    let guard = 0;
    guard < 40 && (s.phase === 'play' || s.phase === 'respond');
    guard++
  ) {
    const who = decider(s)!;
    s = apply(s, who, greedyMove(s, who, rng, 0.15));
  }
  return terminal(s, me);
}

// ---------- entry point ----------
export type HanamiAiResult = { move: Move; worlds: number; reason: string };

/**
 * Choose a move for `side`. Only `viewFor(state, side)`-level information is
 * used: the real state is passed so turn structure is available, but hidden
 * cards are re-dealt from `view` before any search.
 */
export function chooseHanamiMove(
  state: HanamiState,
  view: HanamiView,
  side: Side,
  level: HanamiLevel,
  rng: () => number = Math.random,
): HanamiAiResult {
  const cfg = HANAMI_LEVELS[level];
  // Strip hidden information before doing anything with the state.
  const visible = determinize(view, side, state, rng);
  if (!cfg.worlds)
    return {
      move: greedyMove(visible, side, rng, cfg.noise),
      worlds: 0,
      reason: '启发式',
    };
  let cands: Move[] =
    visible.phase === 'respond'
      ? responses(visible)
      : legalMoves(visible.hands[side], visible.used[side]);
  if (cands.length > 40) {
    // Keep the most promising candidates by the greedy estimate.
    cands = cands
      .map((m) => ({
        m,
        v: greedyValue(visible, side, m) + ORDER_BONUS[m.type as ActionKind],
      }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 40)
      .map((x) => x.m);
  }
  const total = cands.map(() => 0);
  const deadline = Date.now() + cfg.timeMs;
  let worlds = 0;
  for (; worlds < cfg.worlds && Date.now() < deadline; worlds++) {
    const w = determinize(view, side, state, rng);
    const seed = rng();
    cands.forEach((m, i) => {
      // Common random numbers: same world and same rollout seed for every candidate.
      let x = seed * 2147483646 + 1;
      const r = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
      total[i] += rollout(apply(w, side, m), side, r);
    });
  }
  let best = 0;
  for (let i = 1; i < cands.length; i++) if (total[i] > total[best]) best = i;
  return { move: cands[best], worlds, reason: `推演 ${worlds} 个可能的牌局` };
}
