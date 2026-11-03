// 丝路远行联机 1v1：牌局在服务器上进行，每位玩家只收到 viewFor(自己)——
// 对手手牌与牌堆顺序从不下发。轮末双方确认进入下一轮，终局双方确认再来一局。
import {
  apply,
  newGame,
  nextRound,
  parseMove,
  viewFor,
  type ExpeditionState,
  type ExpeditionView,
  type Side,
} from '../games/expedition.ts';
import type { GameModule } from './protocol.ts';

export type ExpeditionOnlineOptions = { rounds: 1 | 3 };
export type ExpeditionOnlineState = {
  opts: ExpeditionOnlineOptions;
  game: ExpeditionState | null;
  started: boolean;
  positionRevision: number;
  opener: Side;
  ready: [boolean, boolean];
  score: [number, number];
};
export type ExpeditionOnlineView = (
  | ExpeditionView
  | { you: Side | null; phase: 'waiting' }
) & {
  started: boolean;
  positionRevision: number;
  ready: [boolean, boolean];
  score: [number, number];
};

export const expeditionOnline: GameModule<
  ExpeditionOnlineState,
  ExpeditionOnlineOptions
> = {
  id: 'expedition',
  seats: 2,
  options(raw) {
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw)))
      throw new Error('房间选项无效');
    const rounds = ((raw ?? {}) as Record<string, unknown>).rounds ?? 3;
    if (rounds !== 1 && rounds !== 3) throw new Error('轮数无效');
    return { rounds };
  },
  create: (opts) => ({
    opts,
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
        game: newGame(Math.random, s.opener, s.opts.rounds),
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
      if (!m) return { error: '操作无效' };
      try {
        const next = apply(g, side, m);
        const score: [number, number] = [...s.score];
        if (next.phase === 'over' && (next.winner === 0 || next.winner === 1))
          score[next.winner]++;
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
      const opener = (1 - s.opener) as Side;
      return {
        state: {
          ...s,
          opener,
          ready: [false, false],
          positionRevision: s.positionRevision + 1,
          game: newGame(rng, opener, s.opts.rounds),
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
    } satisfies ExpeditionOnlineView;
  },
};
