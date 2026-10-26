// 围棋联机 1v1: server-authoritative rules on top of lib/games/go.ts.
// Undo needs the opponent's consent; scoring marks dead stones together (the
// estimator pre-marks them) and both players must confirm the same set.
import {
  BLACK,
  GO_SIZES,
  WHITE,
  komiFor,
  newGame,
  play,
  score,
  toggleDead,
  type GoState,
  type Player,
} from '../games/go.ts';
import { guessDead } from '../games/go-ai.ts';
import type { GameModule, Seat } from './protocol.ts';

export type GoOnlineOptions = {
  size: 9 | 13 | 19;
  /** Colour of the room creator (seat 0). */
  creator: 'black' | 'white' | 'random';
  handicap: number;
};

export type GoResult = {
  winner: Player;
  reason: 'score' | 'resign';
  black?: number;
  white?: number;
  margin?: number;
};

export type GoOnlineState = {
  opts: GoOnlineOptions;
  komi: number;
  /** Colour of each seat. */
  colors: [Player, Player];
  game: GoState;
  started: boolean;
  phase: 'play' | 'scoring' | 'over';
  dead: number[];
  confirmed: [boolean, boolean];
  undoFrom: Seat | null;
  result: GoResult | null;
  rematch: [boolean, boolean];
  lastError?: string;
};

export type GoOnlineView = {
  size: number;
  board: number[];
  toPlay: Player;
  moves: number[];
  captures: [number, number];
  komi: number;
  handicap: number;
  you: Player | null;
  colors: [Player, Player];
  started: boolean;
  phase: GoOnlineState['phase'];
  dead: number[];
  confirmed: [boolean, boolean];
  undoFrom: Seat | null;
  result: GoResult | null;
  rematch: [boolean, boolean];
  /** Live area count while scoring. */
  tally: { black: number; white: number } | null;
};

function fresh(opts: GoOnlineOptions, colors: [Player, Player]): GoOnlineState {
  return {
    opts,
    komi: komiFor(opts.handicap),
    colors,
    game: newGame(opts.size, opts.handicap),
    started: false,
    phase: 'play',
    dead: [],
    confirmed: [false, false],
    undoFrom: null,
    result: null,
    rematch: [false, false],
  };
}

function replay(opts: GoOnlineOptions, moves: number[]): GoState {
  let g = newGame(opts.size, opts.handicap);
  for (const m of moves) {
    const r = play(g, m);
    if (!r.ok) break;
    g = r.state;
  }
  return g;
}

const ok = (state: GoOnlineState) => ({ state });

export const goOnline: GameModule<GoOnlineState, GoOnlineOptions> = {
  id: 'go',
  seats: 2,
  options(raw) {
    const o = (raw ?? {}) as Partial<Record<keyof GoOnlineOptions, unknown>>;
    const size = o.size ?? 9;
    if (!(GO_SIZES as readonly unknown[]).includes(size))
      throw new Error('棋盘只能是 9、13 或 19 路');
    const creator = o.creator ?? 'random';
    if (creator !== 'black' && creator !== 'white' && creator !== 'random')
      throw new Error('执色无效');
    const handicap = o.handicap ?? 0;
    const max = size === 9 ? 5 : 9;
    if (
      typeof handicap !== 'number' ||
      !Number.isInteger(handicap) ||
      handicap < 0 ||
      handicap === 1 ||
      handicap > max
    )
      throw new Error(`让子数需为 0 或 2–${max}`);
    return { size: size as GoOnlineOptions['size'], creator, handicap };
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
    return fresh(opts, [first, first === BLACK ? WHITE : BLACK]);
  },
  presence(s, online) {
    if (!s.started && online[0] && online[1]) return { ...s, started: true };
    return s;
  },
  act(s, seat, raw) {
    const a = (raw ?? {}) as { type?: unknown; p?: unknown; accept?: unknown };
    const me = s.colors[seat];
    const opp = (1 - seat) as Seat;
    switch (a.type) {
      case 'move':
      case 'pass': {
        if (!s.started) return { error: '等对手入座后再开始' };
        if (s.phase !== 'play') return { error: '现在不能落子' };
        if (s.game.toPlay !== me) return { error: '还没轮到你' };
        const p = a.type === 'pass' ? -1 : a.p;
        if (
          typeof p !== 'number' ||
          !Number.isInteger(p) ||
          p < -1 ||
          p >= s.game.board.length
        )
          return { error: '落点无效' };
        const r = play(s.game, p);
        if (!r.ok) return { error: r.reason };
        const next: GoOnlineState = { ...s, game: r.state, undoFrom: null };
        if (r.state.passes >= 2) {
          next.phase = 'scoring';
          next.dead = guessDead(r.state, 160);
          next.confirmed = [false, false];
        }
        return ok(next);
      }
      case 'undo-request': {
        if (s.phase !== 'play') return { error: '现在不能悔棋' };
        const mine = movesBy(s, me);
        if (!mine) return { error: '你还没有落子' };
        return ok({ ...s, undoFrom: seat });
      }
      case 'undo-answer': {
        if (s.undoFrom !== opp) return { error: '对方没有请求悔棋' };
        if (a.accept !== true) return ok({ ...s, undoFrom: null });
        const asker = s.colors[opp];
        const moves = s.game.moves.slice();
        // Take back to just before the asker's last move.
        const firstColor = s.opts.handicap >= 2 ? WHITE : BLACK;
        let n = moves.length;
        while (n > 0 && colorOfMove(firstColor, n - 1) !== asker) n--;
        if (n === 0) return ok({ ...s, undoFrom: null });
        return ok({
          ...s,
          game: replay(s.opts, moves.slice(0, n - 1)),
          undoFrom: null,
        });
      }
      case 'resign': {
        if (s.phase === 'over') return { error: '对局已结束' };
        if (!s.started) return { error: '对局还没开始' };
        return ok({
          ...s,
          phase: 'over',
          result: { winner: s.colors[opp], reason: 'resign' },
        });
      }
      case 'toggle-dead': {
        if (s.phase !== 'scoring') return { error: '现在不是点目阶段' };
        const p = a.p;
        if (typeof p !== 'number' || !s.game.board[p])
          return { error: '这里没有棋子' };
        const dead = toggleDead(s.game, new Set(s.dead), p);
        return ok({ ...s, dead: [...dead], confirmed: [false, false] });
      }
      case 'confirm': {
        if (s.phase !== 'scoring') return { error: '现在不是点目阶段' };
        const confirmed: [boolean, boolean] = [...s.confirmed];
        confirmed[seat] = true;
        if (!confirmed[0] || !confirmed[1]) return ok({ ...s, confirmed });
        const sc = score(s.game, s.komi, new Set(s.dead));
        return ok({
          ...s,
          confirmed,
          phase: 'over',
          result: {
            winner: sc.winner,
            reason: 'score',
            black: sc.black,
            white: sc.white,
            margin: sc.margin,
          },
        });
      }
      case 'resume': {
        if (s.phase !== 'scoring') return { error: '现在不是点目阶段' };
        // Disagreement: play on. Passes reset so two more are needed.
        return ok({
          ...s,
          phase: 'play',
          dead: [],
          confirmed: [false, false],
          game: { ...s.game, passes: 0 },
        });
      }
      case 'rematch': {
        if (s.phase !== 'over') return { error: '对局还没结束' };
        const rematch: [boolean, boolean] = [...s.rematch];
        rematch[seat] = true;
        if (!rematch[0] || !rematch[1]) return ok({ ...s, rematch });
        // Swap colours for the next game.
        const next = fresh(s.opts, [s.colors[1], s.colors[0]]);
        return ok({ ...next, started: true });
      }
      default:
        return { error: '未知操作' };
    }
  },
  view(s, seat) {
    const tally =
      s.phase === 'scoring'
        ? (() => {
            const sc = score(s.game, s.komi, new Set(s.dead));
            return { black: sc.black, white: sc.white };
          })()
        : null;
    return {
      size: s.game.size,
      board: [...s.game.board],
      toPlay: s.game.toPlay,
      moves: s.game.moves,
      captures: [s.game.captures[BLACK], s.game.captures[WHITE]],
      komi: s.komi,
      handicap: s.opts.handicap,
      you: seat === null ? null : s.colors[seat],
      colors: s.colors,
      started: s.started,
      phase: s.phase,
      dead: s.dead,
      confirmed: s.confirmed,
      undoFrom: s.undoFrom,
      result: s.result,
      rematch: s.rematch,
      tally,
    } satisfies GoOnlineView;
  },
};

function colorOfMove(first: Player, i: number): Player {
  return i % 2 === 0 ? first : first === BLACK ? WHITE : BLACK;
}

function movesBy(s: GoOnlineState, c: Player) {
  const first = s.opts.handicap >= 2 ? WHITE : BLACK;
  return s.game.moves.some((_, i) => colorOfMove(first, i) === c);
}
