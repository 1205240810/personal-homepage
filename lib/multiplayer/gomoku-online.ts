// 五子棋联机 1v1：服务器校验落子与胜负（含可选禁手），悔棋需对方同意，
// 认输，再来一局交换黑白。
import {
  BLACK,
  WHITE,
  newGame,
  play,
  resign,
  undo,
  type GomokuState,
  type Player,
} from '../games/gomoku.ts';
import type { GameModule, Seat } from './protocol.ts';

export type GomokuOnlineOptions = {
  renju: boolean;
  creator: 'black' | 'white' | 'random';
};
export type GomokuOnlineState = {
  opts: GomokuOnlineOptions;
  colors: [Player, Player];
  game: GomokuState;
  started: boolean;
  undoFrom: Seat | null;
  rematch: [boolean, boolean];
  score: [number, number];
};
export type GomokuOnlineView = {
  you: Player | null;
  colors: [Player, Player];
  cells: number[];
  size: number;
  renju: boolean;
  toPlay: Player;
  moves: number[];
  winner: Player | 0 | null;
  line: number[] | null;
  reason: GomokuState['reason'];
  started: boolean;
  undoFrom: Seat | null;
  rematch: [boolean, boolean];
  score: [number, number];
};

const ok = (state: GomokuOnlineState) => ({ state });
const finish = (s: GomokuOnlineState, game: GomokuState): GomokuOnlineState => {
  const score: [number, number] = [...s.score];
  if (game.winner) score[s.colors[0] === game.winner ? 0 : 1]++;
  return { ...s, game, undoFrom: null, score };
};

export const gomokuOnline: GameModule<GomokuOnlineState, GomokuOnlineOptions> =
  {
    id: 'gomoku',
    seats: 2,
    options(raw) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const renju = o.renju ?? false;
      if (typeof renju !== 'boolean') throw new Error('禁手选项无效');
      const creator = o.creator ?? 'random';
      if (creator !== 'black' && creator !== 'white' && creator !== 'random')
        throw new Error('执色无效');
      return { renju, creator };
    },
    create(opts, rng) {
      const first: Player =
        opts.creator === 'black'
          ? BLACK
          : opts.creator === 'white'
            ? WHITE
            : rng() < 0.5
              ? BLACK
              : WHITE;
      return {
        opts,
        colors: [first, first === BLACK ? WHITE : BLACK],
        game: newGame(opts.renju),
        started: false,
        undoFrom: null,
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
        p?: unknown;
        accept?: unknown;
      };
      const me = s.colors[seat];
      const opp = (1 - seat) as Seat;
      const over = s.game.winner !== null;
      switch (a.type) {
        case 'move': {
          if (!s.started) return { error: '等对手入座后再开始' };
          if (over) return { error: '对局已结束' };
          if (s.game.toPlay !== me) return { error: '还没轮到你' };
          if (typeof a.p !== 'number') return { error: '落点无效' };
          try {
            return ok(finish(s, play(s.game, a.p)));
          } catch (e) {
            return { error: e instanceof Error ? e.message : '落点无效' };
          }
        }
        case 'undo-request': {
          if (over) return { error: '对局已结束' };
          const first = s.game.moves.length > 0 && me === BLACK;
          if (!first && s.game.moves.length < 2)
            return { error: '你还没有落子' };
          return ok({ ...s, undoFrom: seat });
        }
        case 'undo-answer': {
          if (s.undoFrom !== opp) return { error: '对方没有请求悔棋' };
          if (a.accept !== true) return ok({ ...s, undoFrom: null });
          // Take back to just before the asker's last stone.
          const asker = s.colors[opp];
          const n = s.game.moves.length;
          const lastByAsker = (n - 1) % 2 === (asker === BLACK ? 0 : 1) ? 1 : 2;
          return ok({
            ...s,
            game: undo(s.game, Math.min(n, lastByAsker)),
            undoFrom: null,
          });
        }
        case 'resign': {
          if (!s.started || over) return { error: '现在不能认输' };
          return ok(finish(s, resign(s.game, me)));
        }
        case 'rematch': {
          if (!over) return { error: '对局还没结束' };
          const rematch: [boolean, boolean] = [...s.rematch];
          rematch[seat] = true;
          if (!rematch[0] || !rematch[1]) return ok({ ...s, rematch });
          return ok({
            ...s,
            colors: [s.colors[1], s.colors[0]],
            game: newGame(s.opts.renju),
            undoFrom: null,
            rematch: [false, false],
          });
        }
        default:
          return { error: '未知操作' };
      }
    },
    view(s, seat) {
      return {
        you: seat === null ? null : s.colors[seat],
        colors: s.colors,
        cells: s.game.cells,
        size: s.game.size,
        renju: s.game.renju,
        toPlay: s.game.toPlay,
        moves: s.game.moves,
        winner: s.game.winner,
        line: s.game.line,
        reason: s.game.reason,
        started: s.started,
        undoFrom: s.undoFrom,
        rematch: s.rematch,
        score: s.score,
      } satisfies GomokuOnlineView;
    },
  };
