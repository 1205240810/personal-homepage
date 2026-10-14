/**
 * 生成 lib/games/chess-puzzle-data.ts：
 *   node --experimental-strip-types scripts/gen-chess-puzzles.ts
 * 对每道题：穷举（杀题）或固定深度引擎（得子题）得出所有正确首着；列出“看似合理”的错着
 * （所有将军、所有吃子、引擎排名靠前的着法），为每个错着用引擎找出反击并写出中文说明。
 */
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { CHESS_PUZZLES } from '../lib/games/chess.ts';
import {
  analyse,
  isMateScore,
  mateIn,
  mateKeys,
  searchBest,
} from '../lib/games/chess-ai.ts';
import { SPECS, OLD_EXPLAIN, type PuzzleSpec } from './chess-puzzle-spec.ts';

export const DEPTH = 7;
const NAMES: Record<string, string> = {
  k: '王',
  q: '后',
  r: '车',
  b: '象',
  n: '马',
  p: '兵',
};

/** Score of every legal move at fixed depth, from the mover's view. */
function scoreMoves(fen: string, depth = DEPTH) {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).map((m) => {
    c.move(m);
    const r = c.isGameOver() ? null : analyse(c.fen(), 1e9, depth - 1, true);
    const v = c.isCheckmate() ? 100000 : c.isDraw() ? 0 : -(r?.score ?? 0);
    c.undo();
    return {
      san: m.san,
      v,
      check: m.san.includes('+') || m.san.includes('#'),
      capture: !!m.captured,
    };
  });
}

/** Does the attacker threaten mate after `wrong` if the defender could pass? */
function threatened(fen: string, wrong: string, n: number) {
  const c = new Chess(fen);
  c.move(wrong);
  if (c.inCheck()) return false;
  const f = c.fen().split(' ');
  f[1] = f[1] === 'w' ? 'b' : 'w';
  f[3] = '-';
  try {
    return mateKeys(f.join(' '), Math.min(n, 2)).length > 0;
  } catch {
    return false;
  }
}

const fmt = (v: number) =>
  isMateScore(v)
    ? v > 0
      ? `${mateIn(v)} 步杀`
      : `被 ${-mateIn(v)} 步杀`
    : `${v > 0 ? '+' : ''}${(v / 100).toFixed(1)}`;

function why(
  fen: string,
  wrong: string,
  reply: string,
  after: number,
  spec: { kind: string; n: number },
  keyScore: number,
) {
  const c = new Chess(fen);
  const w = c.move(wrong);
  const r = c.move(reply);
  const prefix = w.san.includes('+') ? '将军不等于将杀。' : '';
  const threat =
    spec.kind === 'mate' && !r.captured && threatened(fen, wrong, spec.n);
  let head: string;
  if (r.captured)
    head = `对方 ${r.san} 吃掉你的${NAMES[r.captured]}${r.san.includes('+') ? '并反将' : ''}`;
  else if (r.san.includes('+')) head = `对方 ${r.san} 反将一军`;
  else if (threat) {
    const k = c
      .board()
      .flat()
      .find((p) => p && p.type === 'k' && p.color === r.color)!.square;
    const luft =
      r.piece === 'p' && Math.abs(r.from.charCodeAt(0) - k.charCodeAt(0)) <= 1;
    head = `这步虽然威胁杀棋，但给了对方一步时间：${
      r.piece === 'k'
        ? `${r.san} 让王提前躲开`
        : luft
          ? `${r.san} 给王开出“透气孔”`
          : `${r.san} 及时防住了`
    }`;
  } else if (r.piece === 'k') head = `对方的王走 ${r.san} 躲开`;
  else if (w.san.includes('+')) head = `对方 ${r.san} 垫将化解`;
  else head = `对方 ${r.san} 从容应对`;
  const parts = [prefix + head];
  let tail: string;
  if (isMateScore(after) && after < 0)
    tail = `之后你反而会被将死（${fmt(after)}）。`;
  else if (spec.kind === 'mate')
    tail =
      after > 300
        ? `之后你仍占优（引擎约 ${fmt(after)}），但已经没有 ${spec.n} 步内的强制将杀了。`
        : `之后局面约 ${fmt(after)}，杀棋机会消失了。`;
  else tail = `之后局面约 ${fmt(after)}，而正解能达到约 ${fmt(keyScore)}。`;
  return `${parts.join('，')}；${tail}`;
}

function build(spec: PuzzleSpec | (PuzzleSpec & { fenOnly: string })) {
  const c = new Chess();
  if (spec.fen) c.load(spec.fen);
  else for (const m of spec.moves!.split(' ')) c.move(m);
  const fen = c.fen();
  const scored = scoreMoves(fen).sort((a, b) => b.v - a.v);
  let keys: string[];
  if (spec.kind === 'mate') keys = mateKeys(fen, spec.n);
  else
    keys = scored
      .filter((m) => m.v >= spec.n && m.v >= scored[0].v - 60)
      .map((m) => m.san);
  if (!keys.includes(spec.key))
    throw new Error(
      `${spec.id}: 预期首着 ${spec.key} 不在正解 ${keys.join('、')} 里（最佳 ${scored[0].san} ${scored[0].v}）`,
    );
  const keyScore = scored.find((m) => m.san === spec.key)!.v;
  // Main line: key, best defence, then best continuation (up to mate / 5 plies).
  const line = [spec.key];
  const lc = new Chess(fen);
  lc.move(spec.key);
  for (
    let ply = 1;
    ply < (spec.kind === 'mate' ? spec.n * 2 - 1 : 3) && !lc.isGameOver();
    ply++
  ) {
    let mv: string;
    if (spec.kind === 'mate' && ply % 2 === 0) {
      // Attacker: a move that keeps the forced mate.
      mv = mateKeys(lc.fen(), spec.n - ply / 2)[0];
    } else mv = analyse(lc.fen(), 1e9, DEPTH - 1, true)!.san;
    lc.move(mv);
    line.push(mv);
  }
  // Plausible wrong moves: every check and capture, plus the engine's top choices.
  // Checks and captures first, then moves of the key piece, then the engine's next choices.
  const keyPiece = new Chess(fen).move(spec.key).from;
  const from = new Map(
    new Chess(fen).moves({ verbose: true }).map((m) => [m.san, m.from]),
  );
  const rank = (m: (typeof scored)[number]) =>
    m.check ? 0 : m.capture ? 1 : from.get(m.san) === keyPiece ? 2 : 3;
  const plausible = scored
    .filter((m) => !keys.includes(m.san))
    .filter((m, i) => rank(m) < 3 || i < 6)
    .sort((a, b) => rank(a) - rank(b) || b.v - a.v)
    .slice(0, 12);
  const wrong = plausible.map((m) => {
    const wc = new Chess(fen);
    wc.move(m.san);
    if (wc.isGameOver())
      return {
        san: m.san,
        reply: '',
        score: m.v,
        why: wc.isStalemate() ? '这步造成逼和，煮熟的鸭子飞了。' : '对局结束。',
      };
    const r = searchBest(wc.fen(), {
      maxDepth: DEPTH - 1,
      timeMs: 1e9,
      fresh: true,
    });
    const legal = wc.moves({ verbose: true });
    const reply = legal.find(
      (x) => x.lan === r.engine.moveKey(r.scored[0].m),
    )!.san;
    const after = -r.scored[0].v;
    return {
      san: m.san,
      reply,
      score: after,
      why: why(fen, m.san, reply, after, spec, keyScore),
    };
  });
  return {
    id: spec.id,
    name: spec.name,
    fen,
    kind: spec.kind,
    n: spec.kind === 'mate' ? spec.n : 0,
    minGain: spec.kind === 'win' ? spec.n : 0,
    line,
    keys,
    note: spec.note,
    explain: spec.explain,
    wrong,
  };
}

const out = [];
for (const p of CHESS_PUZZLES.filter((x) => x.kind === 'mate')) {
  const t = Date.now();
  out.push(
    build({
      id: p.id,
      name: p.name,
      fen: p.fen,
      kind: 'mate',
      n: p.n,
      key: p.line[0],
      note: p.note,
      explain: OLD_EXPLAIN[p.id],
    }),
  );
  console.log(p.id, Date.now() - t, 'ms');
}
for (const s of SPECS) {
  const t = Date.now();
  try {
    out.push(build(s));
    console.log(
      s.id,
      Date.now() - t,
      'ms',
      out[out.length - 1].keys.join(','),
      '|',
      out[out.length - 1].line.join(' '),
      '| wrong',
      out[out.length - 1].wrong.length,
    );
  } catch (e) {
    console.log('SKIP', (e as Error).message);
  }
}
writeFileSync(
  new URL('../lib/games/chess-puzzle-data.ts', import.meta.url),
  `/* 由 scripts/gen-chess-puzzles.ts 生成，请勿手改；测试会重新验证。 */
import type { PuzzleData } from './chess.ts';

export const PUZZLE_DATA: PuzzleData[] = ${JSON.stringify(out, null, 2)};
`,
);
