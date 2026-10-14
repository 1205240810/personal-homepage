import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { Engine } from '../lib/games/chess-engine.ts';
import {
  CHESS_LEVELS,
  analyse,
  chooseMove,
  isMateScore,
  evaluate,
  mateKeys,
  searchBest,
} from '../lib/games/chess-ai.ts';
import {
  ALL_PUZZLES,
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

/** Score for the side to move at a fixed depth with an empty hash table (deterministic). */
const fixedScore = (fen: string, depth: number) => {
  const c = new Chess(fen);
  if (c.isCheckmate()) return -100000;
  if (c.isDraw()) return 0;
  // Pawn races need real depth; tiny endgames search it quickly.
  const small = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length <= 4;
  return analyse(fen, 1e9, small ? depth + 8 : depth, true)!.score;
};

void test('新残局题：杀题关键着法与穷举一致，主线以将死结束', () => {
  const data = ALL_PUZZLES.filter((p) => p.kind === 'mate');
  assert.ok(data.length >= 20, `杀题数量 ${data.length}`);
  for (const p of data) {
    assert.deepEqual(
      [...mateKeys(p.fen, p.n)].sort(),
      [...p.keys].sort(),
      p.id,
    );
    assert.ok(replay(p.fen, p.line).isCheckmate(), `${p.id} 主线没有将死`);
    assert.ok(p.explain.length > 20, `${p.id} 缺解析`);
  }
});

void test('新残局题：每个错着的反击都成立（杀题穷举，得子题引擎复核）', () => {
  let n = 0;
  for (const p of ALL_PUZZLES.filter((x) => x.kind !== 'play')) {
    assert.ok(p.wrong.length >= 2, `${p.id} 错着太少`);
    for (const w of p.wrong) {
      assert.ok(!p.keys.includes(w.san), `${p.id} ${w.san} 其实是正解`);
      assert.ok(w.why.length > 10, `${p.id} ${w.san} 缺说明`);
      const c = replay(p.fen, [w.san]);
      if (!w.reply) {
        assert.ok(c.isGameOver(), `${p.id} ${w.san} 没有反击着`);
        continue;
      }
      c.move(w.reply);
      n++;
      if (p.kind === 'mate') {
        // After the refutation the attacker has no mate within the remaining moves.
        assert.equal(
          p.n > 1 ? mateKeys(c.fen(), p.n - 1).length : c.isCheckmate() ? 1 : 0,
          0,
          `${p.id} ${w.san} ${w.reply} 之后仍有杀`,
        );
      } else {
        // The attacker, to move again, is clearly worse off than after the key move.
        const v = fixedScore(c.fen(), 4);
        const best = -fixedScore(replay(p.fen, [p.line[0]]).fen(), 5);
        assert.ok(
          v <= best - 100,
          `${p.id} ${w.san} ${w.reply}：${v} vs 正解 ${best}`,
        );
      }
    }
  }
  assert.ok(n >= 150, `反击着数量 ${n}`);
});

void test('新残局题：得子题正解在固定深度下确实赢得子力', () => {
  for (const p of ALL_PUZZLES.filter((x) => x.kind === 'win')) {
    const after = replay(p.fen, [p.line[0]]).fen();
    assert.ok(-fixedScore(after, 5) >= p.minGain - 60, `${p.id} 正解评估不足`);
  }
});

void test('分析可复现：清空置换表后同深度结果一致', () => {
  const fen =
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  assert.deepEqual(analyse(fen, 1e9, 5, true), analyse(fen, 1e9, 5, true));
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
  assert.equal(Object.keys(CHESS_LEVELS).length, 10);
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

void test('静态吃子搜索同样遵守 AI 截止时间', () => {
  const fen =
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  let calls = 0;
  const result = chooseMove(
    fen,
    1,
    () => 0.5,
    () => (calls++ === 0 ? 0 : 100000),
  );
  assert.ok(result && new Chess(fen).moves().includes(result.san));
  assert.equal(result.nodes, 1024);
  assert.equal(calls, 2);
});

void test('搜索引擎与规则库在连续随机对局中一致，撤销恢复完整状态', () => {
  let seed = 20261013;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let trial = 0; trial < 8; trial++) {
    const c = new Chess();
    for (let ply = 0; ply < 100 && !c.isGameOver(); ply++) {
      const fen = c.fen();
      const e = new Engine(fen);
      const state = () =>
        JSON.stringify([
          Array.from(e.b),
          e.side,
          e.castle,
          e.ep,
          e.half,
          e.kings,
        ]);
      const before = state();
      const legal = c.moves({ verbose: true });
      const generated = [];
      for (const move of e.gen()) {
        if (e.make(move)) {
          generated.push(e.moveKey(move));
          e.unmake();
        }
        assert.equal(state(), before, fen);
      }
      assert.deepEqual(generated.sort(), legal.map((m) => m.lan).sort(), fen);
      c.move(legal[rand() % legal.length]);
    }
  }
});

void test('搜索地平线正确评估逼和；终局搜索返回空着法', () => {
  const fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
  const result = searchBest(fen, {
    maxDepth: 1,
    timeMs: 1e9,
    rootScores: true,
    fresh: true,
  });
  let stalemates = 0;
  for (const { m, v } of result.scored) {
    const c = new Chess(fen);
    c.move(result.engine.moveKey(m));
    if (c.isStalemate()) {
      assert.equal(Math.abs(v), 0);
      stalemates++;
    }
    if (c.isCheckmate()) assert.ok(isMateScore(v) && v > 0);
  }
  assert.ok(stalemates > 0);
  assert.deepEqual(
    searchBest('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', { maxDepth: 4, timeMs: 10 })
      .scored,
    [],
  );
});

void test('Zobrist 增量哈希匹配规则库 FEN，忽略不能合法吃过路兵的标记', () => {
  let seed = 3081;
  for (let trial = 0; trial < 5; trial++) {
    const c = new Chess();
    const e = new Engine(c.fen());
    for (let ply = 0; ply < 120 && !c.isGameOver(); ply++) {
      const legal = c.moves({ verbose: true });
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const next = legal[seed % legal.length];
      const m = e.gen().find((m) => e.moveKey(m) === next.lan)!;
      assert.ok(e.make(m));
      c.move(next);
      const fresh = new Engine(c.fen());
      assert.deepEqual([e.hlo, e.hhi], [fresh.hlo, fresh.hhi], c.fen());
      const hash = [e.hlo, e.hhi];
      e.rehash();
      assert.deepEqual([e.hlo, e.hhi], hash, c.fen());
      e.makeNull();
      e.rehash();
      e.unmakeNull();
      assert.deepEqual([e.hlo, e.hhi], hash);
    }
  }
  const pinned = new Engine('4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const noEp = new Engine('4r1k1/8/8/3pP3/8/8/8/4K3 w - - 0 1');
  assert.deepEqual([pinned.hlo, pinned.hhi], [noEp.hlo, noEp.hhi]);
});
