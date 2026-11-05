// 琉璃坊联机 1v1：服务器校验每一步并负责从袋中补砖（袋中顺序不下发）。
import {
  apply,
  newGame,
  parseMove,
  viewFor,
  type GlazeState,
  type GlazeView,
  type Side,
} from '../games/glaze.ts';
import type { GameModule } from './protocol.ts';

export type GlazeOnlineState = {
  game: GlazeState | null;
  started: boolean;
  positionRevision: number;
  opener: Side;
  ready: [boolean, boolean];
  score: [number, number];
};
export type GlazeOnlineView = (
  | GlazeView
  | { you: Side | null; phase: 'waiting' }
) & {
  started: boolean;
  positionRevision: number;
  ready: [boolean, boolean];
  score: [number, number];
};

export const glazeOnline: GameModule<
  GlazeOnlineState,
  Record<string, never>
> = {
  id: 'glaze',
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
        const next = apply(g, seat as Side, m, rng);
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
    if (a.type === 'rematch') {
      if (g.phase !== 'over') return { error: '这局还没结束' };
      const ready: [boolean, boolean] = [...s.ready];
      ready[seat] = true;
      if (!ready[0] || !ready[1]) return { state: { ...s, ready } };
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
    } satisfies GlazeOnlineView;
  },
};
