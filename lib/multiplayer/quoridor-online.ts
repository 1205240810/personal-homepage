// 步步为营联机 1v1：服务器校验每一步（走子、跳跃、放墙不堵死路线），
// 认输，再来一局交换先后手。
import {
  newGame,
  parseMove,
  play,
  resign,
  type QuoridorState,
  type Side,
} from '../games/quoridor.ts';
import type { GameModule, Seat } from './protocol.ts';

export type QuoridorOnlineOptions = { creator: 'first' | 'second' | 'random' };
export type QuoridorOnlineState = {
  opts: QuoridorOnlineOptions;
  /** Board side (0 = 朱, moves first) for each seat. */
  sides: [Side, Side];
  game: QuoridorState;
  started: boolean;
  positionRevision: number;
  rematch: [boolean, boolean];
  score: [number, number];
};
export type QuoridorOnlineView = {
  you: Side | null;
  sides: [Side, Side];
  game: QuoridorState;
  started: boolean;
  positionRevision: number;
  rematch: [boolean, boolean];
  score: [number, number];
};

export const quoridorOnline: GameModule<
  QuoridorOnlineState,
  QuoridorOnlineOptions
> = {
  id: 'quoridor',
  seats: 2,
  options(raw) {
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw)))
      throw new Error('房间选项无效');
    const creator =
      ((raw ?? {}) as Record<string, unknown>).creator ?? 'random';
    if (creator !== 'first' && creator !== 'second' && creator !== 'random')
      throw new Error('先后手选项无效');
    return { creator };
  },
  create(opts, rng) {
    const first: Side =
      opts.creator === 'first'
        ? 0
        : opts.creator === 'second'
          ? 1
          : rng() < 0.5
            ? 0
            : 1;
    return {
      opts,
      sides: [first, (1 - first) as Side],
      game: newGame(0),
      started: false,
      positionRevision: 0,
      rematch: [false, false],
      score: [0, 0],
    };
  },
  presence(s, online) {
    if (!s.started && online[0] && online[1]) return { ...s, started: true };
    return s;
  },
  act(s, seat, raw) {
    const a = (raw ?? {}) as {
      type?: unknown;
      move?: unknown;
      positionRevision?: unknown;
    };
    if (a.positionRevision !== s.positionRevision)
      return { error: '棋局已更新，请核对后重新操作' };
    const me = s.sides[seat];
    const over = s.game.winner !== null;
    const finish = (game: QuoridorState): QuoridorOnlineState => {
      const score: [number, number] = [...s.score];
      if (game.winner !== null && !over)
        score[s.sides[0] === game.winner ? 0 : 1]++;
      return { ...s, game, score, positionRevision: s.positionRevision + 1 };
    };
    switch (a.type) {
      case 'move': {
        if (!s.started) return { error: '等对手入座后再开始' };
        if (over) return { error: '对局已结束' };
        if (s.game.toPlay !== me) return { error: '还没轮到你' };
        const m = parseMove(a.move);
        if (!m) return { error: '着法无效' };
        try {
          return { state: finish(play(s.game, m)) };
        } catch (e) {
          return { error: e instanceof Error ? e.message : '着法无效' };
        }
      }
      case 'resign':
        if (!s.started || over) return { error: '现在不能认输' };
        return { state: finish(resign(s.game, me)) };
      case 'rematch': {
        if (!over) return { error: '对局还没结束' };
        const rematch: [boolean, boolean] = [...s.rematch];
        rematch[seat as Seat] = true;
        if (!rematch[0] || !rematch[1]) return { state: { ...s, rematch } };
        return {
          state: {
            ...s,
            sides: [s.sides[1], s.sides[0]],
            game: newGame(0),
            positionRevision: s.positionRevision + 1,
            rematch: [false, false],
          },
        };
      }
      default:
        return { error: '未知操作' };
    }
  },
  view(s, seat) {
    return {
      you: seat === null ? null : s.sides[seat],
      sides: s.sides,
      game: s.game,
      started: s.started,
      positionRevision: s.positionRevision,
      rematch: s.rematch,
      score: s.score,
    } satisfies QuoridorOnlineView;
  },
};
