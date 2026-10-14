/**
 * 生成 lib/games/go-problem-data.ts：
 *   node --experimental-strip-types scripts/gen-go-problems.ts
 * 每道题：用有界穷举求出主线；区域内每个合法的错着都求出白棋的反击和后续最佳应对，
 * 再根据结果（做出两眼、提子、打劫、双活、被点眼……）写出中文说明。
 */
import { writeFileSync } from 'node:fs';
import {
  BLACK,
  EMPTY,
  WHITE,
  coordName,
  play,
  type GoState,
} from '../lib/games/go.ts';
import {
  BASE_PROBLEMS,
  correctMoves,
  playerWinning,
  setup,
  whiteReply,
  type GoProblem,
  type ProblemSetup,
} from '../lib/games/go-problems.ts';

type Pt = [number, number];
const N = 9;
const pt = (p: number): Pt => (p < 0 ? [-1, -1] : [p % N, (p / N) | 0]);
const nm = (p: number) => (p < 0 ? '虚手' : coordName(N, p));

/** Best play from s (both sides), until the target is captured, two passes, or `plies`. */
function bestLine(su: ProblemSetup, s: GoState, depth: number, plies: number) {
  const out: number[] = [];
  let ko = false;
  let capturedBlack = 0;
  for (
    let i = 0;
    i < plies && s.passes < 2 && s.board[su.target] !== EMPTY && depth > 0;
    i++, depth--
  ) {
    let m: number;
    if (s.toPlay === BLACK) {
      const good = correctMoves({ ...su, depth }, s).filter((x) => x >= 0);
      // A losing attacker simply stops; a losing defender resists.
      m = good[0] ?? (su.attacker === BLACK ? -1 : stubborn(su, s));
    } else if (
      su.attacker === BLACK &&
      !playerWinning(su, (play(s, -1) as { state: GoState }).state, depth - 1)
    )
      m = -1; // White is already safe: no need to fill its own eyes.
    else m = whiteReply(su, s, depth);
    const r = play(s, m);
    if (!r.ok) break;
    if (s.toPlay === WHITE) capturedBlack += r.captured.length;
    s = r.state;
    if (s.ko >= 0) ko = true;
    out.push(m);
    if (m < 0 && s.passes >= 1 && s.toPlay === BLACK && su.attacker === WHITE)
      break;
  }
  return { moves: out, end: s, ko, capturedBlack };
}
/** Black's most natural move when nothing wins: the first legal region move. */
function stubborn(su: ProblemSetup, s: GoState) {
  return su.region.find((p) => s.board[p] === EMPTY && play(s, p).ok) ?? -1;
}

const nb = (p: number) => {
  const x = p % N;
  const y = (p / N) | 0;
  return [
    x > 0 ? p - 1 : -1,
    x < N - 1 ? p + 1 : -1,
    y > 0 ? p - N : -1,
    y < N - 1 ? p + N : -1,
  ].filter((q) => q >= 0);
};

function why(
  p: GoProblem,
  su: ProblemSetup,
  wrong: number,
  reply: number,
  rest: ReturnType<typeof bestLine>,
  keys: number[],
) {
  const end = rest.end;
  const seq = [reply, ...rest.moves]
    .filter((m, i, a) => !(m < 0 && a.slice(i).every((x) => x < 0)))
    .map((m, i) => `${i % 2 === 0 ? '白' : '黑'}${nm(m)}`)
    .join('、');
  const parts: string[] = [];
  const selfFill =
    wrong >= 0 &&
    nb(wrong).every((q) => su.state.board[q] !== WHITE) &&
    p.kind !== 'kill' &&
    p.kind !== 'capture';
  if (wrong < 0)
    parts.push(`虚手等于把先手让给白棋：白 ${nm(reply)} 抢先占到要点`);
  else if (selfFill)
    parts.push(
      `${nm(wrong)} 是在自己的眼位里落子，眼位反而变小；白 ${nm(reply)} 趁机占到要点`,
    );
  else if (keys.includes(reply)) parts.push(`白 ${nm(reply)} 抢先占了要点`);
  else parts.push(`白 ${nm(reply)} 正好应对`);
  const afterReply = play(
    (play(su.state, wrong) as { state: GoState }).state,
    reply,
  ) as {
    state: GoState;
  };
  if (p.kind === 'live' && afterReply.state.board[su.target] === EMPTY)
    return `${wrong >= 0 ? `${nm(wrong)} 紧掉了自己的气，` : ''}白 ${nm(reply)} 直接提掉整块黑棋。`;
  if (p.kind === 'live') {
    if (end.board[su.target] === EMPTY)
      parts.push(`接下来（${seq}）目标黑棋最终被提掉`);
    else if (rest.ko) parts.push(`接下来（${seq}）变成打劫，黑棋不能净活`);
    else parts.push(`之后（${seq}）黑棋做不出两只眼`);
  } else {
    if (rest.ko)
      parts.push(
        `接下来（${seq}）只能打劫，本题要求净${p.kind === 'kill' ? '杀' : '吃'}`,
      );
    else parts.push(`之后（${seq}）在本题限定区域内，白可以保住目标棋块`);
    if (rest.capturedBlack)
      parts.push(`你下进去的 ${rest.capturedBlack} 颗子也被提掉`);
  }
  return parts.join('，') + '。';
}

const data: Record<
  string,
  { line: Pt[]; wrong: { at: Pt; line: Pt[]; why: string }[] }
> = {};
for (const p of BASE_PROBLEMS) {
  const t = Date.now();
  const su = setup(p);
  const keys = correctMoves(su);
  let line: Pt[] = p.line;
  if (!line.length) {
    const first = keys[0];
    if (first === undefined) throw new Error(`${p.id} 没有正解`);
    const r = play(su.state, first);
    if (!r.ok) throw new Error(p.id);
    const rest = bestLine(
      su,
      r.state,
      su.depth - 1,
      p.kind === 'live' ? (first < 0 || p.koGoal ? 0 : 1) : su.depth - 1,
    );
    line = [first, ...rest.moves].map(pt);
  }
  const wrong = [];
  for (const q of su.region) {
    if (keys.includes(q) || (q >= 0 && su.state.board[q] !== EMPTY)) continue;
    const r = play(su.state, q);
    if (!r.ok) continue;
    if (playerWinning(su, r.state, su.depth - 1))
      throw new Error(`${p.id} ${q} 竟然也行`);
    const reply = whiteReply(su, r.state, su.depth - 1);
    const after = play(r.state, reply);
    if (!after.ok) throw new Error(`${p.id} 反击不合法`);
    if (playerWinning(su, after.state, su.depth - 2))
      throw new Error(`${p.id} 反击无效`);
    const rest = bestLine(su, after.state, su.depth - 2, 6);
    wrong.push({
      at: pt(q),
      line: [reply, ...rest.moves].map(pt),
      why: why(p, su, q, reply, rest, keys),
    });
  }
  data[p.id] = { line, wrong };
  console.log(
    p.id,
    Date.now() - t,
    'ms keys',
    keys.map(nm).join(','),
    'line',
    line.map((x) => x.join(',')).join(' '),
    'wrong',
    wrong.length,
  );
  for (const w of wrong) console.log('   ', w.at.join(','), w.why);
}
writeFileSync(
  new URL('../lib/games/go-problem-data.ts', import.meta.url),
  `/* 由 scripts/gen-go-problems.ts 生成，请勿手改；测试会重新穷举验证。 */
type Pt = [number, number];
export const GO_PROBLEM_DATA: Record<
  string,
  { line: Pt[]; wrong: { at: Pt; line: Pt[]; why: string }[] }
> = ${JSON.stringify(data, null, 2)};
`,
);
