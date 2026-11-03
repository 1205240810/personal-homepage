// 步步为营：走子 / 跳跃 / 斜跳、放墙重叠与堵路校验、AI 合法性、联机模块。
import assert from 'node:assert/strict';
import {
  N,
  distance,
  isLegal,
  legalWalls,
  newGame,
  pawnMoves,
  play,
  undo,
  wallLegal,
  type QuoridorState,
} from '../lib/games/quoridor.ts';
import { chooseQuoridorMove } from '../lib/games/quoridor-ai.ts';
import { quoridorOnline as m } from '../lib/multiplayer/quoridor-online.ts';

const at = (x: number, y: number) => y * N + x;
const sorted = (a: number[]) => [...a].sort((p, q) => p - q);

// Opening moves and walls.
let s = newGame();
assert.deepEqual(sorted(pawnMoves(s)), sorted([at(4, 7), at(3, 8), at(5, 8)]));
assert.equal(legalWalls(s).length, 128);
assert.equal(distance(s, s.pawns[0], 0), 8);

// A horizontal wall blocks the step north and cannot overlap or cross.
s = play(s, { t: 'w', o: 'h', x: 3, y: 7 });
assert.ok(!pawnMoves({ ...s, toPlay: 0 }).includes(at(4, 7)));
assert.ok(
  !wallLegal(s, 'h', 4, 7) &&
    !wallLegal(s, 'h', 2, 7) &&
    !wallLegal(s, 'v', 3, 7),
);
assert.ok(wallLegal(s, 'h', 5, 7) && wallLegal(s, 'v', 4, 7));
assert.equal(s.left[0], 9);

// Straight jump and diagonal jump.
const face: QuoridorState = { ...newGame(), pawns: [at(4, 5), at(4, 4)] };
assert.ok(pawnMoves(face).includes(at(4, 3)));
const blocked = { ...face, h: face.h.slice() };
blocked.h[3 * 8 + 4] = true; // wall north of (4,4)
const diag = sorted(pawnMoves(blocked));
assert.ok(
  diag.includes(at(3, 4)) &&
    diag.includes(at(5, 4)) &&
    !diag.includes(at(4, 3)),
);

// Sealing a player in is illegal.
let box: QuoridorState = newGame();
box = { ...box, h: box.h.slice(), v: box.v.slice() };
box.h[7 * 8 + 0] = true; // covers cols 0-1 above row 8
box.h[7 * 8 + 2] = true; // cols 2-3
box.h[7 * 8 + 4] = true; // cols 4-5
box.h[7 * 8 + 6] = true; // cols 6-7 → col 8 still open
assert.ok(distance(box, box.pawns[0], 0) > 0);
assert.ok(!wallLegal(box, 'v', 7, 7), 'sealing col 8 must be rejected');
assert.ok(!isLegal(s, { t: 'm', to: at(0, 0) }));

// Undo replays history.
const two = play(play(newGame(), { t: 'm', to: at(4, 7) }), {
  t: 'm',
  to: at(4, 1),
});
assert.deepEqual(undo(two, 1).pawns, [at(4, 7), at(4, 0)]);

// AI makes legal moves and finishes games.
for (const [a, b] of [
  [1, 3],
  [3, 2],
] as const) {
  let g = newGame();
  for (let i = 0; i < 300 && g.winner === null; i++) {
    const r = chooseQuoridorMove(g, g.toPlay === 0 ? a : b, () => 0.3);
    assert.ok(isLegal(g, r.move), `AI move illegal at ply ${i}`);
    g = play(g, r.move);
  }
  assert.notEqual(g.winner, null, 'AI game should finish');
}

// Online: seats, turn order, validation, rematch swaps sides.
const rng = () => 0.1;
assert.throws(() => m.options({ creator: 'x' }));
let o = m.presence!(
  m.create(m.options({ creator: 'first' }), rng, 0),
  [true, true],
  0,
);
const act = (seat: number, a: Record<string, unknown>) =>
  m.act(o, seat, { positionRevision: o.positionRevision, ...a }, rng, 0) as {
    state?: typeof o;
    error?: string;
  };
assert.ok(act(1, { type: 'move', move: { t: 'm', to: at(4, 1) } }).error);
assert.ok(act(0, { type: 'move', move: { t: 'm', to: at(0, 0) } }).error);
assert.ok(act(0, { type: 'move', move: { t: 'w', o: 'x', x: 0, y: 0 } }).error);
assert.ok(
  m.act(
    o,
    0,
    { type: 'move', positionRevision: 99, move: { t: 'm', to: at(4, 7) } },
    rng,
    0,
  ).error,
);
let r = act(0, { type: 'move', move: { t: 'm', to: at(4, 7) } });
assert.ok(!r.error);
o = r.state!;
r = act(1, { type: 'resign' });
o = r.state!;
assert.equal(o.game.winner, 0);
assert.deepEqual(o.score, [1, 0]);
o = act(0, { type: 'rematch' }).state!;
o = act(1, { type: 'rematch' }).state!;
assert.deepEqual(o.sides, [1, 0]);
assert.equal(o.game.history.length, 0);
console.log('quoridor: ok');
