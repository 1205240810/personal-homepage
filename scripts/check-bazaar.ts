// 刺桐市集：发牌与牌数守恒、四种行动的合法性、银牌与赏银、结束条件、隐藏信息、AI、联机模块。
import assert from 'node:assert/strict';
import {
  CAMEL,
  apply,
  legalMoves,
  newGame,
  nextRound,
  viewFor,
  type BazaarState,
} from '../lib/games/bazaar.ts';
import { chooseBazaarMove, determinize } from '../lib/games/bazaar-ai.ts';
import { bazaarOnline as m } from '../lib/multiplayer/bazaar-online.ts';

let seed = 11;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sold = (s: BazaarState) => s.sold.reduce((a, b) => a + b, 0);
const count = (s: BazaarState) =>
  s.deck.length +
  s.market.length +
  s.hands[0].length +
  s.hands[1].length +
  s.camels[0] +
  s.camels[1] +
  sold(s);

let s = newGame(rng, 0);
assert.equal(count(s), 55);
assert.equal(s.market.filter((c) => c === CAMEL).length >= 3, true);
assert.equal(s.hands[0].length + s.camels[0], 5);

// Illegal actions.
const mk = (patch: Partial<BazaarState>): BazaarState => ({
  ...newGame(rng, 0),
  ...patch,
});
let t = mk({
  market: [CAMEL, CAMEL, 0, 1, 3],
  hands: [[0, 4, 4, 5], []],
  camels: [2, 0],
});
assert.throws(() => apply(t, 0, { t: 'take', i: 0 }), /骆驼/);
assert.throws(() => apply(t, 0, { t: 'sell', good: 0, n: 1 }), /至少/);
assert.throws(
  () => apply(t, 0, { t: 'swap', take: [2, 3], give: [0, 4] }),
  /同一种/,
);
assert.throws(() => apply(t, 0, { t: 'swap', take: [2], give: [4] }), /至少/);
assert.throws(() =>
  apply(t, 0, { t: 'swap', take: [2, 3], give: [CAMEL, CAMEL, CAMEL] }),
);
let u = apply(t, 0, { t: 'swap', take: [2, 3], give: [CAMEL, 5] });
assert.deepEqual([...u.hands[0]].sort((a, b) => a - b), [0, 0, 1, 4, 4]);
assert.equal(u.camels[0], 1);
u = apply(t, 0, { t: 'camels' });
assert.equal(u.camels[0], 4);
assert.equal(u.market.length, 5);
t = mk({ hands: [[0, 1, 1, 1, 1, 1, 2], []] });
assert.throws(() => apply(t, 0, { t: 'take', i: 3 }), /7/);
u = apply(t, 0, { t: 'sell', good: 1, n: 5 });
assert.deepEqual(u.won[0], [6, 6, 5, 5, 5]);
assert.equal(u.bonusWon[0].length, 1);
assert.ok([8, 9, 10].includes(u.bonusWon[0][0]));
assert.deepEqual(u.hands[0], [0, 2]);

// Random full matches end and conserve cards.
for (let k = 0; k < 4; k++) {
  s = newGame(rng, 0);
  for (let i = 0; i < 3000 && s.phase !== 'over'; i++) {
    if (s.phase === 'round-end') {
      s = nextRound(s, rng);
      continue;
    }
    const moves = legalMoves(s, true);
    s = apply(s, s.toPlay, moves[Math.floor(rng() * moves.length)]);
    assert.equal(count(s), 55);
  }
  assert.equal(s.phase, 'over');
  assert.ok(s.seals[s.winner!] === 2);
}

// Hidden info and determinization.
s = newGame(rng, 0);
const v = viewFor(s, 1);
assert.ok(!('deck' in v) && !('hands' in v) && !('bonus' in v));
assert.equal(typeof v.bonusWon[0], 'number');
const d = determinize(v, 1, rng);
assert.deepEqual(d.hands[1], s.hands[1]);
assert.equal(d.hands[0].length, s.hands[0].length);
assert.equal(d.deck.length, s.deck.length);

// AI legal through a match.
s = newGame(rng, 0);
for (let i = 0; i < 3000 && s.phase !== 'over'; i++) {
  if (s.phase === 'round-end') {
    s = nextRound(s, rng);
    continue;
  }
  const r = chooseBazaarMove(
    viewFor(s, s.toPlay),
    s.toPlay,
    s.toPlay === 0 ? 3 : 1,
    rng,
  );
  s = apply(s, s.toPlay, r.move);
}
assert.equal(s.phase, 'over');

// Online.
let o = m.presence!(m.create(m.options({}), rng, 0), [true, true], 0);
const act = (seat: number, a: Record<string, unknown>) =>
  m.act(o, seat, { positionRevision: o.positionRevision, ...a }, rng, 0) as {
    state?: typeof o;
    error?: string;
  };
assert.ok(act(1, { type: 'move', move: { t: 'camels' } }).error);
assert.ok(act(0, { type: 'move', move: { t: 'take', i: 99 } }).error);
assert.ok(act(0, { type: 'move', move: { t: 'nope' } }).error);
const view = m.view(o, 1, 0) as Record<string, unknown>;
assert.ok(!('hands' in view) && !('deck' in view));
while (o.game!.phase !== 'over') {
  if (o.game!.phase === 'round-end') {
    o = act(0, { type: 'next' }).state!;
    o = act(1, { type: 'next' }).state!;
    continue;
  }
  const g = o.game!;
  const r = act(g.toPlay, { type: 'move', move: legalMoves(g)[0] });
  assert.ok(!r.error, r.error);
  o = r.state!;
}
o = act(0, { type: 'rematch' }).state!;
o = act(1, { type: 'rematch' }).state!;
assert.equal(o.game!.phase, 'play');
console.log('bazaar: ok');
