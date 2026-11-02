// 五子棋 AI：五元组评分 + 候选裁剪的 α-β 搜索，高档加连续冲四（VCF）检索。
// 十档用搜索上限、候选宽度、随机扰动与失误率区分；不是棋力段位认证。
import {
  BLACK,
  EMPTY,
  fiveAt,
  isForbidden,
  other,
  type GomokuState,
  type Player,
  type Stone,
} from './gomoku.ts';

export type GomokuLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type LevelCfg = {
  name: string;
  note: string;
  depth: number;
  width: number;
  noise: number;
  blunder: number;
  vcf: number;
};
export const GOMOKU_LEVELS: Record<GomokuLevel, LevelCfg> = {
  1: {
    name: '1 · 刚学规则',
    note: '常常漏看对方四连',
    depth: 0,
    width: 1,
    noise: 0.9,
    blunder: 0.45,
    vcf: 0,
  },
  2: {
    name: '2 · 入门',
    note: '会堵活四，不太会进攻',
    depth: 0,
    width: 1,
    noise: 0.6,
    blunder: 0.25,
    vcf: 0,
  },
  3: {
    name: '3 · 初学',
    note: '看一步攻守',
    depth: 0,
    width: 1,
    noise: 0.35,
    blunder: 0.12,
    vcf: 0,
  },
  4: {
    name: '4 · 初级',
    note: '一步贪心，偶尔失误',
    depth: 0,
    width: 1,
    noise: 0.15,
    blunder: 0.05,
    vcf: 0,
  },
  5: {
    name: '5 · 进阶',
    note: '减少随手落子，兼顾进攻和防守',
    depth: 2,
    width: 8,
    noise: 0.08,
    blunder: 0.02,
    vcf: 0,
  },
  6: {
    name: '6 · 熟练',
    note: '优先寻找连续进攻机会',
    depth: 2,
    width: 10,
    noise: 0.03,
    blunder: 0,
    vcf: 5,
  },
  7: {
    name: '7 · 挑战',
    note: '进一步考虑对手的应对',
    depth: 3,
    width: 10,
    noise: 0.01,
    blunder: 0,
    vcf: 9,
  },
  8: {
    name: '8 · 高难',
    note: '更仔细地寻找进攻机会',
    depth: 4,
    width: 9,
    noise: 0,
    blunder: 0,
    vcf: 13,
  },
  9: {
    name: '9 · 进阶挑战',
    note: '考虑更多落点',
    depth: 4,
    width: 12,
    noise: 0,
    blunder: 0,
    vcf: 17,
  },
  10: {
    name: '10 · 全力',
    note: '在思考时间内尽量深入判断',
    depth: 5,
    width: 10,
    noise: 0,
    blunder: 0,
    vcf: 21,
  },
};

const DIRS = [1, 0, 0, 1, 1, 1, 1, -1];
// Value of a five-cell window by own-stone count (no opponent stones in it).
const ATTACK = [7, 35, 800, 15000, 800000, 0];
const DEFEND = [7, 15, 400, 1800, 100000, 0];

/** Five-tuple score of placing p at i (attack + defence). */
export function pointScore(cells: Stone[], size: number, i: number, p: Player) {
  const o = other(p);
  const x0 = i % size;
  const y0 = Math.floor(i / size);
  let s = 0;
  for (let d = 0; d < 8; d += 2) {
    const dx = DIRS[d];
    const dy = DIRS[d + 1];
    for (let k = -4; k <= 0; k++) {
      let mine = 0;
      let theirs = 0;
      let ok = true;
      for (let t = k; t < k + 5; t++) {
        const x = x0 + dx * t;
        const y = y0 + dy * t;
        if (x < 0 || y < 0 || x >= size || y >= size) {
          ok = false;
          break;
        }
        const c = t === 0 ? EMPTY : cells[y * size + x];
        if (c === p) mine++;
        else if (c === o) theirs++;
      }
      if (!ok) continue;
      if (theirs === 0) s += ATTACK[mine];
      if (mine === 0) s += DEFEND[theirs];
    }
  }
  return s;
}

function candidates(cells: Stone[], size: number) {
  const out: number[] = [];
  let any = false;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY) {
      any = true;
      continue;
    }
    const x = i % size;
    const y = Math.floor(i / size);
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx < size &&
          ny < size &&
          cells[ny * size + nx] !== EMPTY
        ) {
          near = true;
          break;
        }
      }
    if (near) out.push(i);
  }
  if (!any) out.push(Math.floor(cells.length / 2));
  return out;
}

type Ctx = { size: number; renju: boolean; deadline: number; nodes: number };

function legal(cells: Stone[], ctx: Ctx, i: number, p: Player) {
  if (!ctx.renju || p !== BLACK) return true;
  return !isForbidden({ cells, size: ctx.size, renju: true } as GomokuState, i);
}

function ranked(cells: Stone[], ctx: Ctx, p: Player, width: number) {
  const list = candidates(cells, ctx.size).map((i) => ({
    i,
    s: pointScore(cells, ctx.size, i, p),
  }));
  list.sort((a, b) => b.s - a.s);
  const out: { i: number; s: number }[] = [];
  for (const m of list) {
    if (out.length >= width) break;
    if (legal(cells, ctx, m.i, p)) out.push(m);
  }
  // Candidate pruning must not report a loss if a distant legal move remains.
  if (!out.length) {
    const i = cells.findIndex(
      (stone, i) => stone === EMPTY && legal(cells, ctx, i, p),
    );
    if (i >= 0) out.push({ i, s: pointScore(cells, ctx.size, i, p) });
  }
  return out;
}

const WIN = 1e9;
const SEARCH_TIMEOUT = Symbol('gomoku search timeout');

function checkDeadline(ctx: Ctx) {
  if (Date.now() >= ctx.deadline) throw SEARCH_TIMEOUT;
}

/** Total five-tuple balance from p's point of view. */
function evaluate(cells: Stone[], size: number, p: Player) {
  const o = other(p);
  let mine = 0;
  let theirs = 0;
  for (let d = 0; d < 8; d += 2) {
    const dx = DIRS[d];
    const dy = DIRS[d + 1];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const ex = x + dx * 4;
        const ey = y + dy * 4;
        if (ex < 0 || ey < 0 || ex >= size || ey >= size) continue;
        let a = 0;
        let b = 0;
        for (let t = 0; t < 5; t++) {
          const c = cells[(y + dy * t) * size + x + dx * t];
          if (c === p) a++;
          else if (c === o) b++;
        }
        if (b === 0) mine += ATTACK[a];
        if (a === 0) theirs += ATTACK[b];
      }
  }
  return mine * 1.1 - theirs;
}

function negamax(
  cells: Stone[],
  ctx: Ctx,
  p: Player,
  depth: number,
  alpha: number,
  beta: number,
  width: number,
): number {
  checkDeadline(ctx);
  ctx.nodes++;
  if (winsNow(cells, ctx, p).length) return WIN + depth;
  const threats = winsNow(cells, ctx, other(p));
  if (threats.length >= 2) return -WIN - depth;
  if (!cells.includes(EMPTY)) return 0;
  if (depth === 0) return evaluate(cells, ctx.size, p);
  const moves = threats.length
    ? legal(cells, ctx, threats[0], p)
      ? [{ i: threats[0], s: 0 }]
      : []
    : ranked(cells, ctx, p, width);
  if (!moves.length) return -WIN - depth;
  let best = -Infinity;
  for (const { i } of moves) {
    checkDeadline(ctx);
    cells[i] = p;
    let v: number;
    try {
      v = fiveAt(cells, ctx.size, i, ctx.renju)
        ? WIN + depth
        : -negamax(cells, ctx, other(p), depth - 1, -beta, -alpha, width);
    } finally {
      cells[i] = EMPTY;
    }
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** Points where p completes five right now. */
function winsNow(cells: Stone[], ctx: Ctx, p: Player) {
  const out: number[] = [];
  for (const i of candidates(cells, ctx.size)) {
    cells[i] = p;
    if (fiveAt(cells, ctx.size, i, ctx.renju)) out.push(i);
    cells[i] = EMPTY;
  }
  return out;
}

/** Victory by continuous fours: returns the first move or -1. */
function vcf(cells: Stone[], ctx: Ctx, p: Player, depth: number): number {
  if (depth <= 0 || Date.now() >= ctx.deadline) return -1;
  const o = other(p);
  for (const { i } of ranked(cells, ctx, p, 40)) {
    if (Date.now() >= ctx.deadline) return -1;
    ctx.nodes++;
    cells[i] = p;
    const threats = winsNow(cells, ctx, p);
    let ok = false;
    if (fiveAt(cells, ctx.size, i, ctx.renju)) ok = true;
    else if (threats.length >= 2 && !winsNow(cells, ctx, o).length) ok = true;
    else if (threats.length === 1 && !winsNow(cells, ctx, o).length) {
      const b = threats[0];
      if (!legal(cells, ctx, b, o)) ok = true;
      else {
        cells[b] = o;
        ok =
          !fiveAt(cells, ctx.size, b, ctx.renju) &&
          vcf(cells, ctx, p, depth - 1) >= 0;
        cells[b] = EMPTY;
      }
    }
    cells[i] = EMPTY;
    if (ok) return i;
  }
  return -1;
}

export type GomokuAiResult = { move: number; nodes: number; reason: string };

export function chooseGomokuMove(
  s: GomokuState,
  level: GomokuLevel,
  rand: () => number = Math.random,
  timeMs = 1500,
): GomokuAiResult {
  if (s.winner !== null) return { move: -1, nodes: 0, reason: '对局已结束' };
  const cfg = GOMOKU_LEVELS[level];
  const p = s.toPlay;
  const cells = s.cells.slice();
  const ctx: Ctx = {
    size: s.size,
    renju: s.renju,
    deadline: Date.now() + timeMs,
    nodes: 0,
  };
  if (!s.moves.length)
    return { move: Math.floor(cells.length / 2), nodes: 0, reason: '天元开局' };
  const pool = ranked(cells, ctx, p, 12);
  if (!pool.length) return { move: -1, nodes: 0, reason: '无处可下' };
  // Blunder: a random nearby move (but never ignore an immediate five at low levels? they may).
  if (cfg.blunder && rand() < cfg.blunder) {
    const pick = pool[Math.floor(rand() * Math.min(pool.length, 6))];
    return { move: pick.i, nodes: 0, reason: '随手' };
  }
  const win = winsNow(cells, ctx, p).filter((i) => legal(cells, ctx, i, p));
  if (win.length) return { move: win[0], nodes: 0, reason: '成五' };
  const block = winsNow(cells, ctx, other(p));
  if (block.length && level >= 2) {
    const b = block.find((i) => legal(cells, ctx, i, p));
    return b === undefined
      ? { move: pool[0].i, nodes: 0, reason: '无合法挡点，继续行棋' }
      : { move: b, nodes: 0, reason: '挡住冲四' };
  }
  if (cfg.vcf) {
    const m = vcf(cells, ctx, p, cfg.vcf);
    if (m >= 0) return { move: m, nodes: ctx.nodes, reason: '连续冲四取胜' };
  }
  if (cfg.depth === 0) {
    const top = pool[0].s;
    const near = pool.filter((m) => m.s >= top * (1 - cfg.noise));
    const pick = near[Math.floor(rand() * near.length)];
    return { move: pick.i, nodes: 0, reason: '攻守评分' };
  }
  if (Date.now() >= ctx.deadline)
    return {
      move: pool[0].i,
      nodes: ctx.nodes,
      reason: '攻守评分（思考时间已用尽）',
    };
  const moves = ranked(cells, ctx, p, cfg.width);
  let best = moves[0].i;
  let completedDepth = 0;
  // Keep the last fully searched iteration. A timeout in one branch must not
  // compare a shallow estimate with completed, deeper alternatives.
  for (let depth = 1; depth <= cfg.depth; depth++) {
    let iterationBest = best;
    let bestV = -Infinity;
    try {
      for (const { i } of moves) {
        checkDeadline(ctx);
        cells[i] = p;
        let v: number;
        try {
          v =
            -negamax(
              cells,
              ctx,
              other(p),
              depth - 1,
              -Infinity,
              -bestV,
              cfg.width,
            ) + (cfg.noise ? rand() * cfg.noise * 2000 : 0);
        } finally {
          cells[i] = EMPTY;
        }
        if (v > bestV) {
          bestV = v;
          iterationBest = i;
        }
      }
    } catch (error) {
      if (error !== SEARCH_TIMEOUT) throw error;
      break;
    }
    best = iterationBest;
    completedDepth = depth;
  }
  return {
    move: best,
    nodes: ctx.nodes,
    reason: completedDepth
      ? `搜索 ${completedDepth} 步`
      : '攻守评分（思考时间已用尽）',
  };
}
