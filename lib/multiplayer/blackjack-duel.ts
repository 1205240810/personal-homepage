// 21 点单挑：两位玩家轮流坐庄，服务器洗牌、发牌，客户端永远看不到牌靴和对手暗牌。
//
// 每局：双方各下底注（建房时选定），各发两张牌，第一张是暗牌（只有自己能看到）。
// 闲家先行动（要牌 / 停牌 / 加倍）；闲家爆牌则庄家直接赢。庄家后行动，能看到闲家的
// 明牌但看不到暗牌，同样可以要牌 / 停牌 / 加倍。比点数：大者赢底注；两张牌 21 点
// （黑杰克）赢 1.5 倍；平局退回。每局交换庄闲，信息优势轮流拥有，长期公平。
// 每次行动限时 30 秒，超时自动停牌。一方筹码不够下一局底注时比赛结束。
import type { GameModule, Seat } from './protocol.ts';

export type Card = { r: number; s: number }; // r 1..13, s 0..3
export type DuelOptions = { stake: 10 | 20 | 50; chips: number };

export type DuelResult = {
  winner: Seat | null;
  /** Chip change per seat. */
  delta: [number, number];
  totals: [number, number];
  why: string;
};

export type DuelState = {
  opts: DuelOptions;
  shoe: Card[];
  chips: [number, number];
  banker: Seat;
  round: number;
  started: boolean;
  phase: 'deal' | 'player' | 'banker' | 'done' | 'over';
  hands: [Card[], Card[]];
  doubled: [boolean, boolean];
  deadline: number | null;
  result: DuelResult | null;
  ready: [boolean, boolean];
  log: string[];
};

export type DuelView = {
  you: Seat | null;
  stake: number;
  chips: [number, number];
  banker: Seat;
  round: number;
  started: boolean;
  phase: DuelState['phase'];
  /** null = face-down card. */
  hands: [(Card | null)[], (Card | null)[]];
  totals: [number | null, number | null];
  doubled: [boolean, boolean];
  deadline: number | null;
  result: DuelResult | null;
  ready: [boolean, boolean];
  shoeLeft: number;
  canDouble: boolean;
  log: string[];
};

export const TURN_MS = 30_000;
const DECKS = 6;

export function newShoe(rng: () => number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < DECKS; d++)
    for (let s = 0; s < 4; s++)
      for (let r = 1; r <= 13; r++) shoe.push({ r, s });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function total(hand: Card[]) {
  let t = 0;
  let aces = 0;
  for (const c of hand) {
    t += c.r === 1 ? 11 : Math.min(10, c.r);
    if (c.r === 1) aces++;
  }
  while (t > 21 && aces--) t -= 10;
  return t;
}
const isNatural = (h: Card[]) => h.length === 2 && total(h) === 21;
const other = (s: Seat): Seat => (s === 0 ? 1 : 0);
const playerOf = (st: DuelState) => other(st.banker);
const actor = (st: DuelState): Seat | null =>
  st.phase === 'player'
    ? playerOf(st)
    : st.phase === 'banker'
      ? st.banker
      : null;

function draw(st: DuelState, rng: () => number): Card {
  if (st.shoe.length < 20) st.shoe = newShoe(rng);
  return st.shoe.pop()!;
}

export function deal(
  prev: DuelState,
  rng: () => number,
  now: number,
): DuelState {
  const st: DuelState = {
    ...prev,
    shoe:
      prev.shoe.length < (52 * DECKS) / 4 ? newShoe(rng) : prev.shoe.slice(),
    hands: [[], []],
    doubled: [false, false],
    result: null,
    ready: [false, false],
    round: prev.round + 1,
    phase: 'player',
    log: [],
  };
  const p = playerOf(st);
  for (let i = 0; i < 2; i++) {
    st.hands[p].push(draw(st, rng));
    st.hands[st.banker].push(draw(st, rng));
  }
  if (isNatural(st.hands[0]) || isNatural(st.hands[1])) return settle(st);
  st.deadline = now + TURN_MS;
  return st;
}

function settle(st: DuelState): DuelState {
  const p = playerOf(st);
  const b = st.banker;
  const tp = total(st.hands[p]);
  const tb = total(st.hands[b]);
  const mult = (st.doubled[0] ? 2 : 1) * (st.doubled[1] ? 2 : 1);
  const base = st.opts.stake * mult;
  let winner: Seat | null;
  let amount = base;
  let reason: string;
  const np = isNatural(st.hands[p]);
  const nb = isNatural(st.hands[b]);
  if (np && nb) {
    winner = null;
    reason = '双方黑杰克，平局';
  } else if (np || nb) {
    winner = np ? p : b;
    amount = Math.round(base * 1.5);
    reason = `${np ? '闲家' : '庄家'}黑杰克，赢 1.5 倍`;
  } else if (tp > 21) {
    winner = b;
    reason = '闲家爆牌';
  } else if (tb > 21) {
    winner = p;
    reason = '庄家爆牌';
  } else if (tp === tb) {
    winner = null;
    reason = `${tp} 点平局，退回底注`;
  } else {
    winner = tp > tb ? p : b;
    reason = `${Math.max(tp, tb)} 点对 ${Math.min(tp, tb)} 点`;
  }
  const loser = winner === null ? null : other(winner);
  if (loser !== null) amount = Math.min(amount, st.chips[loser]);
  const delta: [number, number] = [0, 0];
  if (winner !== null && loser !== null) {
    delta[winner] = amount;
    delta[loser] = -amount;
  }
  const chips: [number, number] = [
    st.chips[0] + delta[0],
    st.chips[1] + delta[1],
  ];
  const over = chips[0] < st.opts.stake || chips[1] < st.opts.stake;
  return {
    ...st,
    chips,
    phase: over ? 'over' : 'done',
    deadline: null,
    result: {
      winner,
      delta,
      totals: [total(st.hands[0]), total(st.hands[1])],
      why: reason,
    },
  };
}

function advance(st: DuelState, now: number): DuelState {
  if (st.phase === 'player') {
    if (total(st.hands[playerOf(st)]) > 21) return settle(st);
    return { ...st, phase: 'banker', deadline: now + TURN_MS };
  }
  return settle(st);
}

function canDouble(st: DuelState, seat: Seat) {
  const mult = (st.doubled[0] ? 2 : 1) * (st.doubled[1] ? 2 : 1) * 2;
  return (
    actor(st) === seat &&
    st.hands[seat].length === 2 &&
    !st.doubled[seat] &&
    st.chips[0] >= st.opts.stake * mult &&
    st.chips[1] >= st.opts.stake * mult
  );
}

const NAMES = ['要牌', '停牌', '加倍'];

export const blackjackDuel: GameModule<DuelState, DuelOptions> = {
  id: 'blackjack-duel',
  seats: 2,
  options(raw) {
    const o = (raw ?? {}) as { stake?: unknown };
    const stake = o.stake ?? 20;
    if (stake !== 10 && stake !== 20 && stake !== 50)
      throw new Error('底注只能是 10、20 或 50');
    return { stake, chips: 1000 };
  },
  create(opts, rng) {
    return {
      opts,
      shoe: newShoe(rng),
      chips: [opts.chips, opts.chips],
      banker: 0,
      round: 0,
      started: false,
      phase: 'deal',
      hands: [[], []],
      doubled: [false, false],
      deadline: null,
      result: null,
      ready: [false, false],
      log: [],
    };
  },
  presence(st, online, now) {
    if (!st.started && online[0] && online[1])
      // Room creator plays first as 闲; seat 1 banks the first round.
      return deal(
        { ...st, started: true, banker: 1, round: 0 },
        Math.random,
        now,
      );
    return st;
  },
  act(st0, seat, raw, rng, now) {
    const a = (raw ?? {}) as { type?: unknown };
    if (a.type === 'next' || a.type === 'rematch') {
      if (a.type === 'next' && st0.phase !== 'done')
        return { error: '这一局还没结束' };
      if (a.type === 'rematch' && st0.phase !== 'over')
        return { error: '比赛还没结束' };
      const ready: [boolean, boolean] = [...st0.ready];
      ready[seat] = true;
      if (!ready[0] || !ready[1]) return { state: { ...st0, ready } };
      const base =
        a.type === 'rematch'
          ? {
              ...st0,
              chips: [st0.opts.chips, st0.opts.chips] as [number, number],
              round: 0,
            }
          : st0;
      return { state: deal({ ...base, banker: other(st0.banker) }, rng, now) };
    }
    if (actor(st0) !== seat) return { error: '还没轮到你' };
    const st: DuelState = {
      ...st0,
      hands: [st0.hands[0].slice(), st0.hands[1].slice()],
      doubled: [...st0.doubled],
      shoe: st0.shoe.slice(),
      log: st0.log.slice(),
    };
    const role = seat === st.banker ? '庄家' : '闲家';
    if (a.type === 'hit') {
      st.hands[seat].push(draw(st, rng));
      st.log.push(`${role}${NAMES[0]}`);
      if (total(st.hands[seat]) >= 21) return { state: advance(st, now) };
      return { state: { ...st, deadline: now + TURN_MS } };
    }
    if (a.type === 'stand') {
      st.log.push(`${role}${NAMES[1]}`);
      return { state: advance(st, now) };
    }
    if (a.type === 'double') {
      if (!canDouble(st0, seat)) return { error: '现在不能加倍' };
      st.doubled[seat] = true;
      st.hands[seat].push(draw(st, rng));
      st.log.push(`${role}${NAMES[2]}`);
      return { state: advance(st, now) };
    }
    return { error: '未知操作' };
  },
  nextTick: (st) => st.deadline,
  tick(st, _rng, now) {
    if (st.deadline === null || now < st.deadline) return st;
    const who = actor(st);
    if (who === null) return { ...st, deadline: null };
    return advance(
      {
        ...st,
        log: [
          ...st.log,
          `${who === st.banker ? '庄家' : '闲家'}超时，自动停牌`,
        ],
      },
      now,
    );
  },
  view(st, seat) {
    const reveal = st.phase === 'done' || st.phase === 'over';
    const hands = st.hands.map((h, i) =>
      h.map((c, k) => (k === 0 && !reveal && i !== seat ? null : c)),
    ) as DuelView['hands'];
    const totals = st.hands.map((h, i) =>
      reveal || i === seat ? (h.length ? total(h) : null) : null,
    ) as DuelView['totals'];
    return {
      you: seat,
      stake: st.opts.stake,
      chips: st.chips,
      banker: st.banker,
      round: st.round,
      started: st.started,
      phase: st.phase,
      hands,
      totals,
      doubled: st.doubled,
      deadline: st.deadline,
      result: st.result,
      ready: st.ready,
      shoeLeft: st.shoe.length,
      canDouble: seat !== null && canDouble(st, seat),
      log: st.log,
    } satisfies DuelView;
  },
};
