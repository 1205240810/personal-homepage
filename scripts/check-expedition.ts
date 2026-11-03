// 丝路远行：牌数守恒、出牌递增与投契限制、计分、摸牌限制、隐藏信息、AI 合法性、联机模块。
import assert from 'node:assert/strict';
import {
  apply,
  canPlay,
  legalMoves,
  newGame,
  nextRound,
  routeScore,
  viewFor,
  type ExpeditionState,
} from '../lib/games/expedition.ts';
import {
  chooseExpeditionMove,
  determinize,
} from '../lib/games/expedition-ai.ts';
import { expeditionOnline as m } from '../lib/multiplayer/expedition-online.ts';

let seed = 7;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const count = (s: ExpeditionState) =>
  s.deck.length +
  s.hands[0].length +
  s.hands[1].length +
  s.routes.flat(2).length +
  s.discard.flat().length;

// Scoring.
assert.equal(routeScore([]), 0);
assert.equal(routeScore([3]), -18); // 2 - 20
assert.equal(routeScore([0, 3, 11]), (2 + 10 - 20) * 2);
assert.equal(
  routeScore([0, 1, 3, 4, 5, 6, 7, 8]),
  (2 + 3 + 4 + 5 + 6 + 7 - 20) * 3 + 20,
);
// Ascending only; wagers before numbers.
assert.ok(canPlay([], 0) && canPlay([0], 1) && canPlay([0], 5));
assert.ok(!canPlay([5], 0) && !canPlay([5], 4) && canPlay([5], 6));

// Full random game keeps 60 cards and ends.
let s = newGame(rng, 0, 3);
assert.equal(count(s), 60);
assert.equal(s.hands[0].length, 8);
assert.throws(() => apply(s, 1, legalMoves(s)[0]));
assert.throws(() => apply(s, 0, { t: 'draw', from: 'deck' }));
for (let i = 0; i < 5000 && s.phase !== 'over'; i++) {
  if (s.phase === 'round-end') {
    s = nextRound(s, rng);
    continue;
  }
  const moves = legalMoves(s);
  const mv = moves[Math.floor(rng() * moves.length)];
  const next = apply(s, s.toPlay, mv);
  if (mv.t === 'discard') {
    // The card just discarded cannot be drawn back.
    assert.throws(() =>
      apply(next, s.toPlay, { t: 'draw', from: Math.floor(mv.card / 12) }),
    );
  }
  s = next;
  assert.equal(count(s), 60);
}
assert.equal(s.phase, 'over');
assert.equal(s.roundScores.length, 3);

// Hidden information.
s = newGame(rng);
const v = viewFor(s, 0);
assert.ok(!('deck' in v) && !('hands' in v));
assert.equal(v.hand.length, 8);
assert.deepEqual(v.handCounts, [8, 8]);
const d = determinize(v, 0, rng);
assert.deepEqual(d.hands[0], s.hands[0]);
assert.equal(count(d), 60);

// AI plays legal moves through a quick single round at several levels.
for (const lv of [1, 2, 3] as const) {
  let g = newGame(rng, 0, 1);
  for (let i = 0; i < 500 && g.phase !== 'over'; i++) {
    const r = chooseExpeditionMove(
      viewFor(g, g.toPlay),
      g.toPlay,
      g.toPlay === 0 ? lv : 2,
      rng,
    );
    g = apply(g, g.toPlay, r.move);
  }
  assert.equal(g.phase, 'over');
}

// Online module.
assert.throws(() => m.options({ rounds: 2 }));
let o = m.presence!(
  m.create(m.options({ rounds: 1 }), rng, 0),
  [true, true],
  0,
);
const act = (seat: number, a: Record<string, unknown>) =>
  m.act(o, seat, { positionRevision: o.positionRevision, ...a }, rng, 0) as {
    state?: typeof o;
    error?: string;
  };
const g0 = o.game!;
const first = g0.toPlay;
assert.ok(act(1 - first, { type: 'move', move: legalMoves(g0)[0] }).error);
assert.ok(act(first, { type: 'move', move: { t: 'play', card: 999 } }).error);
assert.ok(
  m.act(
    o,
    first,
    { type: 'move', positionRevision: -1, move: legalMoves(g0)[0] },
    rng,
    0,
  ).error,
);
const view = m.view(o, 1 - first, 0) as Record<string, unknown>;
assert.ok(!('hands' in view) && !('deck' in view));
assert.ok(act(first, { type: 'next' }).error);
while (o.game!.phase !== 'over') {
  const g = o.game!;
  const r = act(g.toPlay, { type: 'move', move: legalMoves(g)[0] });
  assert.ok(!r.error, r.error);
  o = r.state!;
}
o = act(0, { type: 'rematch' }).state!;
o = act(1, { type: 'rematch' }).state!;
assert.equal(o.game!.phase, 'play');
assert.equal(o.opener, 1);
console.log('expedition: ok');
