/**
 * 围棋 AI：UCT 蒙特卡洛树搜索 + RAVE（AMAF）+ 轻量随机对局（不填己方眼、优先提子/逃叫吃），
 * 树节点带启发式先验（提子、救叫吃、靠近上一手、开局避开一二线）。运行在 Web Worker 中。
 * 9×9 上最强；13×13 / 19×19 同样的计算量下明显更弱。
 */
import {
  BLACK,
  EMPTY,
  WHITE,
  isEyeish,
  neighbours,
  other,
  play,
  type GoState,
  type Player,
} from './go.ts';

export type GoLevel = 1 | 2 | 3 | 4;
export const GO_LEVELS: Record<
  GoLevel,
  { name: string; playouts: number; timeMs: number; note: string }
> = {
  1: { name: '入门', playouts: 150, timeMs: 300, note: '约 150 局随机模拟' },
  2: { name: '初级', playouts: 1200, timeMs: 1200, note: '约 1200 局模拟' },
  3: { name: '中级', playouts: 5000, timeMs: 2500, note: '约 5000 局模拟' },
  4: { name: '最强', playouts: 1e9, timeMs: 4000, note: '思考约 4 秒' },
};

type Rng = () => number;

/** Fast playout board helpers (mutate in place). */
function hasLiberty(
  b: Uint8Array,
  size: number,
  p: number,
  stamp: Uint32Array,
  tick: number,
) {
  const c = b[p];
  const stack = [p];
  stamp[p] = tick;
  while (stack.length) {
    const q = stack.pop()!;
    const x = q % size;
    const ns = [
      x > 0 ? q - 1 : -1,
      x < size - 1 ? q + 1 : -1,
      q - size,
      q + size,
    ];
    for (const n of ns) {
      if (n < 0 || n >= b.length) continue;
      if (b[n] === EMPTY) return true;
      if (b[n] === c && stamp[n] !== tick) {
        stamp[n] = tick;
        stack.push(n);
      }
    }
  }
  return false;
}
function removeGroup(b: Uint8Array, size: number, p: number) {
  const c = b[p];
  const stack = [p];
  b[p] = EMPTY;
  let n = 0;
  while (stack.length) {
    const q = stack.pop()!;
    n++;
    for (const r of neighbours(size, q))
      if (b[r] === c) {
        b[r] = EMPTY;
        stack.push(r);
      }
  }
  return n;
}
/** Group liberty count, capped at `cap`. */
function libCount(b: Uint8Array, size: number, p: number, cap: number) {
  const c = b[p];
  const seen = new Set<number>([p]);
  const libs = new Set<number>();
  const stack = [p];
  while (stack.length) {
    const q = stack.pop()!;
    for (const n of neighbours(size, q)) {
      if (b[n] === EMPTY) {
        libs.add(n);
        if (libs.size >= cap) return cap;
      } else if (b[n] === c && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return libs.size;
}

class Sim {
  stamp: Uint32Array;
  tick = 1;
  size: number;
  constructor(size: number) {
    this.size = size;
    this.stamp = new Uint32Array(size * size);
  }
  /** Try to play c at p on b (mutating). Returns captured count or -1 if illegal (suicide). */
  place(b: Uint8Array, p: number, c: number): number {
    const size = this.size;
    b[p] = c;
    const opp = c === BLACK ? WHITE : BLACK;
    let cap = 0;
    for (const n of neighbours(size, p))
      if (b[n] === opp && !hasLiberty(b, size, n, this.stamp, ++this.tick))
        cap += removeGroup(b, size, n);
    if (!cap && !hasLiberty(b, size, p, this.stamp, ++this.tick)) {
      b[p] = EMPTY;
      return -1;
    }
    return cap;
  }
}

/** Light playout policy: capture/escape near the last move, else random non-eye point. */
function playout(
  sim: Sim,
  board: Uint8Array,
  toPlay: Player,
  ko: number,
  rng: Rng,
  amaf: Uint8Array,
): Uint8Array {
  const size = sim.size;
  const b = board;
  let c: Player = toPlay;
  let passes = 0;
  let last = -1;
  const empties: number[] = [];
  for (let p = 0; p < b.length; p++) if (b[p] === EMPTY) empties.push(p);
  const maxMoves = b.length * 3;
  for (let mv = 0; mv < maxMoves && passes < 2; mv++) {
    let chosen = -1;
    // Heuristic: if the last move put a group in atari, capture it / escape.
    if (last >= 0 && rng() < 0.9) {
      for (const n of [last, ...neighbours(size, last)]) {
        if (b[n] === EMPTY) continue;
        if (libCount(b, size, n, 2) !== 1) continue;
        // Find its liberty.
        const lib = findLiberty(b, size, n);
        if (lib >= 0 && lib !== ko && !isEyeish(b, size, lib, c)) {
          const save = b.slice();
          if (sim.place(b, lib, c) >= 0) {
            // Escaping into a 1-liberty group is pointless; undo in that case.
            if (b[n] === c && libCount(b, size, lib, 2) < 2) {
              b.set(save);
            } else {
              chosen = lib;
              break;
            }
          }
        }
      }
    }
    if (chosen < 0) {
      for (let tries = empties.length; tries > 0; tries--) {
        const i = (rng() * empties.length) | 0;
        const p = empties[i];
        if (b[p] !== EMPTY) {
          empties[i] = empties[empties.length - 1];
          empties.pop();
          continue;
        }
        if (p === ko || isEyeish(b, size, p, c)) continue;
        if (sim.place(b, p, c) >= 0) {
          chosen = p;
          break;
        }
      }
    }
    if (chosen < 0) {
      passes++;
      ko = -1;
    } else {
      passes = 0;
      if (!amaf[chosen]) amaf[chosen] = c;
      ko = -1;
      last = chosen;
      // Refill empties lazily: captured points become empty again.
      if (empties.length < b.length / 4) {
        empties.length = 0;
        for (let p = 0; p < b.length; p++) if (b[p] === EMPTY) empties.push(p);
      }
    }
    c = c === BLACK ? WHITE : BLACK;
  }
  return b;
}
function findLiberty(b: Uint8Array, size: number, p: number) {
  const c = b[p];
  const seen = new Set<number>([p]);
  const stack = [p];
  while (stack.length) {
    const q = stack.pop()!;
    for (const n of neighbours(size, q)) {
      if (b[n] === EMPTY) return n;
      if (b[n] === c && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return -1;
}

/** Area score of a finished playout board (black minus white, before komi). */
function playoutScore(b: Uint8Array, size: number) {
  let s = 0;
  for (let p = 0; p < b.length; p++) {
    if (b[p] === BLACK) s++;
    else if (b[p] === WHITE) s--;
    else {
      let bl = 0;
      let wh = 0;
      for (const n of neighbours(size, p)) {
        if (b[n] === BLACK) bl++;
        else if (b[n] === WHITE) wh++;
      }
      if (bl && !wh) s++;
      else if (wh && !bl) s--;
    }
  }
  return s;
}

type Node = {
  move: number;
  player: Player; // who played `move`
  visits: number;
  wins: number;
  raveVisits: number;
  raveWins: number;
  prior: number;
  children: Node[] | null;
  state: GoState | null;
};

function priorFor(s: GoState, p: number): number {
  if (p < 0) return 0;
  const size = s.size;
  const me = s.toPlay;
  const opp = other(me);
  let v = 0;
  for (const n of neighbours(size, p)) {
    if (s.board[n] === opp && libCount(s.board, size, n, 2) === 1) v += 3; // capture
    if (s.board[n] === me && libCount(s.board, size, n, 2) === 1) v += 2; // save
  }
  const last = s.moves[s.moves.length - 1];
  if (last !== undefined && last >= 0) {
    const dx = Math.abs((last % size) - (p % size));
    const dy = Math.abs(Math.floor(last / size) - Math.floor(p / size));
    if (dx + dy <= 2) v += 1;
  }
  const x = p % size;
  const y = Math.floor(p / size);
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (s.moves.length < size * 2 && edge === 0) v -= 2;
  if (s.moves.length < size && edge === 1) v -= 1;
  return v;
}

function expand(node: Node) {
  const s = node.state!;
  const kids: Node[] = [];
  for (let p = 0; p < s.board.length; p++) {
    if (s.board[p] !== EMPTY || p === s.ko) continue;
    if (isEyeish(s.board, s.size, p, s.toPlay)) continue;
    if (!play(s, p).ok) continue;
    kids.push({
      move: p,
      player: s.toPlay,
      visits: 0,
      wins: 0,
      raveVisits: 0,
      raveWins: 0,
      prior: priorFor(s, p),
      children: null,
      state: null,
    });
  }
  kids.push({
    move: -1,
    player: s.toPlay,
    visits: 0,
    wins: 0,
    raveVisits: 0,
    raveWins: 0,
    prior: kids.length ? -3 : 1,
    children: null,
    state: null,
  });
  node.children = kids;
}

const RAVE_K = 600;
function select(node: Node): Node {
  let best: Node | null = null;
  let bestV = -Infinity;
  const logN = Math.log(node.visits + 1);
  for (const c of node.children!) {
    const pv = 10; // prior as virtual visits
    const n = c.visits + pv;
    const q = (c.wins + pv * (0.5 + 0.08 * c.prior)) / n;
    const beta =
      c.raveVisits / (c.raveVisits + n + (c.raveVisits * n) / RAVE_K);
    const r = c.raveVisits ? c.raveWins / c.raveVisits : 0.5;
    const v = (1 - beta) * q + beta * r + 0.35 * Math.sqrt(logN / n);
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best!;
}

export type GoAiResult = {
  move: number; // -1 pass, -2 resign
  winrate: number;
  playouts: number;
};

export function chooseGoMove(
  s: GoState,
  komi: number,
  level: GoLevel,
  rng: Rng = Math.random,
  now: () => number = () => Date.now(),
): GoAiResult {
  const cfg = GO_LEVELS[level];
  const root: Node = {
    move: -1,
    player: other(s.toPlay),
    visits: 0,
    wins: 0,
    raveVisits: 0,
    raveWins: 0,
    prior: 0,
    children: null,
    state: s,
  };
  expand(root);
  const sim = new Sim(s.size);
  const deadline = now() + cfg.timeMs;
  let n = 0;
  const amaf = new Uint8Array(s.board.length);
  while (n < cfg.playouts && now() < deadline) {
    n++;
    const path: Node[] = [root];
    let node = root;
    while (node.children && node.children.length) {
      node = select(node);
      path.push(node);
      if (!node.state) {
        const parent = path[path.length - 2].state!;
        const r = play(parent, node.move);
        node.state = r.ok ? r.state : parent;
      }
      if (node.visits < 2) break;
      if (!node.children && node.state.passes < 2) expand(node);
    }
    const st = node.state!;
    amaf.fill(0);
    let diff: number;
    if (st.passes >= 2) diff = playoutScore(st.board, s.size);
    else {
      const b = playout(sim, st.board.slice(), st.toPlay, st.ko, rng, amaf);
      diff = playoutScore(b, s.size);
    }
    const blackWins = diff - komi > 0;
    for (const p of path) {
      p.visits++;
      const won = (p.player === BLACK) === blackWins;
      if (won) p.wins++;
      if (p.children)
        for (const c of p.children)
          if (c.move >= 0 && amaf[c.move] === c.player) {
            c.raveVisits++;
            if ((c.player === BLACK) === blackWins) c.raveWins++;
          }
    }
  }
  const kids = root.children!;
  const best = kids.reduce((a, c) => (c.visits > a.visits ? c : a), kids[0]);
  const winrate = best.visits ? best.wins / best.visits : 0.5;
  // Low levels: sometimes pick a reasonable but non-best move.
  if (level === 1) {
    const ok = kids.filter((c) => c.move >= 0 && c.visits >= best.visits * 0.3);
    if (ok.length > 1 && rng() < 0.5) {
      const c = ok[(rng() * ok.length) | 0];
      return {
        move: c.move,
        winrate: c.visits ? c.wins / c.visits : 0.5,
        playouts: n,
      };
    }
  }
  if (level >= 3 && n > 500 && winrate < 0.04)
    return { move: -2, winrate, playouts: n };
  return { move: best.move, winrate, playouts: n };
}

/** Monte-Carlo ownership: estimated owner per point (+1 black … -1 white). */
export function ownership(
  s: GoState,
  samples = 200,
  rng: Rng = Math.random,
): Float32Array {
  const sim = new Sim(s.size);
  const own = new Float32Array(s.board.length);
  const amaf = new Uint8Array(s.board.length);
  for (let i = 0; i < samples; i++) {
    const b = playout(sim, s.board.slice(), s.toPlay, s.ko, rng, amaf);
    for (let p = 0; p < b.length; p++) {
      let o = b[p] === BLACK ? 1 : b[p] === WHITE ? -1 : 0;
      if (!o) {
        let bl = 0;
        let wh = 0;
        for (const q of neighbours(s.size, p)) {
          if (b[q] === BLACK) bl++;
          else if (b[q] === WHITE) wh++;
        }
        o = bl && !wh ? 1 : wh && !bl ? -1 : 0;
      }
      own[p] += o / samples;
    }
  }
  return own;
}

/** Stones that probably end up captured (owner strongly the other colour). */
export function guessDead(
  s: GoState,
  samples = 200,
  rng: Rng = Math.random,
): number[] {
  const own = ownership(s, samples, rng);
  const dead: number[] = [];
  for (let p = 0; p < s.board.length; p++) {
    if (s.board[p] === BLACK && own[p] < -0.5) dead.push(p);
    if (s.board[p] === WHITE && own[p] > 0.5) dead.push(p);
  }
  return dead;
}
