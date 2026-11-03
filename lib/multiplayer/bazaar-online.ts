// 刺桐市集联机 1v1：牌局在服务器上进行，每位玩家只收到 viewFor(自己)——
// 对手手牌、货栈顺序、赏银面值（本局结束前）从不下发。
import {
  apply,
  newGame,
  nextRound,
  parseMove,
  viewFor,
  type BazaarState,
  type BazaarView,
  type Side,
} from '../games/bazaar.ts';
import type { GameModule } from './protocol.ts';

export type BazaarOnlineState = {
  game: BazaarState | null;
  started: boolean;
  positionRevision: number;
  opener: Side;
  ready: [boolean, boolean];
  score: [number, number];
};
export type BazaarOnlineView = (
  | BazaarView
  | { you: Side | null; phase: 'waiting' }
) & {
  started: boolean;
  positionRevision: number;
  ready: [boolean, boolean];
  score: [number, number];
};

export const bazaarOnline: GameModule<
  BazaarOnlineState,
  Record<string, never>
> = {
  id: 'bazaar',
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
  presence(s, online) {
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
    if (a.type === 'move') {
      const m = parseMove(a.move);
      if (!m) return { error: '操作无效' };
      try {
        const next = apply(g, seat as Side, m);
        const score: [number, number] = [...s.score];
        if (next.phase === 'over' && next.winner !== null) score[next.winner]++;
        return {
          state: {
            ...s,
            game: next,
            score,
            positionRevision: s.positionRevision + 1,
          },
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : '操作无效' };
      }
    }
    if (a.type === 'next' || a.type === 'rematch') {
      const want = a.type === 'next' ? 'round-end' : 'over';
      if (g.phase !== want)
        return { error: a.type === 'next' ? '这一局还没结束' : '这场还没结束' };
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
      const opener = (1 - s.opener) as Side;
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
      : { you: seat as Side | null, phase: 'waiting' as const };
    return {
      ...base,
      started: s.started,
      positionRevision: s.positionRevision,
      ready: s.ready,
      score: s.score,
    } satisfies BazaarOnlineView;
  },
};
