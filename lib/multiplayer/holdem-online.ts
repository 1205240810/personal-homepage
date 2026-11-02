// 德州联机：两位玩家 + 1–3 位 AI 同桌。服务器发牌、运行 AI（复用单机练习桌的
// 引擎与 AI 性格），每位玩家只收到自己的底牌；摊牌时才公开未弃牌玩家的底牌。
// 玩家每次行动限时 30 秒，超时能过牌就过牌，否则弃牌。筹码输光自动补码（记入
// 补码次数），牌局可以一直打下去。
import {
  act as engineAct,
  actionLabel,
  legalActions,
  shuffledDeck,
  startHand,
  type HoldemState,
  type PokerAction,
  type Street,
} from '../games/holdem-engine.ts';
import {
  decideBot,
  type AiDifficulty,
  type BotStyle,
} from '../games/holdem-strategy.ts';
import type { GameModule, Seat } from './protocol.ts';

export type HoldemOptions = {
  bots: 1 | 2 | 3;
  difficulty: AiDifficulty;
  stack: number;
  styles: BotStyle[];
};

export const AI_PERSONAS: { name: string; style: BotStyle }[] = [
  { name: '灯塔', style: 'careful' },
  { name: '疾风', style: 'active' },
  { name: '帷幕', style: 'tricky' },
];
export const TURN_MS = 30_000;
export const AI_DELAY_MS = 900;
export const NEXT_HAND_MS = 7_000;

export type TableSeat =
  | { kind: 'human'; player: Seat }
  | { kind: 'ai'; name: string; style: BotStyle };

export type OnlineHoldemState = {
  opts: HoldemOptions;
  seats: TableSeat[];
  /** Table seat index for room seat 0 / 1. */
  humanAt: [number, number];
  started: boolean;
  game: HoldemState | null;
  stacks: number[];
  rebuys: number[];
  button: number;
  deadline: number | null;
  ready: [boolean, boolean];
  timeouts: string[];
};

export type HoldemSeatView = {
  name: string;
  kind: 'human' | 'ai';
  player: Seat | null;
  style: BotStyle | null;
  stack: number;
  bet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** null = hidden; [] = no cards this hand. */
  cards: number[] | null;
  rebuys: number;
  label: string | null;
  won: number;
};

export type HoldemOnlineView = {
  you: Seat | null;
  me: number | null;
  started: boolean;
  hand: number;
  street: Street | null;
  board: number[];
  pot: number;
  button: number;
  toAct: number | null;
  blinds: [number, number];
  seats: HoldemSeatView[];
  deadline: number | null;
  legal: null | {
    call: number;
    canCheck: boolean;
    canRaise: boolean;
    minTo: number;
    maxTo: number;
    pot: number;
  };
  log: { seat: number; street: string; text: string }[];
  result: null | {
    winners: number[];
    reason: 'fold' | 'showdown';
    pot: number;
  };
  ready: [boolean, boolean];
  difficulty: AiDifficulty;
};

function layout(bots: number, styles: BotStyle[]) {
  const size = bots + 2;
  const humanAt: [number, number] = [0, Math.floor(size / 2)];
  const seats: TableSeat[] = [];
  let ai = 0;
  for (let i = 0; i < size; i++)
    seats.push(
      i === humanAt[0]
        ? { kind: 'human', player: 0 }
        : i === humanAt[1]
          ? { kind: 'human', player: 1 }
          : { kind: 'ai', ...AI_PERSONAS[ai], style: styles[ai++] },
    );
  return { seats, humanAt };
}

const blinds = (o: HoldemOptions): [number, number] => [
  Math.max(1, Math.round(o.stack / 200)),
  Math.max(2, Math.round(o.stack / 100)),
];

function deal(st: OnlineHoldemState, rng: () => number, now: number) {
  const stacks = st.stacks.slice();
  const rebuys = st.rebuys.slice();
  for (let i = 0; i < stacks.length; i++)
    if (stacks[i] <= 0) {
      stacks[i] = st.opts.stack;
      rebuys[i]++;
    }
  const [sb, bb] = blinds(st.opts);
  const button = st.game ? (st.button + 1) % stacks.length : st.button;
  const game = startHand({
    hand: (st.game?.hand ?? 0) + 1,
    button,
    tableSize: stacks.length,
    smallBlind: sb,
    bigBlind: bb,
    initialStack: st.opts.stack,
    stacks,
    deck: shuffledDeck(rng),
  });
  return schedule(
    {
      ...st,
      game,
      stacks,
      rebuys,
      button,
      ready: [false, false] as [boolean, boolean],
      timeouts: [],
    },
    now,
  );
}

/** Set the deadline for whoever must act next (AI delay, human clock, next hand). */
function schedule(st: OnlineHoldemState, now: number): OnlineHoldemState {
  const g = st.game;
  if (!g) return { ...st, deadline: null };
  if (g.result)
    return { ...st, stacks: g.stacks.slice(), deadline: now + NEXT_HAND_MS };
  if (g.toAct === null) return { ...st, deadline: null };
  return {
    ...st,
    deadline: now + (st.seats[g.toAct].kind === 'ai' ? AI_DELAY_MS : TURN_MS),
  };
}

function parseAction(raw: unknown): PokerAction | null {
  const a = (raw ?? {}) as { type?: unknown; to?: unknown };
  if (a.type === 'fold' || a.type === 'check' || a.type === 'call')
    return { type: a.type };
  if (a.type === 'raise' && Number.isSafeInteger(a.to))
    return { type: 'raise', to: a.to as number };
  return null;
}

function applyAction(
  st: OnlineHoldemState,
  action: PokerAction,
  now: number,
): OnlineHoldemState {
  return schedule({ ...st, game: engineAct(st.game!, action) }, now);
}

export const holdemOnline: GameModule<OnlineHoldemState, HoldemOptions> = {
  id: 'holdem',
  seats: 2,
  options(raw) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const bots = o.bots ?? 2;
    if (bots !== 1 && bots !== 2 && bots !== 3)
      throw new Error('AI 数量只能是 1–3');
    const difficulty = o.difficulty ?? 'standard';
    if (
      difficulty !== 'casual' &&
      difficulty !== 'standard' &&
      difficulty !== 'advanced'
    )
      throw new Error('未知 AI 难度');
    const stack = o.stack ?? 1000;
    if (stack !== 500 && stack !== 1000 && stack !== 2000)
      throw new Error('起始筹码只能是 500、1000 或 2000');
    const styles = o.styles ?? AI_PERSONAS.slice(0, bots).map((s) => s.style);
    if (
      !Array.isArray(styles) ||
      styles.length !== bots ||
      !styles.every((s) =>
        ['balanced', 'careful', 'active', 'tricky'].includes(s),
      )
    )
      throw new Error('请为每位 AI 选择均衡、稳健、积极或灵活风格');
    return { bots, difficulty, stack, styles: styles.slice() as BotStyle[] };
  },
  create(opts) {
    const { seats, humanAt } = layout(opts.bots, opts.styles);
    return {
      opts,
      seats,
      humanAt,
      started: false,
      game: null,
      stacks: seats.map(() => opts.stack),
      rebuys: seats.map(() => 0),
      button: 0,
      deadline: null,
      ready: [false, false],
      timeouts: [],
    };
  },
  presence(st, online, now) {
    if (!st.started && online[0] && online[1])
      return deal({ ...st, started: true }, Math.random, now);
    return st;
  },
  act(st, seat, raw, rng, now) {
    if (st.deadline !== null && now >= st.deadline)
      return { error: '本次行动已超时，请等待牌桌更新' };
    const a = (raw ?? {}) as { type?: unknown };
    if (a.type === 'next') {
      if (!st.game?.result) return { error: '这一手还没结束' };
      const ready: [boolean, boolean] = [...st.ready];
      ready[seat] = true;
      if (!ready[0] || !ready[1]) return { state: { ...st, ready } };
      return { state: deal(st, rng, now) };
    }
    const g = st.game;
    if (!g || g.result || g.toAct !== st.humanAt[seat])
      return { error: '还没轮到你' };
    const action = parseAction(raw);
    if (!action) return { error: '未知操作' };
    try {
      return { state: applyAction(st, action, now) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : '操作无效' };
    }
  },
  nextTick: (st) => st.deadline,
  tick(st, rng, now) {
    if (st.deadline === null || now < st.deadline) return st;
    const g = st.game;
    if (!g) return { ...st, deadline: null };
    if (g.result) return deal(st, rng, now);
    if (g.toAct === null) return { ...st, deadline: null };
    const who = st.seats[g.toAct];
    if (who.kind === 'ai') {
      let action: PokerAction;
      try {
        action = decideBot(
          g,
          g.toAct,
          who.style,
          st.opts.difficulty,
          st.seats.map((s) => (s.kind === 'ai' ? s.style : 'balanced')),
        ).action;
      } catch {
        action = legalActions(g)?.canCheck
          ? { type: 'check' }
          : { type: 'fold' };
      }
      return applyAction(st, action, now);
    }
    const legal = legalActions(g);
    return applyAction(
      { ...st, timeouts: [...st.timeouts, `玩家 ${who.player + 1} 超时`] },
      legal?.canCheck ? { type: 'check' } : { type: 'fold' },
      now,
    );
  },
  view(st, seat) {
    const g = st.game;
    const me = seat === null ? null : st.humanAt[seat];
    const showdown = g?.result?.reason === 'showdown';
    const seats: HoldemSeatView[] = st.seats.map((s, i) => ({
      name: s.kind === 'ai' ? s.name : '',
      kind: s.kind,
      player: s.kind === 'human' ? s.player : null,
      style: s.kind === 'ai' ? s.style : null,
      stack: g ? g.stacks[i] : st.stacks[i],
      bet: g ? g.streetBets[i] : 0,
      committed: g && !g.result ? g.committed[i] : 0,
      folded: g ? g.folded[i] : false,
      allIn: g ? g.stacks[i] === 0 && !g.folded[i] : false,
      cards: !g
        ? []
        : i === me || (showdown && !g.folded[i])
          ? g.holes[i].slice()
          : null,
      rebuys: st.rebuys[i],
      label: showdown && !g!.folded[i] ? (g!.result!.labels[i] ?? null) : null,
      won: g?.result ? g.result.payouts[i] : 0,
    }));
    const legal =
      g && !g.result && me !== null && g.toAct === me ? legalActions(g) : null;
    return {
      you: seat,
      me,
      started: st.started,
      hand: g?.hand ?? 0,
      street: g?.street ?? null,
      board: g ? g.board.slice() : [],
      pot: g
        ? g.result
          ? g.result.pot
          : g.committed.reduce((a, b) => a + b, 0)
        : 0,
      button: g?.button ?? st.button,
      toAct: g?.toAct ?? null,
      blinds: blinds(st.opts),
      seats,
      deadline: st.deadline,
      legal: legal && {
        call: legal.call,
        canCheck: legal.canCheck,
        canRaise: legal.canRaise,
        minTo: legal.minTo,
        maxTo: legal.maxTo,
        pot: legal.pot,
      },
      log: (g?.actions ?? []).slice(-8).map((d) => ({
        seat: d.seat,
        street: d.street,
        text: actionLabel(d),
      })),
      result: g?.result
        ? {
            winners: g.result.winners.slice(),
            reason: g.result.reason,
            pot: g.result.pot,
          }
        : null,
      ready: st.ready,
      difficulty: st.opts.difficulty,
    } satisfies HoldemOnlineView;
  },
};
