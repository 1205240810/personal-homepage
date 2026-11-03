// 锦绣织造：丝线守恒、取线 / 预订 / 购入规则、上限退还、贵客、终局、视图保密、AI 合法性、联机模块。
import assert from 'node:assert/strict';
import {
  CARDS,
  NOBLES,
  apply,
  legalMoves,
  newGame,
  points,
  tokenCount,
  viewFor,
  type BrocadeState,
} from '../lib/games/brocade.ts';
import { chooseBrocadeMove, determinize } from '../lib/games/brocade-ai.ts';
import { brocadeOnline as m } from '../lib/multiplayer/brocade-online.ts';

let seed = 11;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const tokens = (s: BrocadeState) =>
  [0, 1, 2, 3, 4, 5].map(
    (g) => s.bank[g] + s.players[0].tokens[g] + s.players[1].tokens[g],
  );
const cards = (s: BrocadeState) =>
  s.decks.flat().length +
  s.market.flat().filter((x) => x !== null).length +
  s.players[0].cards.length +
  s.players[1].cards.length +
  s.players[0].reserved.length +
  s.players[1].reserved.length;

assert.equal(CARDS.length, 90);
assert.equal(NOBLES.length, 10);
const s = newGame(rng, 0);
assert.deepEqual(tokens(s), [4, 4, 4, 4, 4, 5]);
assert.equal(cards(s), 90);
assert.equal(s.nobles.length, 3);
assert.ok(s.market.every((t) => t.length === 4));

// Taking.
const t = apply(s, 0, { t: 'take', gems: [0, 1, 2] });
assert.deepEqual(t.players[0].tokens.slice(0, 3), [1, 1, 1]);
assert.throws(() => apply(t, 0, { t: 'take', gems: [0, 1, 2] }), /轮到/);
const t2 = apply(t, 1, { t: 'take', gems: [3, 3] });
assert.equal(t2.players[1].tokens[3], 2);
assert.throws(() => apply(t2, 0, { t: 'take', gems: [3, 3] }), /4/);
assert.throws(() => apply(t2, 0, { t: 'take', gems: [0, 0, 1] }));
// Reserving gives gold and refills the market; blind reservation is hidden.
const card = s.market[0][0]!;
const r = apply(s, 0, { t: 'reserve', card });
assert.equal(r.players[0].tokens[5], 1);
assert.ok(r.players[0].reserved.includes(card));
assert.equal(cards(r), 90);
const b = apply(r, 1, { t: 'reserve', card: null, tier: 2 });
const view = viewFor(b, 0);
assert.ok(view.players[1].reserved[0] < 0);
assert.equal(JSON.stringify(view).includes('decks'), false);
assert.equal(viewFor(b, 1).players[1].reserved[0] >= 0, true);

// Random self-play: conservation, limits, legal AI, finishing.
for (let g = 0; g < 6; g++) {
  let st = newGame(rng, (g % 2) as 0 | 1);
  let ply = 0;
  while (st.phase === 'play' && ply < 400) {
    const side = st.toPlay;
    const moves = legalMoves(st);
    assert.ok(moves.length > 0);
    const mv =
      g < 2
        ? chooseBrocadeMove(viewFor(st, side), side, 1, rng).move
        : moves[Math.floor(rng() * moves.length)];
    st = apply(st, side, mv);
    assert.deepEqual(tokens(st), [4, 4, 4, 4, 4, 5]);
    assert.equal(cards(st), 90);
    assert.ok(tokenCount(st.players[side]) <= 10);
    assert.ok(st.players[side].reserved.length <= 3);
    ply++;
  }
  if (st.phase === 'over') {
    assert.equal(ply % 2, 0, 'round completes');
    assert.ok(points(st.players[0]) >= 15 || points(st.players[1]) >= 15);
  }
}
// Determinization keeps own hand.
const d = determinize(viewFor(b, 0), 0, rng);
assert.equal(cards(d), 90);
assert.deepEqual(d.players[0].reserved, b.players[0].reserved);

// Online module.
const o = m.presence!(m.create(m.options({}), rng, 0), [true, true], 0);
assert.ok(o.started && o.game);
const pv = o.positionRevision;
const bad = m.act(
  o,
  1,
  { type: 'move', move: { t: 'take', gems: [0, 1, 2] }, positionRevision: pv },
  rng,
  0,
);
assert.ok('error' in bad);
const stale = m.act(
  o,
  0,
  {
    type: 'move',
    move: { t: 'take', gems: [0, 1, 2] },
    positionRevision: pv - 1,
  },
  rng,
  0,
);
assert.ok('error' in stale);
const ok = m.act(
  o,
  0,
  { type: 'move', move: { t: 'take', gems: [0, 1, 2] }, positionRevision: pv },
  rng,
  0,
);
assert.ok('state' in ok && ok.state);
const ov = m.view(ok.state!, 1, 0) as Record<string, unknown>;
assert.equal('decks' in ov, false);
assert.ok(
  'error' in
    m.act(
      ok.state!,
      1,
      { type: 'rematch', positionRevision: ok.state!.positionRevision },
      rng,
      0,
    ),
);
console.log('brocade checks passed');
