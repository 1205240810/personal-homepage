import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLACK,
  EMPTY,
  WHITE,
  emptyGoRecords,
  fromRows,
  handicapPoints,
  komiFor,
  loadGoRecords,
  newGame,
  play,
  recordGoGame,
  recordProblem,
  saveGoRecords,
  score,
  toggleDead,
  validateGoRecords,
  type GoState,
} from '../lib/games/go.ts';
import { chooseGoMove, guessDead } from '../lib/games/go-ai.ts';
import {
  GO_PROBLEMS,
  correctMoves,
  playerWinning,
  setup,
  whiteReply,
} from '../lib/games/go-problems.ts';

const at = (s: GoState, x: number, y: number) => y * s.size + x;
const ok = (s: GoState, p: number) => {
  const r = play(s, p);
  assert.ok(r.ok, `illegal ${p}`);
  return r.state;
};
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

void test('提子与禁止自杀', () => {
  let s = fromRows(['.X...', 'XO...', '.X...', '.....', '.....'], BLACK);
  s = ok(s, at(s, 2, 1));
  assert.equal(s.board[at(s, 1, 1)], EMPTY);
  assert.equal(s.captures[BLACK], 1);
  const t = fromRows(['.X...', 'X....', '.....', '.....', '.....'], WHITE);
  const r = play(t, at(t, 0, 0));
  assert.equal(r.ok, false);
  // Capturing makes an otherwise suicidal move legal.
  const u = fromRows(['.XO..', 'XO...', 'O....', '.....', '.....'], WHITE);
  assert.ok(play(u, at(u, 0, 0)).ok);
});

void test('打劫：不能立即提回，隔一手可以', () => {
  let s = fromRows(['.XO..', 'XO.O.', '.XO..', '.....', '.....'], BLACK);
  s = ok(s, at(s, 2, 1)); // black captures (1,1)
  assert.equal(s.board[at(s, 1, 1)], EMPTY);
  const retake = play(s, at(s, 1, 1));
  assert.equal(retake.ok, false);
  s = ok(s, at(s, 4, 4)); // white elsewhere
  s = ok(s, at(s, 4, 3)); // black elsewhere
  assert.ok(play(s, at(s, 1, 1)).ok);
});

void test('数子：子 + 只挨一方的空，贴目与死子', () => {
  const s = fromRows(['.X.O.', '.X.O.', '.X.O.', '.X.O.', '.X.O.'], BLACK);
  const sc = score(s, 0.5);
  assert.equal(sc.black, 10);
  assert.equal(sc.white, 10.5);
  assert.equal(sc.winner, WHITE);
  // Mark the white wall dead → black owns the board.
  const dead = toggleDead(s, new Set(), at(s, 3, 0));
  assert.equal(dead.size, 5);
  assert.equal(score(s, 7.5, dead).black, 25);
  assert.equal(toggleDead(s, dead, at(s, 3, 2)).size, 0);
  assert.equal(komiFor(0), 7.5);
  assert.equal(komiFor(3), 0.5);
});

void test('让子：星位摆放，白先走', () => {
  const g = newGame(19, 4);
  assert.equal(g.toPlay, WHITE);
  assert.equal([...g.board].filter((c) => c === BLACK).length, 4);
  assert.equal(handicapPoints(9, 9).length, 5);
  assert.equal(new Set(handicapPoints(19, 9)).size, 9);
  assert.ok(handicapPoints(19, 5).includes(9 * 19 + 9));
});

void test('死活题：唯一或已知的正解、主线回放、错着有反击', () => {
  for (const p of GO_PROBLEMS) {
    const su = setup(p);
    assert.equal(
      su.state.board[su.target] !== EMPTY,
      true,
      `${p.id} target 不是棋子`,
    );
    // Without a move Black is not already winning (for kill: White to move would live).
    const keys = correctMoves(su);
    assert.ok(keys.length >= 1, `${p.id} 无正解`);
    const [kx, ky] = p.line[0];
    assert.ok(keys.includes(ky * 9 + kx), `${p.id} 主线首手不是正解`);
    // Replay main line; every black move keeps black winning.
    let s = su.state;
    for (const [x, y] of p.line) {
      const mv = x < 0 ? -1 : y * 9 + x;
      const r = play(s, mv);
      assert.ok(r.ok, `${p.id} 主线不合法 ${x},${y}`);
      s = r.state;
      if (s.toPlay === WHITE)
        assert.ok(playerWinning(su, s, su.depth), `${p.id} 主线黑棋失误`);
    }
    if (p.kind === 'live') assert.notEqual(s.board[su.target], EMPTY, p.id);
    else assert.equal(s.board[su.target], EMPTY, `${p.id} 主线结束未提子`);
    // Every wrong first move in the region gets a refutation from White.
    for (const q of su.region) {
      const r = play(su.state, q);
      if (!r.ok || keys.includes(q)) continue;
      assert.equal(
        playerWinning(su, r.state, su.depth - 1),
        false,
        `${p.id} 错着 ${q} 竟然也行`,
      );
      const reply = whiteReply(su, r.state, su.depth - 1);
      if (reply >= 0) {
        const after = play(r.state, reply);
        assert.ok(after.ok);
        assert.equal(
          playerWinning(su, after.state, su.depth - 2),
          false,
          `${p.id} 反击无效`,
        );
      }
    }
  }
});

void test('AI：开局不下一二线，各档都返回合法着法', () => {
  const g = newGame(9);
  let t = 0;
  const clock = () => (t += 1);
  const r = chooseGoMove(g, 7.5, 3, rng(7), clock);
  const x = r.move % 9;
  const y = Math.floor(r.move / 9);
  assert.ok(Math.min(x, y, 8 - x, 8 - y) >= 2, `开局下在 ${x},${y}`);
  assert.ok(r.playouts >= 1000);
  for (const level of [1, 2] as const) {
    const m = chooseGoMove(g, 7.5, level, rng(3), clock);
    assert.ok(m.move === -1 || play(g, m.move).ok);
  }
});

void test('死子估计：被围死的孤子判为死子', () => {
  const s = fromRows(
    [
      'XXXXXXXXX',
      'X.......X',
      'X...O...X',
      'X.......X',
      'XXXXXXXXX',
      'OOOOOOOOO',
      'O.......O',
      'O.......O',
      'OOOOOOOOO',
    ],
    BLACK,
  );
  const dead = guessDead(s, 120, rng(11));
  assert.ok(dead.includes(at(s, 4, 2)));
  assert.ok(!dead.includes(at(s, 0, 0)));
});

void test('本机记录', () => {
  let r = emptyGoRecords();
  r = recordGoGame(recordGoGame(r, '9-3', true), '9-3', false);
  r = recordProblem(recordProblem(r, 'bent-three-kill'), 'bent-three-kill');
  assert.deepEqual(r.games['9-3'], { played: 2, won: 1 });
  assert.deepEqual(r.problems, ['bent-three-kill']);
  assert.equal(
    validateGoRecords({ games: { '7-1': { played: 1, won: 1 } }, problems: [] })
      ?.games['7-1'],
    undefined,
  );
  assert.equal(validateGoRecords(5), null);
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveGoRecords(r, st);
  assert.deepEqual(loadGoRecords(st).games['9-3'], { played: 2, won: 1 });
});
