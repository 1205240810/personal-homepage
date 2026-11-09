// 军棋 AI（暗棋，不作弊）：只读自己能看到的局面与裁判公布的胜负。
// 1. 约束推理：根据初始位置、是否走动、工兵拐弯、每次交战的结果、司令阵亡亮旗，
//    给对方每枚棋子维护一个「可能是什么」的集合；
// 2. 确定化抽样（PIMC）：按数量约束抽出若干份完整局面；
// 3. 在每份局面里做浅层搜索（1–2 步 + 吃子威胁估计），对所有抽样取平均。
import {
  BOMB,
  CELLS,
  ENG,
  FLAG,
  HQ,
  KINDS,
  MINE,
  RAIL,
  ROAD,
  SI,
  COUNTS,
  canMoveKind,
  isHq,
  movesFor,
  resolve,
  rowFor,
  slotsFor,
  targetsFrom,
  xOf,
  yOf,
  type JunqiView,
  type Kind,
  type Move,
  type Side,
} from './junqi.ts';

export type JunqiLevel = 1 | 2 | 3 | 4 | 5;
type LevelSpec = {
  name: string;
  note: string;
  samples: number;
  depth: 1 | 2;
  ms: number;
  noise: number;
  threat: boolean;
  random: number;
  /** 两步搜索时按对方「看得到的信息」推测它的应着，而不是假设它全知。 */
  model?: boolean;
};
export const JUNQI_LEVELS: Record<JunqiLevel, LevelSpec> = {
  1: {
    name: '新兵',
    note: '约入门 · 走一步看一步',
    samples: 3,
    depth: 1,
    ms: 200,
    noise: 18,
    threat: false,
    random: 0.3,
  },
  2: {
    name: '排长',
    note: '约初级 · 会躲会吃',
    samples: 8,
    depth: 1,
    ms: 400,
    noise: 6,
    threat: true,
    random: 0,
  },
  3: {
    name: '团长',
    note: '约中级 · 推理暗子',
    samples: 20,
    depth: 1,
    ms: 700,
    noise: 1.5,
    threat: true,
    random: 0,
  },
  4: {
    name: '军长',
    note: '约中高级 · 抽样推演两步',
    samples: 28,
    depth: 2,
    ms: 1500,
    noise: 0,
    threat: true,
    random: 0,
  },
  5: {
    name: '司令',
    note: '约高级 · 深算护旗',
    samples: 64,
    depth: 2,
    ms: 2800,
    noise: 0,
    threat: true,
    random: 0,
    model: false,
  },
};
export type JunqiAiResult = { move: Move; score: number; samples: number };

const bit = (k: number) => 1 << k;
const ALL = (1 << 12) - 1;
const MOVABLE = ALL & ~bit(FLAG) & ~bit(MINE);
const rankedAbove = (k: number) => {
  let m = 0;
  for (let r = Math.max(ENG, k + 1); r <= SI; r++) m |= bit(r);
  return m;
};
const rankedBelow = (k: number) => {
  let m = 0;
  for (let r = ENG; r < k; r++) m |= bit(r);
  return m;
};

export type Belief = {
  /** 对方 25 枚棋子的 id（= 初始格子）。 */
  ids: number[];
  masks: Map<number, number>;
  /** 存活的对方棋子 id → 当前格子。 */
  alive: Map<number, number>;
};

const collinear = (from: number, path: number[]) =>
  path.every((c) => xOf(c) === xOf(from)) ||
  path.every((c) => yOf(c) === yOf(from));

/** 只用公开信息推出对方每枚棋子的可能种类。 */
export function inferBelief(view: JunqiView, me: Side): Belief {
  const opp = (1 - me) as Side;
  const ids = slotsFor(opp);
  const masks = new Map<number, number>();
  for (const id of ids) {
    let m = ALL;
    const r = rowFor(opp, id);
    if (!HQ[id]) m &= ~bit(FLAG);
    if (r < 4) m &= ~bit(MINE);
    if (r === 0) m &= ~bit(BOMB);
    masks.set(id, m);
  }
  const and = (id: number, m: number) =>
    masks.set(id, (masks.get(id) ?? ALL) & m);
  for (const e of view.log) {
    if (e.side === opp) {
      and(e.aid, MOVABLE);
      if (e.path.length > 1 && !collinear(e.from, e.path)) and(e.aid, bit(ENG));
      if (e.did !== null && e.dk !== null && e.dk >= 0) {
        const K = e.dk;
        const X = e.aid;
        if (e.outcome === 'win') and(X, K === MINE ? bit(ENG) : rankedAbove(K));
        else if (e.outcome === 'both')
          and(
            X,
            K === BOMB ? MOVABLE : K === MINE ? bit(BOMB) : bit(K) | bit(BOMB),
          );
        else if (e.outcome === 'lose')
          and(X, K === MINE ? rankedAbove(ENG) : rankedBelow(K));
      }
      const died = e.outcome === 'lose' || e.outcome === 'both';
      if (e.flags.includes(opp)) and(e.aid, bit(SI));
      else if (died) and(e.aid, ~bit(SI));
    } else if (e.did !== null) {
      const A = e.ak;
      const X = e.did;
      if (A >= 0) {
        if (e.outcome === 'win')
          and(X, rankedBelow(A) | (A === ENG ? bit(MINE) : 0));
        else if (e.outcome === 'both')
          and(X, A === BOMB ? ALL & ~bit(FLAG) : bit(A) | bit(BOMB));
        else if (e.outcome === 'lose')
          and(X, rankedAbove(A) | (A === ENG ? 0 : bit(MINE)));
        else if (e.outcome === 'flag') and(X, bit(FLAG));
      }
      const died = e.outcome === 'win' || e.outcome === 'both';
      if (e.flags.includes(opp)) and(X, bit(SI));
      else if (died) and(X, ~bit(SI));
    }
  }
  const alive = new Map<number, number>();
  for (let i = 0; i < CELLS; i++) {
    const p = view.board[i];
    if (p && p.s === opp) {
      alive.set(p.id, i);
      if (p.k >= 0) masks.set(p.id, bit(p.k));
    }
  }
  if (view.flagShown[opp])
    for (const id of ids)
      if (view.board[alive.get(id) ?? -1]?.k !== FLAG) and(id, ~bit(FLAG));
  // 任何约束都不该把集合清空；万一出现（比如旧数据），退回宽松集合。
  for (const id of ids) if (!masks.get(id)) masks.set(id, ALL);
  return { ids, masks, alive };
}

/** 按数量约束随机抽一份完整的对方阵容（id → 种类）。 */
export function sampleKinds(b: Belief, rng: () => number): Map<number, Kind> {
  // 常见局面保留按剩余数量加权的快速抽样，避免改变各档原有的分布。
  for (let attempt = 0; attempt < 50; attempt++) {
    const left = KINDS.map((k) => COUNTS[k]);
    const order = b.ids
      .map((id) => ({ id, n: popcount(b.masks.get(id)!), r: rng() }))
      .sort((p, q) => p.n - q.n || p.r - q.r);
    const out = new Map<number, Kind>();
    let ok = true;
    for (const { id } of order) {
      const mask = b.masks.get(id)!;
      let total = 0;
      for (const k of KINDS) if (mask & bit(k)) total += left[k];
      if (!total) {
        ok = false;
        break;
      }
      let pick = rng() * total;
      let chosen: Kind = 0;
      for (const k of KINDS)
        if (mask & bit(k) && left[k]) {
          pick -= left[k];
          chosen = k;
          if (pick < 0) break;
        }
      left[chosen]--;
      out.set(id, chosen);
    }
    if (ok) return out;
  }
  // 每枚军棋对应一个数量名额。增广路会重排之前的选择，避免贪心卡住后
  // 丢弃约束，把已亮出的军旗或已移动的棋子抽成不可能的身份。
  const kinds = KINDS.flatMap((k) => Array<Kind>(COUNTS[k]).fill(k));
  const order = b.ids
    .map((id) => ({ id, n: popcount(b.masks.get(id) ?? 0), r: rng() }))
    .sort((p, q) => p.n - q.n || p.r - q.r);
  const candidates = new Map<number, number[]>();
  for (const { id } of order) {
    const mask = b.masks.get(id) ?? 0;
    const slots = kinds.flatMap((k, i) => (mask & bit(k) ? [i] : []));
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    candidates.set(id, slots);
  }
  const owners: (number | undefined)[] = Array(kinds.length).fill(undefined);
  const assign = (id: number, seen: Set<number>): boolean => {
    for (const slot of candidates.get(id)!) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      const owner = owners[slot];
      if (owner === undefined || assign(owner, seen)) {
        owners[slot] = id;
        return true;
      }
    }
    return false;
  };
  for (const { id } of order)
    if (!assign(id, new Set())) throw new Error('无法按已知信息抽样');
  const out = new Map<number, Kind>();
  owners.forEach((id, slot) => {
    if (id !== undefined) out.set(id, kinds[slot]);
  });
  return out;
}
function popcount(m: number) {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}

/** 对方每枚活着的棋子的种类概率（用于展示与测试）。 */
export function marginals(b: Belief, n = 200, rng: () => number = Math.random) {
  const out = new Map<number, number[]>();
  for (const id of b.alive.keys()) out.set(id, Array(12).fill(0));
  for (let t = 0; t < n; t++) {
    const s = sampleKinds(b, rng);
    for (const id of b.alive.keys()) out.get(id)![s.get(id)!] += 1 / n;
  }
  return out;
}

// ---- 搜索用的轻量局面 ----
type P = { s: Side; k: Kind; id: number };
type Board = (P | null)[];
const VAL = [0, 10, 28, 12, 5, 8, 11, 15, 21, 30, 45, 66];
const FLAG_GAIN = 4000;
const WIN = 100000;

/**
 * 预计算：两格之间最少几步（不看占位）。普通棋子沿铁路直线算一步；
 * 工兵整张铁路网都算一步。
 */
function distances(eng: boolean): Uint8Array[] {
  const adj: Set<number>[] = Array.from({ length: CELLS }, () => new Set());
  for (let i = 0; i < CELLS; i++) for (const n of ROAD[i]) adj[i].add(n);
  for (let i = 0; i < CELLS; i++) {
    if (!RAIL[i].length) continue;
    if (eng) {
      const seen = new Set([i]);
      const q = [i];
      for (let h = 0; h < q.length; h++)
        for (const n of RAIL[q[h]])
          if (!seen.has(n)) {
            seen.add(n);
            q.push(n);
            adj[i].add(n);
          }
      continue;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let a = i;
      for (;;) {
        const x = xOf(a) + dx;
        const b = a + dy * 5 + dx;
        if (x < 0 || x > 4 || b < 0 || b >= CELLS || !RAIL[a].includes(b))
          break;
        adj[i].add(b);
        a = b;
      }
    }
  }
  return Array.from({ length: CELLS }, (_, s) => {
    const d = new Uint8Array(CELLS).fill(99);
    d[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++)
      for (const n of adj[q[h]])
        if (d[n] === 99) {
          d[n] = d[q[h]] + 1;
          q.push(n);
        }
    return d;
  });
}
const DIST = distances(false);
const DIST_ENG = distances(true);
const dist = (k: Kind, a: number, b: number) =>
  (k === ENG ? DIST_ENG : DIST)[a][b];

function sim(
  board: Board,
  m: Move,
): { board: Board; flag: boolean; gain: number } {
  const a = board[m.from]!;
  const d = board[m.to];
  const next = board.slice();
  next[m.from] = null;
  if (!d) {
    next[m.to] = a;
    return { board: next, flag: false, gain: 0 };
  }
  const o = resolve(a.k, d.k);
  if (o === 'flag') {
    next[m.to] = a.k === BOMB ? null : a;
    return { board: next, flag: true, gain: FLAG_GAIN };
  }
  if (o === 'win') next[m.to] = a;
  else if (o === 'both') next[m.to] = null;
  const gain = (o === 'lose' ? 0 : VAL[d.k]) - (o === 'win' ? 0 : VAL[a.k]);
  return { board: next, flag: false, gain };
}

function bestGain(board: Board, side: Side): number {
  let best = 0;
  for (let i = 0; i < CELLS; i++) {
    const p = board[i];
    if (!p || p.s !== side || !canMoveKind(p.k) || HQ[i]) continue;
    for (const to of targetsFrom(board, i).keys()) {
      const d = board[to];
      if (!d) continue;
      const o = resolve(p.k, d.k);
      const g =
        o === 'flag'
          ? FLAG_GAIN
          : (o === 'lose' ? 0 : VAL[d.k]) - (o === 'win' ? 0 : VAL[p.k]);
      if (g > best) best = g;
    }
  }
  return best;
}

function staticEval(board: Board, me: Side, flagW: number): number {
  let score = 0;
  let myFlag = -1;
  let oppFlag = -1;
  let oppEng = 0;
  let oppMines = 0;
  for (let i = 0; i < CELLS; i++) {
    const p = board[i];
    if (!p) continue;
    if (p.k === FLAG) {
      if (p.s === me) myFlag = i;
      else oppFlag = i;
    }
    if (p.s !== me && p.k === ENG) oppEng++;
    if (p.s !== me && p.k === MINE) oppMines++;
    const v = VAL[p.k];
    score += p.s === me ? v : -v;
    // 能动的军官往前压一点；在对方半场更有威胁。
    if (p.k > ENG && !HQ[i]) {
      const adv = (p.s === 0 ? yOf(i) < 6 : yOf(i) >= 6) ? 1.2 : 0;
      score += p.s === me ? adv : -adv;
    }
  }
  if (myFlag < 0) return -WIN;
  if (oppFlag < 0) return WIN;
  // 护旗：对方能动的子离我方军旗越近越危险；我方的子离对方军旗越近越好。
  for (let i = 0; i < CELLS; i++) {
    const p = board[i];
    if (!p || !canMoveKind(p.k) || HQ[i]) continue;
    if (p.s !== me) {
      const d = dist(p.k, i, myFlag);
      score -= flagW * (d === 1 ? 30 : d === 2 ? 7 : d === 3 ? 2 : 0);
    } else {
      const d = dist(p.k, i, oppFlag);
      score += d === 1 ? 18 : d === 2 ? 5 : d === 3 ? 1.5 : 0;
    }
  }
  // 对方工兵少了，我方地雷更值钱；我方工兵在对方还有地雷时更值钱。
  score += (3 - oppEng) * 1.5;
  void oppMines;
  return score;
}

function leaf(
  board: Board,
  me: Side,
  toMove: Side,
  spec: LevelSpec,
  flagW: number,
) {
  let v = staticEval(board, me, flagW);
  if (Math.abs(v) >= WIN) return v;
  if (spec.threat)
    v +=
      toMove === me
        ? 0.5 * bestGain(board, me)
        : -0.85 * bestGain(board, (1 - me) as Side);
  return v;
}

/**
 * 对方眼里我方每枚棋子的种类分布（近似）：用同一套推理，但换成对方的视角——
 * 对方知道自己的棋子（取自这份抽样），看不到我方的。
 */
function opponentBelief(
  view: JunqiView,
  me: Side,
  kinds: Map<number, Kind>,
): Map<number, number[]> {
  const opp = (1 - me) as Side;
  const theirs: JunqiView = {
    ...view,
    you: opp,
    board: view.board.map((p) =>
      !p
        ? null
        : p.s === opp
          ? { ...p, k: kinds.get(p.id)! }
          : p.k === FLAG && view.flagShown[me]
            ? p
            : { ...p, k: -1 },
    ),
    log: view.log.map((e) => ({
      ...e,
      ak: e.side === opp ? kinds.get(e.aid)! : -1,
      dk: e.dk === null ? null : e.side === me ? kinds.get(e.did!)! : -1,
    })),
  };
  const b = inferBelief(theirs, opp);
  const out = new Map<number, number[]>();
  for (const id of b.alive.keys()) {
    const m = b.masks.get(id)!;
    const p = KINDS.map((k) => (m & bit(k) ? COUNTS[k] : 0));
    const t = p.reduce((a, c) => a + c, 0) || 1;
    out.set(
      id,
      p.map((x) => x / t),
    );
  }
  return out;
}
function oppEv(a: Kind, dist: number[] | undefined): number {
  if (!dist) return 0;
  let ev = 0;
  for (const k of KINDS) {
    if (!dist[k]) continue;
    const o = resolve(a, k);
    const g =
      o === 'flag'
        ? FLAG_GAIN
        : (o === 'lose' ? 0 : VAL[k]) - (o === 'win' ? 0 : VAL[a]);
    ev += dist[k] * g;
  }
  return ev;
}

/** 选一步。view 必须是 AI 这一方看到的暗棋视图。 */
export function chooseJunqiMove(
  view: JunqiView,
  level: JunqiLevel,
  rng: () => number = Math.random,
  now: () => number = () => Date.now(),
): JunqiAiResult {
  const me = view.toPlay;
  if (view.you !== null && view.you !== me) throw new Error('不是 AI 的回合');
  const opp = (1 - me) as Side;
  const spec = JUNQI_LEVELS[level];
  const moves = movesFor(view.board, me);
  if (!moves.length) throw new Error('无子可动');
  const belief = inferBelief(view, me);
  const t0 = now();
  const flagW = 1;
  const last = [...view.log].reverse().find((e) => e.side === me);
  const sums = new Float64Array(moves.length);
  let n = 0;
  sampling: while (n < spec.samples && now() - t0 < spec.ms) {
    const kinds = sampleKinds(belief, rng);
    const board: Board = view.board.map((p) =>
      !p
        ? null
        : p.s === me
          ? (p as P)
          : { s: opp, k: kinds.get(p.id) ?? ENG, id: p.id },
    );
    const oppView = spec.model ? opponentBelief(view, me, kinds) : null;
    const scores = new Float64Array(moves.length);
    for (let mi = 0; mi < moves.length; mi++) {
      if (now() - t0 >= spec.ms) break sampling;
      const r = sim(board, moves[mi]);
      if (r.flag) {
        scores[mi] = WIN;
        continue;
      }
      if (spec.depth === 1) {
        scores[mi] = leaf(r.board, me, opp, spec, flagW);
        continue;
      }
      // 两步：对方在这份抽样局面里的应着。
      let worst = Infinity;
      const replies = movesFor(r.board, opp);
      if (!replies.length) worst = WIN / 2;
      let modelBest = -Infinity;
      let modelVal = Infinity;
      let quietWorst = Infinity;
      for (const rep of replies) {
        if (now() - t0 >= spec.ms) break sampling;
        const r2 = sim(r.board, rep);
        const v = r2.flag ? -WIN : leaf(r2.board, me, me, spec, flagW);
        if (v < worst) worst = v;
        if (oppView && r.board[rep.to]) {
          // 对方只知道它推理出来的：按它眼里的期望收益挑进攻。
          const ev = oppEv(
            r.board[rep.from]!.k,
            oppView.get(r.board[rep.to]!.id),
          );
          if (ev > modelBest) {
            modelBest = ev;
            modelVal = v;
          }
        } else if (v < quietWorst) quietWorst = v;
        if (!oppView && worst <= -WIN) break;
      }
      if (oppView && replies.length) {
        const believed =
          modelBest > 2
            ? modelVal
            : quietWorst === Infinity
              ? modelVal
              : quietWorst;
        worst = 0.35 * worst + 0.65 * Math.min(believed, quietWorst);
      }
      scores[mi] = worst;
    }
    // 只计入完整一轮，不能让排在前面的候选多拿一份未完成样本的分数。
    for (let mi = 0; mi < moves.length; mi++) sums[mi] += scores[mi];
    n++;
  }
  if (!n) return { move: moves[0], score: 0, samples: 0 };
  let best = 0;
  let bestScore = -Infinity;
  for (let mi = 0; mi < moves.length; mi++) {
    const m = moves[mi];
    let v = sums[mi] / n;
    // 别来回晃：回到上一步出发的格子扣一点分。
    if (last && last.to === m.from && last.from === m.to) v -= 2.5;
    // 别把能动的子塞进自家大本营。
    if (isHq(m.to) && !view.board[m.to]) v -= 6;
    v += (rng() - 0.5) * 2 * spec.noise;
    if (v > bestScore) {
      bestScore = v;
      best = mi;
    }
  }
  if (spec.random && rng() < spec.random) {
    // 新兵偶尔随手走一步（但不白送：只在不亏的着法里挑）。
    const ok = moves
      .map((m, i) => ({ m, v: sums[i] / n }))
      .filter((x) => x.v >= bestScore - 25);
    const pick = ok[Math.floor(rng() * ok.length)];
    if (pick) return { move: pick.m, score: pick.v, samples: n };
  }
  return { move: moves[best], score: bestScore, samples: n };
}
