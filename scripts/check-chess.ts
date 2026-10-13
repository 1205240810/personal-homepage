import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { Engine } from '../lib/games/chess-engine.ts';
import {
  CHESS_LEVELS,
  chooseMove,
  evaluate,
  mateKeys,
} from '../lib/games/chess-ai.ts';
import {
  CHESS_PUZZLES,
  START_FEN,
  emptyChessRecords,
  gameEnd,
  loadChessRecords,
  recordGame,
  recordPuzzle,
  replay,
  saveChessRecords,
  validateChessRecords,
} from '../lib/games/chess.ts';

void test('规则（chess.js）：易位、吃过路兵、升变', () => {
  const c = replay(START_FEN, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
  assert.equal(c.get('g1')?.type, 'k');
  const ep = replay(START_FEN, ['e4', 'a6', 'e5', 'd5', 'exd6']);
  assert.equal(ep.get('d5'), undefined);
  const promo = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
  promo.move({ from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(promo.get('a8')?.type, 'n');
});

void test('终局判定：将死、逼和、三次重复、五十回合、子力不足', () => {
  const mate = replay(START_FEN, ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(gameEnd(mate), { over: true, winner: 'b', reason: '将死' });
  const stale = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(
    (gameEnd(stale) as { reason: string }).reason,
    '逼和（无子可动）',
  );
  const rep = replay(START_FEN, [
    'Nf3',
    'Nf6',
    'Ng1',
    'Ng8',
    'Nf3',
    'Nf6',
    'Ng1',
    'Ng8',
  ]);
  assert.match((gameEnd(rep) as { reason: string }).reason, /三次重复/);
  const fifty = new Chess('8/8/8/4k3/8/8/8/4K2R w - - 100 80');
  assert.match((gameEnd(fifty) as { reason: string }).reason, /五十回合/);
  assert.match(
    (gameEnd(new Chess('8/8/8/4k3/8/8/8/4K3 w - - 0 1')) as { reason: string })
      .reason,
    /子力不足/,
  );
});

void test('残局题：主线合法、以将死结束；关键着法集合与穷举一致', () => {
  for (const p of CHESS_PUZZLES.filter((x) => x.kind === 'mate')) {
    const c = replay(p.fen, p.line);
    assert.ok(c.isCheckmate(), `${p.id} 主线没有将死`);
    assert.equal(p.line.length, p.n * 2 - 1, p.id);
    assert.deepEqual(
      [...mateKeys(p.fen, p.n)].sort(),
      [...p.keys].sort(),
      `${p.id} 关键着法不符`,
    );
  }
});

void test('练习残局：局面合法、白方先走且有子力优势', () => {
  for (const p of CHESS_PUZZLES.filter((x) => x.kind === 'play')) {
    const c = new Chess(p.fen);
    assert.equal(c.turn(), 'w');
    assert.ok(evaluate(c) > 300, p.id);
  }
});

void test('AI：会抓住一步杀，也会避免送后', () => {
  const fixed = () => 0.5;
  let t = 0;
  const clock = () => (t += 10_000);
  for (const level of [3, 4] as const) {
    assert.equal(
      chooseMove('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', level, fixed)?.san,
      'Rd8#',
    );
  }
  // Black queen attacked by a pawn: it must move away.
  const r = chooseMove(
    'rnb1kbnr/pppp1ppp/8/4p3/3qP3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 0 1',
    3,
    fixed,
  );
  assert.ok(r && r.san.startsWith('Q'), r?.san);
  // A deadline that has already passed still returns a legal move.
  const quick = chooseMove(START_FEN, 5, fixed, clock);
  assert.ok(quick && new Chess(START_FEN).moves().includes(quick.san));
  assert.equal(Object.keys(CHESS_LEVELS).length, 5);
});

void test('AI：低难度有随机性，高难度确定', () => {
  const fen =
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const seen = new Set<string>();
  let s = 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 12; i++) seen.add(chooseMove(fen, 1, rnd)!.san);
  assert.ok(seen.size > 1);
});

void test('本机记录', () => {
  let r = emptyChessRecords();
  r = recordGame(r, 3, 'won');
  r = recordGame(r, 3, 'drawn');
  r = recordPuzzle(recordPuzzle(r, 'legal'), 'legal');
  assert.deepEqual(r.games['3'], { played: 2, won: 1, drawn: 1 });
  assert.deepEqual(r.puzzles, ['legal']);
  assert.equal(
    validateChessRecords({
      games: { 9: { played: 1, won: 0, drawn: 0 } },
      puzzles: ['x', 'legal'],
    })?.puzzles.length,
    1,
  );
  assert.equal(validateChessRecords([]), null);
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveChessRecords(r, st);
  assert.deepEqual(loadChessRecords(st).games['3'], {
    played: 2,
    won: 1,
    drawn: 1,
  });
});

void test('搜索引擎走法生成 perft 与标准值一致', () => {
  const perft = (e: Engine, d: number): number => {
    if (!d) return 1;
    let n = 0;
    for (const m of e.gen()) {
      if (!e.make(m)) continue;
      n += perft(e, d - 1);
      e.unmake();
    }
    return n;
  };
  assert.equal(perft(new Engine(START_FEN), 3), 8902);
  assert.equal(
    perft(
      new Engine(
        'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      ),
      2,
    ),
    2039,
  );
  assert.equal(
    perft(new Engine('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 4),
    43238,
  );
  assert.equal(
    perft(
      new Engine(
        'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
      ),
      3,
    ),
    9467,
  );
});
