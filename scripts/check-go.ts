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
import {
  GO_LEVELS,
  chooseGoMove,
  guessDead,
  resetGoTree,
} from '../lib/games/go-ai.ts';
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
    assert.ok(
      keys.includes(kx < 0 ? -1 : ky * 9 + kx),
      `${p.id} 主线首手不是正解`,
    );
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

// Independent fixed-point proof, with no search-depth cut-off and passing for
// both players. Cycles outside the capture attractor are survival, not capture.
function exactCaptures(su: ReturnType<typeof setup>) {
  const key = (s: GoState) => `${s.toPlay}:${s.ko}:${s.board.join('')}`;
  const states = [su.state];
  const ids = new Map([[key(su.state), 0]]);
  const parents: number[][] = [[]];
  const remaining: number[] = [];
  const wins: boolean[] = [];
  for (let i = 0; i < states.length; i++) {
    assert.ok(states.length < 10000, '局部题状态图异常增大');
    const s = states[i];
    wins[i] = s.board[su.target] === EMPTY;
    remaining[i] = 0;
    if (wins[i]) continue;
    for (const move of [-1, ...su.region]) {
      const r = play(s, move);
      if (!r.ok) continue;
      r.state.moves = [];
      const k = key(r.state);
      let next = ids.get(k);
      if (next === undefined) {
        next = states.length;
        states.push(r.state);
        ids.set(k, next);
        parents.push([]);
      }
      parents[next].push(i);
      remaining[i]++;
    }
  }
  const queue = wins.flatMap((win, i) => (win ? [i] : []));
  for (let head = 0; head < queue.length; head++) {
    for (const parent of parents[queue[head]]) {
      if (wins[parent]) continue;
      remaining[parent]--;
      if (states[parent].toPlay === su.attacker || remaining[parent] === 0) {
        wins[parent] = true;
        queue.push(parent);
      }
    }
  }
  return (s: GoState) => {
    const id = ids.get(key(s));
    assert.notEqual(id, undefined, '必须验证状态图内的局面');
    return wins[id!];
  };
}

void test('死活题：所有正解与错着通过无深度限制的全状态逆推', () => {
  for (const p of GO_PROBLEMS) {
    const su = setup(p);
    const exact = exactCaptures(su);
    const keys = correctMoves(su);
    const expected: number[] = [];
    for (const move of [...su.region, ...(su.passOk ? [-1] : [])]) {
      const r = play(su.state, move);
      if (!r.ok) continue;
      const wins = p.koGoal
        ? r.state.ko >= 0 && r.state.board[su.target] === BLACK
        : su.attacker === BLACK
          ? exact(r.state)
          : !exact(r.state);
      if (wins) expected.push(move);
    }
    assert.deepEqual(keys, expected, `${p.id} 有界求解与完整状态图不一致`);
    for (const wrong of p.wrong ?? []) {
      const move = wrong.at[0] < 0 ? -1 : wrong.at[1] * 9 + wrong.at[0];
      const first = play(su.state, move);
      assert.ok(first.ok, `${p.id} 错着必须合法`);
      assert.ok(wrong.line.length > 0, `${p.id} 缺反击`);
      let state = first.state;
      for (const [x, y] of wrong.line) {
        const reply = play(state, x < 0 ? -1 : y * 9 + x);
        assert.ok(reply.ok);
        state = reply.state;
        if (state.toPlay === BLACK) {
          assert.equal(
            su.attacker === BLACK ? exact(state) : !exact(state),
            false,
            `${p.id} 反击线中白棋丢掉了优势`,
          );
        }
      }
    }
  }
  const straight = setup(
    GO_PROBLEMS.find((p) => p.id === 'straight-four-fill')!,
  );
  assert.ok(correctMoves(straight).includes(-1), '直四保持原形的虚手也是正解');
  const ko = setup(GO_PROBLEMS.find((p) => p.id === 'ko-live')!);
  const taken = play(ko.state, 4);
  assert.ok(taken.ok);
  assert.equal(taken.state.ko, 3);
  assert.equal(play(taken.state, 3).ok, false);
  assert.equal(exactCaptures(ko)(taken.state), true, '制造劫争不能冒充净活');
});

void test('AI：开局不下一二线，各档都返回合法着法', () => {
  const g = newGame(9);
  let t = 0;
  const clock = () => (t += 1);
  const r = chooseGoMove(g, 7.5, 6, rng(7), clock, { reuse: false });
  const x = r.move % 9;
  const y = Math.floor(r.move / 9);
  assert.ok(Math.min(x, y, 8 - x, 8 - y) >= 2, `开局下在 ${x},${y}`);
  assert.ok(r.playouts >= 1000);
  for (const level of [1, 2, 5, 10] as const) {
    const m = chooseGoMove(g, 7.5, level, rng(3), clock);
    assert.ok(m.move === -1 || play(g, m.move).ok);
  }
});

void test('AI v2：十档难度，会提叫吃的子，搜索树可复用', () => {
  assert.equal(Object.keys(GO_LEVELS).length, 10);
  let t = 0;
  const clock = () => (t += 1);
  // White stone at E5 in atari: Black should capture it.
  const s = fromRows(
    [
      '.........',
      '.........',
      '.........',
      '....X....',
      '...XOX...',
      '.........',
      '.........',
      '.........',
      '.........',
    ],
    BLACK,
  );
  const r = chooseGoMove(s, 7.5, 6, rng(5), clock, { reuse: false });
  assert.equal(r.move, at(s, 4, 5));
  // Reuse: after our move and a reply, the next search starts from the kept subtree.
  const a = play(s, r.move) as { state: typeof s };
  const reply = chooseGoMove(a.state, 7.5, 6, rng(6), clock);
  const b = play(a.state, reply.move) as { state: typeof s };
  const again = chooseGoMove(b.state, 7.5, 6, rng(7), clock);
  assert.ok(again.move === -1 || play(b.state, again.move).ok);
  resetGoTree();
});

void test('新死活题：解析齐全，正解在加深 4 层后不变，每个错着的反击都经穷举验证', () => {
  let refutations = 0;
  for (const p of GO_PROBLEMS) {
    assert.ok(p.explain.length > 20, `${p.id} 缺解析`);
    const su = setup(p);
    const keys = correctMoves(su);
    assert.deepEqual(
      correctMoves({ ...su, depth: su.depth + 4 }),
      keys,
      `${p.id} 正解依赖搜索深度`,
    );
    const wrongAt = new Set((p.wrong ?? []).map((w) => w.at[1] * 9 + w.at[0]));
    for (const q of su.region) {
      if (
        keys.includes(q) ||
        su.state.board[q] !== EMPTY ||
        !play(su.state, q).ok
      )
        continue;
      assert.ok(wrongAt.has(q), `${p.id} 错着 ${q} 没有说明`);
    }
    for (const w of p.wrong ?? []) {
      const q = w.at[1] * 9 + w.at[0];
      assert.ok(!keys.includes(q), `${p.id} ${q} 其实是正解`);
      assert.ok(w.why.length > 8, `${p.id} ${q} 缺说明`);
      let s = (play(su.state, q) as { state: typeof su.state }).state;
      // The shown line is legal, and after White's reply Black can no longer succeed.
      w.line.forEach(([x, y], i) => {
        const r = play(s, x < 0 ? -1 : y * 9 + x);
        assert.ok(r.ok, `${p.id} 反击线不合法`);
        s = r.state;
        if (i === 0)
          assert.equal(
            playerWinning(su, s, su.depth - 2),
            false,
            `${p.id} ${q} 反击无效`,
          );
      });
      refutations++;
    }
  }
  assert.ok(GO_PROBLEMS.length >= 22, `题数 ${GO_PROBLEMS.length}`);
  assert.ok(refutations >= 50, `反击数 ${refutations}`);
  const seki = GO_PROBLEMS.find((p) => p.id === 'seki-pass')!;
  assert.deepEqual(correctMoves(setup(seki)), [-1]);
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
