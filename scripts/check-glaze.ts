// 琉璃坊：砖数守恒、取砖与料架规则、碎瓷、贴砖计分、终局奖励、AI 合法性、联机模块。
import assert from 'node:assert/strict';
import {
  apply,
  legalMoves,
  newGame,
  placeScore,
  viewFor,
  wallCol,
  type Board,
  type GlazeState,
} from '../lib/games/glaze.ts';
import { chooseGlazeMove } from '../lib/games/glaze-ai.ts';
import { glazeOnline as m } from '../lib/multiplayer/glaze-online.ts';

let seed = 5;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const onBoard = (b: Board) =>
  b.lines.reduce((a, l) => a + l.n, 0) +
  b.wall.flat().filter(Boolean).length +
  b.floor.filter((t) => t !== 'first').length;
const total = (s: GlazeState) =>
  s.bag.length +
  s.lid.length +
  s.factories.flat().length +
  s.center.length +
  onBoard(s.boards[0]) +
  onBoard(s.boards[1]);

// Placement scoring.
const wall = Array.from({ length: 5 }, () => Array(5).fill(false));
wall[0][0] = true;
assert.equal(placeScore(wall, 0, 0), 1);
wall[0][1] = true;
assert.equal(placeScore(wall, 0, 1), 2);
wall[1][1] = true;
assert.equal(placeScore(wall, 1, 1), 2);
wall[1][0] = true;
assert.equal(placeScore(wall, 1, 0), 4);

let s = newGame(rng, 0);
assert.equal(total(s), 100);
assert.equal(s.factories.length, 5);
assert.ok(s.factories.every((f) => f.length === 4));

// Taking from a factory pushes the rest to the centre; overflow goes to the floor.
const f0 = s.factories[0];
const c = f0[0];
const n = f0.filter((x) => x === c).length;
const t = apply(s, 0, { src: 0, color: c, line: 0 }, rng);
assert.equal(t.boards[0].lines[0].n, 1);
assert.equal(t.boards[0].floor.length, n - 1);
assert.equal(t.center.length, 4 - n);
assert.throws(
  () => apply(t, 0, { src: 1, color: t.factories[1][0], line: 1 }),
  /轮到/,
);
// First player marker.
if (t.center.length) {
  const u = apply(t, 1, { src: -1, color: t.center[0], line: -1 }, rng);
  assert.ok(u.boards[1].floor.includes('first'));
  assert.equal(u.firstInCenter, false);
}
// Line colour constraint.
const other = t.factories.flat().find((x) => x !== c);
if (other !== undefined) {
  const src = t.factories.findIndex((f) => f.includes(other));
  const v = { ...t, toPlay: 0 as const };
  assert.throws(
    () => apply(v, 0, { src, color: other, line: 0 }, rng),
    /放不下/,
  );
}
// Wall already has the colour.
const w: GlazeState = structuredClone(s);
w.boards[0].wall[2][wallCol(2, c)] = true;
assert.throws(() => apply(w, 0, { src: 0, color: c, line: 2 }, rng));

// Random full games conserve tiles and end with a full row.
for (let k = 0; k < 6; k++) {
  s = newGame(rng, (k % 2) as 0 | 1);
  for (let i = 0; i < 2000 && s.phase !== 'over'; i++) {
    const moves = legalMoves(s);
    s = apply(s, s.toPlay, moves[Math.floor(rng() * moves.length)], rng);
    assert.equal(total(s), 100);
  }
  assert.equal(s.phase, 'over');
  assert.ok(s.boards.some((b) => b.wall.some((r) => r.every(Boolean))));
  assert.ok(s.boards.every((b) => b.score >= 0));
}

// View hides bag order; AI plays legal games.
s = newGame(rng, 0);
const view = viewFor(s, 1);
assert.ok(!('bag' in view) && !('lid' in view));
for (let i = 0; i < 2000 && s.phase !== 'over'; i++) {
  const r = chooseGlazeMove(
    viewFor(s, s.toPlay),
    s.toPlay,
    s.toPlay === 0 ? 3 : 1,
    rng,
  );
  s = apply(s, s.toPlay, r.move, rng);
}
assert.equal(s.phase, 'over');

// A deadline during the first root branch must retain a finite fallback score.
const realNow = Date.now;
let clockCalls = 0;
try {
  Date.now = () => (clockCalls++ === 0 ? 0 : 1_000_000);
  const start = newGame(rng, 0);
  const timed = chooseGlazeMove(viewFor(start, 0), 0, 5, rng);
  assert.ok(clockCalls > 1, 'the search reached its deadline check');
  assert.ok(
    Number.isFinite(timed.score),
    'deadline fallback score must be finite',
  );
  assert.doesNotThrow(() => apply(start, 0, timed.move, rng));
} finally {
  Date.now = realNow;
}

// Online.
let o = m.presence!(m.create(m.options({}), rng, 0), [true, true], 0);
const act = (seat: number, a: Record<string, unknown>) =>
  m.act(o, seat, { positionRevision: o.positionRevision, ...a }, rng, 0) as {
    state?: typeof o;
    error?: string;
  };
assert.ok(act(1, { type: 'move', move: legalMoves(o.game!)[0] }).error);
assert.ok(act(0, { type: 'move', move: { src: 9, color: 0, line: 0 } }).error);
assert.ok(act(0, { type: 'rematch' }).error);
assert.ok(!('bag' in (m.view(o, 0, 0) as object)));
while (o.game!.phase !== 'over') {
  const g = o.game!;
  const r = act(g.toPlay, { type: 'move', move: legalMoves(g)[0] });
  assert.ok(!r.error, r.error);
  o = r.state!;
}
o = act(0, { type: 'rematch' }).state!;
o = act(1, { type: 'rematch' }).state!;
assert.equal(o.game!.phase, 'play');
assert.equal(o.game!.toPlay, 1);
console.log('glaze: ok');
