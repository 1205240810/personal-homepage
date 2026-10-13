/**
 * 围棋自对弈：node --experimental-strip-types scripts/bench/go-match.ts <mode> <games> <ms> [size]
 *   mode = v2v1：新 AI vs 旧 AI，每步同样思考时间 ms
 *   mode = levels:a:b：两档难度对比（时间按 ms/1000 缩放，不复用搜索树）
 * 每组开局交换黑白；双方连续虚手、认输或手数上限时结束，用蒙特卡洛判死子后数子（贴 7.5）。
 */
import {
  BLACK,
  WHITE,
  newGame,
  play,
  score,
  type GoState,
} from '../../lib/games/go.ts';
import {
  GO_LEVELS,
  chooseGoMove,
  guessDead,
  resetGoTree,
  type GoLevel,
} from '../../lib/games/go-ai.ts';
import { GO_LEVELS as V1, chooseGoMove as chooseV1 } from './go-ai-v1.ts';

const [mode = 'v2v1', gamesArg = '10', msArg = '500', sizeArg = '9'] =
  process.argv.slice(2);
const games = Number(gamesArg);
const ms = Number(msArg);
const size = Number(sizeArg);
let seed = Number(process.env.SEED ?? 99);
const OFFSET = Number(process.env.OFFSET ?? 0);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
type Bot = (s: GoState) => number;

function v2(level: GoLevel | null, reuse: boolean): Bot {
  return (s) => {
    if (level === null) {
      GO_LEVELS[8].timeMs = ms;
      return chooseGoMove(s, 7.5, 8, rnd, undefined, { reuse }).move;
    }
    const cfg = GO_LEVELS[level];
    const keep = cfg.timeMs;
    cfg.timeMs = Math.max(30, (keep * ms) / 1000);
    const m = chooseGoMove(s, 7.5, level, rnd, undefined, {
      reuse: false,
    }).move;
    cfg.timeMs = keep;
    return m;
  };
}
function v1(): Bot {
  V1[4].timeMs = ms;
  return (s) => chooseV1(s, 7.5, 4, rnd).move;
}

// First move for each pair of games (black's), spread over the board.
const c = (size - 1) / 2;
const OPEN = [
  c * size + c,
  2 * size + 2,
  2 * size + (size - 3),
  3 * size + 2,
  2 * size + c,
  (size - 3) * size + 3,
  3 * size + 3,
  c * size + 2,
];

function game(black: Bot, white: Bot, first: number) {
  resetGoTree();
  let s = newGame(size);
  s = (play(s, first) as { state: GoState }).state;
  for (let i = 0; i < size * size * 3; i++) {
    if (s.passes >= 2) break;
    const m = (s.toPlay === BLACK ? black : white)(s);
    if (m === -2) return s.toPlay === BLACK ? WHITE : BLACK;
    const r = play(s, m);
    s = r.ok ? r.state : (play(s, -1) as { state: GoState }).state;
  }
  return score(s, 7.5, new Set(guessDead(s, 400, rnd))).winner;
}

let a: Bot, b: Bot, label: string;
if (mode === 'v2v1') {
  a = v2(null, true);
  b = v1();
  label = `新 AI vs 旧 AI @${ms}ms/步 ${size}路`;
} else {
  const [, x, y] = mode.split(':').map(Number);
  a = v2(x as GoLevel, false);
  b = v2(y as GoLevel, false);
  label = `等级 ${x} vs 等级 ${y}（思考时间 ×${ms / 1000}）${size}路`;
}
let win = 0;
for (let g = 0; g < games; g++) {
  const first = OPEN[((g >> 1) + OFFSET) % OPEN.length];
  const aBlack = g % 2 === 0;
  const w = aBlack ? game(a, b, first) : game(b, a, first);
  const aWon = (w === BLACK) === aBlack;
  if (aWon) win++;
  console.log(
    `第 ${g + 1} 局：A 执${aBlack ? '黑' : '白'}，${aWon ? 'A' : 'B'} 胜`,
  );
}
console.log(`${label}: ${win}/${games}`);
