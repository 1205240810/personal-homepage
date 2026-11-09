// 军棋联机 1v1：服务器保存双方真实阵型并当裁判，校验每一步（含工兵铁路拐弯），
// 每位玩家只收到 maskFor(自己)：自己的棋子、对方棋子的位置和交战胜负。
import {
  PIECES,
  deploy,
  maskFor,
  newGame,
  parseMove,
  play,
  resign,
  type JunqiState,
  type JunqiView,
  type Layout,
  type Side,
} from '../games/junqi.ts';
import type { GameModule, Seat } from './protocol.ts';

export type JunqiOnlineOptions = {
  creator: 'first' | 'second' | 'random';
  /** 明棋：双方棋子全部公开。 */
  open: boolean;
};
export type JunqiOnlineState = {
  opts: JunqiOnlineOptions;
  /** 每个座位执哪一方（0 = 红，先走）。 */
  sides: [Side, Side];
  game: JunqiState;
  started: boolean;
  positionRevision: number;
  rematch: [boolean, boolean];
  score: [number, number];
};
export type JunqiOnlineView = {
  you: Side | null;
  sides: [Side, Side];
  open: boolean;
  game: JunqiView;
  started: boolean;
  positionRevision: number;
  rematch: [boolean, boolean];
  score: [number, number];
};

function parseLayout(raw: unknown): Layout | null {
  if (
    !Array.isArray(raw) ||
    raw.length !== PIECES ||
    !raw.every((k) => Number.isInteger(k) && k >= 0 && k <= 11)
  )
    return null;
  return raw as Layout;
}

export const junqiOnline: GameModule<JunqiOnlineState, JunqiOnlineOptions> = {
  id: 'junqi',
  seats: 2,
  options(raw) {
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw)))
      throw new Error('房间选项无效');
    const o = (raw ?? {}) as Record<string, unknown>;
    const creator = o.creator ?? 'random';
    if (creator !== 'first' && creator !== 'second' && creator !== 'random')
      throw new Error('先后手选项无效');
    if (o.open !== undefined && typeof o.open !== 'boolean')
      throw new Error('明暗棋选项无效');
    return { creator, open: o.open === true };
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
      game: newGame(),
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
      layout?: unknown;
      positionRevision?: unknown;
    };
    const me = s.sides[seat];
    const over = s.game.phase === 'over';
    const bump = (game: JunqiState): JunqiOnlineState => {
      const score: [number, number] = [...s.score];
      if (game.phase === 'over' && !over && game.winner !== null)
        score[s.sides[0] === game.winner ? 0 : 1]++;
      return { ...s, game, score, positionRevision: s.positionRevision + 1 };
    };
    switch (a.type) {
      case 'deploy': {
        if (!s.started) return { error: '等对手入座后再布阵' };
        if (s.game.phase !== 'deploy') return { error: '已经开战' };
        if (s.game.ready[me]) return { error: '你已经布好阵了' };
        // 双方可以同时提交；仅容许对方本局布阵造成的一次版本更新，
        // 不能把上一局延迟送达的阵型应用到已经交换红蓝的新局。
        const beforeOpponent =
          s.positionRevision - Number(s.game.ready[(1 - me) as Side]);
        if (
          a.positionRevision !== s.positionRevision &&
          a.positionRevision !== beforeOpponent
        )
          return { error: '棋局已更新，请核对后重新操作' };
        const layout = parseLayout(a.layout);
        if (!layout) return { error: '布阵数据无效' };
        try {
          return { state: bump(deploy(s.game, me, layout)) };
        } catch (e) {
          return { error: e instanceof Error ? e.message : '布阵不合规' };
        }
      }
      case 'move': {
        if (a.positionRevision !== s.positionRevision)
          return { error: '棋局已更新，请核对后重新操作' };
        if (s.game.phase !== 'play') return { error: '现在不能走棋' };
        if (s.game.toPlay !== me) return { error: '还没轮到你' };
        const m = parseMove(a.move);
        if (!m) return { error: '着法无效' };
        try {
          return { state: bump(play(s.game, m)) };
        } catch (e) {
          return { error: e instanceof Error ? e.message : '着法无效' };
        }
      }
      case 'resign':
        if (a.positionRevision !== s.positionRevision)
          return { error: '棋局已更新，请核对后重新操作' };
        if (s.game.phase !== 'play') return { error: '现在不能认输' };
        return { state: bump(resign(s.game, me)) };
      case 'rematch': {
        if (a.positionRevision !== s.positionRevision)
          return { error: '棋局已更新，请核对后重新操作' };
        if (!over) return { error: '对局还没结束' };
        const rematch: [boolean, boolean] = [...s.rematch];
        rematch[seat as Seat] = true;
        if (!rematch[0] || !rematch[1]) return { state: { ...s, rematch } };
        return {
          state: {
            ...s,
            sides: [s.sides[1], s.sides[0]],
            game: newGame(),
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
    const you = seat === null ? null : s.sides[seat];
    return {
      you,
      sides: s.sides,
      open: s.opts.open,
      game: maskFor(s.game, you, s.opts.open),
      started: s.started,
      positionRevision: s.positionRevision,
      rematch: s.rematch,
      score: s.score,
    } satisfies JunqiOnlineView;
  },
};
