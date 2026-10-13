/**
 * 自对弈：node --experimental-strip-types scripts/bench/chess-match.ts <mode> <games> <ms>
 * mode = v2v1 （新引擎 vs 旧引擎，同样思考时间）或 levels:a:b（两档难度对比）。
 */
import { Chess } from 'chess.js';
import {
  chooseMove,
  searchBest,
  type ChessLevel,
  CHESS_LEVELS,
} from '../../lib/games/chess-ai.ts';
import { chooseMove as chooseV1, CHESS_LEVELS as V1 } from './chess-ai-v1.ts';

const [mode = 'v2v1', gamesArg = '10', msArg = '200'] = process.argv.slice(2);
const games = Number(gamesArg);
const ms = Number(msArg);
const OPENINGS = [
  'e4 e5',
  'e4 c5',
  'd4 d5',
  'd4 Nf6',
  'c4 e5',
  'e4 e6',
  'e4 c6',
  'Nf3 d5',
  'e4 d5',
  'd4 f5',
  'g3 d5',
  'b3 e5',
  'e4 Nf6',
  'd4 e6',
  'c4 c5',
  'e4 g6',
  'f4 d5',
  'Nc3 d5',
  'e4 d6',
  'd4 g6',
];
let s = 12345;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

type Player = (fen: string, hist: string[]) => string;
function v2Player(level?: ChessLevel): Player {
  return (fen, hist) => {
    if (level) return chooseMove(fen, level, rnd, undefined, hist)!.san;
    const r = searchBest(fen, { maxDepth: 64, timeMs: ms, history: hist });
    const c = new Chess(fen);
    const lan = r.engine.moveKey(r.scored[0].m);
    return c.moves({ verbose: true }).find((m) => m.lan === lan)!.san;
  };
}
function v1Player(): Player {
  (V1 as Record<number, { timeMs: number; maxDepth: number }>)[5].timeMs = ms;
  (V1 as Record<number, { timeMs: number; maxDepth: number }>)[5].maxDepth = 64;
  return (fen) => chooseV1(fen, 5, () => 0.5)!.san;
}

function play(white: Player, black: Player, opening: string) {
  const c = new Chess();
  for (const m of opening.split(' ')) c.move(m);
  const hist: string[] = [];
  while (!c.isGameOver() && c.history().length < 200) {
    hist.push(c.fen());
    const p = c.turn() === 'w' ? white : black;
    c.move(p(c.fen(), hist.slice(0, -1)));
  }
  if (c.isCheckmate()) return c.turn() === 'w' ? 0 : 1;
  return 0.5;
}

let a: Player, b: Player, label: string;
if (mode === 'v2v1') {
  a = v2Player();
  b = v1Player();
  label = `新引擎 vs 旧引擎 @${ms}ms/步`;
} else {
  const [, x, y] = mode.split(':').map(Number);
  // Scale every level's time budget by ms/1000 for quick samples (depth limits unchanged).
  for (const k of [x, y] as ChessLevel[])
    CHESS_LEVELS[k].timeMs = Math.max(
      30,
      Math.round((CHESS_LEVELS[k].timeMs * ms) / 1000),
    );
  a = v2Player(y as ChessLevel);
  b = v2Player(x as ChessLevel);
  label = `等级 ${y} vs 等级 ${x}（思考时间 ×${ms / 1000}）`;
}
let score = 0;
let w = 0,
  d = 0,
  l = 0;
for (let g = 0; g < games; g++) {
  const op = OPENINGS[Math.floor(g / 2) % OPENINGS.length];
  const aWhite = g % 2 === 0;
  const r = aWhite ? play(a, b, op) : 1 - play(b, a, op);
  score += r;
  if (r === 1) w++;
  else if (r === 0) l++;
  else d++;
}
console.log(`${label}: ${score}/${games}（胜 ${w} 和 ${d} 负 ${l}）`);
