// 花街七席联机 1v1：牌局完全在服务器上进行，每位玩家只收到 viewFor(自己) ——
// 对手手牌、对手藏牌（轮末前）、对手弃牌、暗抽的那张从不下发。
import {
  apply,
  newGame,
  nextRound,
  other,
  viewFor,
  type HanamiState,
  type HanamiView,
  type Move,
  type Side,
} from '../games/hanami.ts';
import type { GameModule } from './protocol.ts';

export type HanamiOnlineState = {
  game: HanamiState | null;
  started: boolean;
  /** Monotonic decision/round revision; also advances across rematches. */
  positionRevision: number;
  /** Who opens the next match. */
  opener: Side;
  ready: [boolean, boolean];
  score: [number, number];
};
export type HanamiOnlineView = HanamiView & {
  started: boolean;
  positionRevision: number;
  ready: [boolean, boolean];
  score: [number, number];
};

function parseMove(raw: unknown): Move | null {
  const m = (raw ?? {}) as { type?: unknown; cards?: unknown; index?: unknown };
  if (m.type === 'pick')
    return Number.isInteger(m.index)
      ? { type: 'pick', index: m.index as number }
      : null;
  if (
    (m.type === 'secret' ||
      m.type === 'discard' ||
      m.type === 'gift' ||
      m.type === 'contest') &&
    Array.isArray(m.cards) &&
    m.cards.length <= 4 &&
    m.cards.every((c) => Number.isInteger(c))
  )
    return { type: m.type, cards: m.cards } as Move;
  return null;
}

export const hanamiOnline: GameModule<
  HanamiOnlineState,
  Record<string, never>
> = {
  id: 'hanami',
  seats: 2,
  options: () => ({}),
  create: () => ({
    game: null,
    started: false,
    positionRevision: 0,
    opener: 0,
    ready: [false, false],
    score: [0, 0],
  }),
  presence(s, online, _now) {
    if (!s.started && online[0] && online[1])
      return {
        ...s,
        started: true,
        positionRevision: s.positionRevision + 1,
        game: newGame(Math.random, s.opener),
      };
    return s;
  },
  act(s, seat, raw, rng) {
    const a = (raw ?? {}) as {
      type?: unknown;
      move?: unknown;
      positionRevision?: unknown;
    };
    const g = s.game;
    if (!g) return { error: '等对手入座后再开始' };
    if (a.positionRevision !== s.positionRevision)
      return { error: '牌局已更新，请核对后重新操作' };
    const side = seat as Side;
    if (a.type === 'move') {
      const m = parseMove(a.move);
      if (!m) return { error: '出牌无效' };
      try {
        const next = apply(g, side, m);
        const score: [number, number] = [...s.score];
        if (next.phase === 'over' && next.result?.winner != null)
          score[next.result.winner]++;
        return {
          state: {
            ...s,
            game: next,
            score,
            positionRevision: s.positionRevision + 1,
          },
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : '出牌无效' };
      }
    }
    if (a.type === 'next' || a.type === 'rematch') {
      const want = a.type === 'next' ? 'round-end' : 'over';
      if (g.phase !== want)
        return { error: a.type === 'next' ? '这一轮还没结束' : '这局还没结束' };
      const ready: [boolean, boolean] = [...s.ready];
      ready[seat] = true;
      if (!ready[0] || !ready[1]) return { state: { ...s, ready } };
      if (a.type === 'next')
        return {
          state: {
            ...s,
            ready: [false, false],
            game: nextRound(g, rng),
            positionRevision: s.positionRevision + 1,
          },
        };
      const opener = other(s.opener);
      return {
        state: {
          ...s,
          opener,
          ready: [false, false],
          positionRevision: s.positionRevision + 1,
          game: newGame(rng, opener),
        },
      };
    }
    return { error: '未知操作' };
  },
  view(s, seat) {
    const base = s.game
      ? viewFor(s.game, seat as Side | null)
      : ({
          you: seat,
          phase: 'play',
          hand: [],
          played: [[], []],
        } as unknown as HanamiView);
    return {
      ...base,
      started: s.started,
      positionRevision: s.positionRevision,
      ready: s.ready,
      score: s.score,
    } satisfies HanamiOnlineView;
  },
};
