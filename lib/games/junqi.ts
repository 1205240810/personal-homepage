// 军棋（两人陆战棋）：5 列 × 12 行，中间隔着山界。纯规则引擎，前后端共用。
// 坐标 i = y * 5 + x；红方（0）在下半（y = 6..11），蓝方（1）在上半（y = 0..5）。
// 棋盘关于中心点对称：蓝方的格子 = 59 - 红方对应格子。
// 引擎保存完整局面；暗棋时用 maskFor() 只把一方能看到的信息交给界面 / AI / 联机客户端。

export const W = 5;
export const H = 12;
export const CELLS = W * H;
export type Side = 0 | 1;

/** 棋子种类。3..11 按军衔从低到高，可直接比较大小。 */
export const FLAG = 0;
export const MINE = 1;
export const BOMB = 2;
export const ENG = 3;
export const PAI = 4;
export const LIAN = 5;
export const YING = 6;
export const TUAN = 7;
export const LV = 8;
export const SHI = 9;
export const JUN = 10;
export const SI = 11;
export type Kind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
/** -1：暗棋里看不到的对方棋子。 */
export type SeenKind = Kind | -1;
export const KINDS: Kind[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const KIND_NAME = [
  '军旗',
  '地雷',
  '炸弹',
  '工兵',
  '排长',
  '连长',
  '营长',
  '团长',
  '旅长',
  '师长',
  '军长',
  '司令',
] as const;
/** 棋子上刻的字（两字以内，手机上也清楚）。 */
export const KIND_MARK = KIND_NAME;
export const COUNTS: Record<Kind, number> = {
  0: 1,
  1: 3,
  2: 2,
  3: 3,
  4: 3,
  5: 3,
  6: 2,
  7: 2,
  8: 2,
  9: 2,
  10: 1,
  11: 1,
};
export const PIECES = 25;
export const SIDE_NAME = ['红', '蓝'] as const;

export const xOf = (i: number) => i % W;
export const yOf = (i: number) => Math.floor(i / W);
export const at = (x: number, y: number) => y * W + x;
export const sideOfCell = (i: number): Side => (yOf(i) >= 6 ? 0 : 1);
/** 从该方视角的「第几排」：0 = 最靠山界的一排，5 = 底排。 */
export const rowFor = (side: Side, i: number) =>
  side === 0 ? yOf(i) - 6 : 5 - yOf(i);
/** 该方视角的格子（红方坐标）↔ 实际格子。 */
export const forSide = (side: Side, redCell: number) =>
  side === 0 ? redCell : CELLS - 1 - redCell;

const RED_CAMPS = [at(1, 7), at(3, 7), at(2, 8), at(1, 9), at(3, 9)];
const RED_HQ = [at(1, 11), at(3, 11)];
export const CAMP = new Uint8Array(CELLS);
export const HQ = new Uint8Array(CELLS);
for (const c of RED_CAMPS) CAMP[c] = CAMP[CELLS - 1 - c] = 1;
for (const c of RED_HQ) HQ[c] = HQ[CELLS - 1 - c] = 1;
export const isCamp = (i: number) => CAMP[i] === 1;
export const isHq = (i: number) => HQ[i] === 1;

// ---- 连线：公路（一步）与铁路（直线任意远，工兵可拐弯）。 ----
/** 铁路相邻表。 */
export const RAIL: number[][] = Array.from({ length: CELLS }, () => []);
/** 公路相邻表（包含铁路上的一步，也包含行营的斜线）。 */
export const ROAD: number[][] = Array.from({ length: CELLS }, () => []);
const link = (t: number[][], a: number, b: number) => {
  if (!t[a].includes(b)) t[a].push(b);
  if (!t[b].includes(a)) t[b].push(a);
};
for (const y of [1, 5, 6, 10])
  for (let x = 0; x < W - 1; x++) link(RAIL, at(x, y), at(x + 1, y));
for (const x of [0, 4])
  for (let y = 1; y < 10; y++) link(RAIL, at(x, y), at(x, y + 1));
link(RAIL, at(2, 5), at(2, 6));
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = at(x, y);
    if (x < W - 1) link(ROAD, i, at(x + 1, y));
    // 山界只在 0、2、4 列有铁路相通。
    if (y < H - 1 && (y !== 5 || x % 2 === 0)) link(ROAD, i, at(x, y + 1));
  }
for (let i = 0; i < CELLS; i++)
  if (CAMP[i])
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const x = xOf(i) + dx;
      const y = yOf(i) + dy;
      if (
        x >= 0 &&
        x < W &&
        y >= 0 &&
        y < H &&
        sideOfCell(at(x, y)) === sideOfCell(i)
      )
        link(ROAD, i, at(x, y));
    }
export const isRail = (i: number) => RAIL[i].length > 0;
export const railLinked = (a: number, b: number) => RAIL[a].includes(b);
export const roadLinked = (a: number, b: number) => ROAD[a].includes(b);

/** 一方可以摆子的 25 个格子（红方坐标从前排到底排、从左到右）。 */
export const RED_SLOTS: number[] = [];
for (let y = 6; y < H; y++)
  for (let x = 0; x < W; x++) if (!CAMP[at(x, y)]) RED_SLOTS.push(at(x, y));
export const slotsFor = (side: Side) => RED_SLOTS.map((c) => forSide(side, c));

// ---- 局面 ----
export type Piece = { s: Side; k: Kind; id: number };
export type SeenPiece = { s: Side; k: SeenKind; id: number };
export type Outcome = 'move' | 'win' | 'lose' | 'both' | 'flag';
export type JunqiEvent = {
  ply: number;
  side: Side;
  from: number;
  to: number;
  /** 经过的格子（含终点），工兵在铁路上拐弯时可见。 */
  path: number[];
  aid: number;
  did: number | null;
  outcome: Outcome;
  /** 进攻方 / 防守方的棋子；暗棋视图里看不到的一方为 -1。 */
  ak: SeenKind;
  dk: SeenKind | null;
  /** 这一步阵亡了司令、因此亮出军旗的一方。 */
  flags: Side[];
};
export type Reason = 'flag' | 'stuck' | 'resign' | 'draw' | null;
export type JunqiState<P = Piece> = {
  board: (P | null)[];
  phase: 'deploy' | 'play' | 'over';
  ready: [boolean, boolean];
  toPlay: Side;
  /** null + phase over = 和棋。 */
  winner: Side | null;
  reason: Reason;
  /** 司令阵亡后亮出军旗。 */
  flagShown: [boolean, boolean];
  /** 连续未交战的步数，达到 QUIET_LIMIT 判和。 */
  quiet: number;
  ply: number;
  log: JunqiEvent[];
};
export type JunqiView = JunqiState<SeenPiece> & { you: Side | null };
export const QUIET_LIMIT = 100;
export type Move = { from: number; to: number };

export function newGame(): JunqiState {
  return {
    board: Array(CELLS).fill(null),
    phase: 'deploy',
    ready: [false, false],
    toPlay: 0,
    winner: null,
    reason: null,
    flagShown: [false, false],
    quiet: 0,
    ply: 0,
    log: [],
  };
}

// ---- 布阵 ----
/** 布阵：按 slotsFor(side) 的顺序给出 25 个棋子种类。 */
export type Layout = Kind[];

/** 返回所有违规（空数组 = 合法）。坏格子的下标会放进 cells。 */
export function checkLayout(layout: unknown): {
  errors: string[];
  cells: number[];
} {
  const errors: string[] = [];
  const cells = new Set<number>();
  if (
    !Array.isArray(layout) ||
    layout.length !== PIECES ||
    !layout.every((k) => Number.isInteger(k) && k >= 0 && k <= 11)
  )
    return { errors: ['布阵数据无效'], cells: [] };
  const counts = Array(12).fill(0);
  for (const k of layout) counts[k]++;
  for (const k of KINDS)
    if (counts[k] !== COUNTS[k])
      errors.push(`${KIND_NAME[k]}应为 ${COUNTS[k]} 枚，现在 ${counts[k]} 枚`);
  layout.forEach((k: Kind, slot) => {
    const c = RED_SLOTS[slot];
    const r = rowFor(0, c);
    if (k === FLAG && !HQ[c]) {
      errors.push('军旗必须放在大本营');
      cells.add(slot);
    }
    if (k === MINE && r < 4) {
      errors.push('地雷只能放在最后两排');
      cells.add(slot);
    }
    if (k === BOMB && r === 0) {
      errors.push('炸弹不能放在第一排');
      cells.add(slot);
    }
  });
  return { errors: [...new Set(errors)], cells: [...cells] };
}
export const layoutValid = (l: unknown) => checkLayout(l).errors.length === 0;

/** 摆好一方的阵型；双方都摆好后开战（红方先走）。 */
export function deploy(s: JunqiState, side: Side, layout: Layout): JunqiState {
  if (s.phase !== 'deploy') throw new Error('已经开战，不能再布阵');
  if (s.ready[side]) throw new Error('已经布好阵了');
  const { errors } = checkLayout(layout);
  if (errors.length) throw new Error(errors[0]);
  const board = s.board.slice();
  slotsFor(side).forEach((c, slot) => {
    board[c] = { s: side, k: layout[slot], id: c };
  });
  const ready: [boolean, boolean] = [...s.ready];
  ready[side] = true;
  const started = ready[0] && ready[1];
  return { ...s, board, ready, phase: started ? 'play' : 'deploy', toPlay: 0 };
}

/** 读出一方当前的阵型（布阵阶段用）。 */
export function layoutOf(s: JunqiState, side: Side): Layout | null {
  const out: Kind[] = [];
  for (const c of slotsFor(side)) {
    const p = s.board[c];
    if (!p || p.s !== side) return null;
    out.push(p.k);
  }
  return out;
}

// ---- 走法 ----
type Board = ({ s: Side; k: number } | null)[];
export const canMoveKind = (k: number) => k !== FLAG && k !== MINE;

/**
 * 某格棋子的全部合法目的地，以及到达的路径（不含起点）。
 * 只看占位与己方棋子种类，所以暗棋视图也能直接用。
 */
export function targetsFrom(board: Board, from: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const p = board[from];
  if (!p || !canMoveKind(p.k) || HQ[from]) return out;
  const enterable = (c: number) => {
    const q = board[c];
    if (!q) return true;
    return q.s !== p.s && !CAMP[c];
  };
  for (const n of ROAD[from]) if (enterable(n)) out.set(n, [n]);
  if (!isRail(from)) return out;
  if (p.k === ENG) {
    // 工兵：沿铁路经过空格广度优先，可以任意拐弯。
    const prev = new Map<number, number>([[from, -1]]);
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const a = q[h];
      for (const b of RAIL[a]) {
        if (prev.has(b)) continue;
        const occ = board[b];
        if (occ && occ.s === p.s) continue;
        prev.set(b, a);
        const path: number[] = [];
        for (let c = b; c !== from; c = prev.get(c)!) path.unshift(c);
        if (!out.has(b) || out.get(b)!.length > path.length) out.set(b, path);
        if (!occ) q.push(b);
      }
    }
    return out;
  }
  // 其他棋子：沿铁路直走，不能拐弯。
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const path: number[] = [];
    let a = from;
    for (;;) {
      const x = xOf(a) + dx;
      const y = yOf(a) + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) break;
      const b = at(x, y);
      if (!railLinked(a, b)) break;
      const occ = board[b];
      if (occ && occ.s === p.s) break;
      path.push(b);
      if (!out.has(b) || out.get(b)!.length > path.length)
        out.set(b, [...path]);
      if (occ) break;
      a = b;
    }
  }
  return out;
}

export function movesFor(board: Board, side: Side): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < CELLS; i++) {
    const p = board[i];
    if (!p || p.s !== side) continue;
    for (const to of targetsFrom(board, i).keys()) out.push({ from: i, to });
  }
  return out;
}
export const hasMoves = (board: Board, side: Side) => {
  for (let i = 0; i < CELLS; i++) {
    const p = board[i];
    if (p && p.s === side && targetsFrom(board, i).size) return true;
  }
  return false;
};

/** 交战结果（从进攻方看）。 */
export function resolve(a: Kind, d: Kind): Exclude<Outcome, 'move'> {
  if (d === FLAG) return 'flag';
  if (a === BOMB || d === BOMB) return 'both';
  if (d === MINE) return a === ENG ? 'win' : 'lose';
  if (a === d) return 'both';
  return a > d ? 'win' : 'lose';
}

export function isLegal(
  s: JunqiState<{ s: Side; k: number }>,
  m: Move,
): boolean {
  if (s.phase !== 'play' || !m) return false;
  const p = s.board[m.from];
  if (!p || p.s !== s.toPlay) return false;
  return targetsFrom(s.board, m.from).has(m.to);
}

/** 走一步（完整信息局面），返回新局面。 */
export function applyMove(s: JunqiState, m: Move): JunqiState {
  const side = s.toPlay;
  const board = s.board.slice();
  const a = board[m.from]!;
  const d = board[m.to];
  const path = targetsFrom(s.board, m.from).get(m.to) ?? [m.to];
  const outcome: Outcome = d ? resolve(a.k, d.k) : 'move';
  board[m.from] = null;
  const flags: Side[] = [];
  const flagShown: [boolean, boolean] = [...s.flagShown];
  const bombTookFlag = outcome === 'flag' && a.k === BOMB;
  if (bombTookFlag) board[m.to] = null;
  else if (outcome === 'move' || outcome === 'win' || outcome === 'flag')
    board[m.to] = a;
  else if (outcome === 'both') board[m.to] = null;
  // lose：防守方留在原地。
  const died: Piece[] = [];
  if (outcome === 'lose' || outcome === 'both' || bombTookFlag) died.push(a);
  if (d && outcome !== 'lose') died.push(d);
  for (const p of died)
    if (p.k === SI && !flagShown[p.s]) {
      flagShown[p.s] = true;
      flags.push(p.s);
    }
  const event: JunqiEvent = {
    ply: s.ply,
    side,
    from: m.from,
    to: m.to,
    path,
    aid: a.id,
    did: d ? d.id : null,
    outcome,
    ak: a.k,
    dk: d ? d.k : null,
    flags,
  };
  const next: JunqiState = {
    ...s,
    board,
    flagShown,
    toPlay: (1 - side) as Side,
    ply: s.ply + 1,
    quiet: d ? 0 : s.quiet + 1,
    log: [...s.log, event],
  };
  if (outcome === 'flag')
    return { ...next, phase: 'over', winner: side, reason: 'flag' };
  return settle(next);
}

/** 轮到的一方无子可动判负；双方都动不了或长时间无交战判和。 */
function settle(s: JunqiState): JunqiState {
  const me = s.toPlay;
  if (!hasMoves(s.board, me)) {
    const oppStuck = !hasMoves(s.board, (1 - me) as Side);
    return oppStuck
      ? { ...s, phase: 'over', winner: null, reason: 'draw' }
      : { ...s, phase: 'over', winner: (1 - me) as Side, reason: 'stuck' };
  }
  if (s.quiet >= QUIET_LIMIT)
    return { ...s, phase: 'over', winner: null, reason: 'draw' };
  return s;
}

export function play(s: JunqiState, m: Move): JunqiState {
  if (s.phase === 'deploy') throw new Error('还没开战');
  if (s.phase === 'over') throw new Error('对局已结束');
  if (!isLegal(s, m)) throw new Error('这里不能走');
  return applyMove(s, m);
}

export function resign(s: JunqiState, side: Side): JunqiState {
  if (s.phase !== 'play') return s;
  return { ...s, phase: 'over', winner: (1 - side) as Side, reason: 'resign' };
}

export function parseMove(raw: unknown): Move | null {
  const m = (raw ?? {}) as Record<string, unknown>;
  const ok = (v: unknown) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < CELLS;
  return ok(m.from) && ok(m.to)
    ? { from: m.from as number, to: m.to as number }
    : null;
}

// ---- 暗棋视图 ----
/**
 * 一方能看到的局面：自己的棋子、对方棋子的位置（种类为 -1），
 * 已亮出的军旗；战报里只保留胜负和自己的棋子。明棋或终局时全部公开。
 */
export function maskFor(
  s: JunqiState,
  viewer: Side | null,
  open = false,
): JunqiView {
  const all = open || s.phase === 'over';
  const sees = (side: Side) => all || side === viewer;
  const board = s.board.map((p) =>
    !p
      ? null
      : sees(p.s) || (p.k === FLAG && s.flagShown[p.s])
        ? { ...p }
        : { s: p.s, k: -1 as SeenKind, id: p.id },
  );
  // 布阵阶段看不到对方摆了什么，连位置都不给（布完才显示背面）。
  if (s.phase === 'deploy' && !all)
    for (let i = 0; i < CELLS; i++) {
      const p = s.board[i];
      if (p && p.s !== viewer && !s.ready[p.s]) board[i] = null;
    }
  const log = s.log.map((e) => ({
    ...e,
    ak: sees(e.side) ? e.ak : -1,
    dk: e.dk === null ? null : sees((1 - e.side) as Side) ? e.dk : -1,
  }));
  return { ...s, board, log, you: viewer };
}

// ---- 名字 ----
const COLS = 'ABCDE';
/** 从某方视角的坐标名：列 A–E，排 1（前排）–6（底排）。 */
export function cellName(i: number, viewer: Side = 0): string {
  const side = sideOfCell(i);
  const r = rowFor(side, i) + 1;
  const x = viewer === 0 ? xOf(i) : W - 1 - xOf(i);
  const mine = side === viewer;
  return `${mine ? '我方' : '对方'}${COLS[x]}${r}`;
}
export function cellKindName(i: number): string {
  if (HQ[i]) return '大本营';
  if (CAMP[i]) return '行营';
  if (isRail(i)) return '铁路';
  return '兵站';
}
