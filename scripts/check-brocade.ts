// 锦绣织造：丝线守恒、取线 / 预订 / 购入规则、上限退还、贵客、终局、视图保密、AI 合法性、联机模块。
import assert from 'node:assert/strict';
import {
  CARDS,
  NOBLES,
  apply,
  hasAction,
  legalMoves,
  payment,
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
    if (st.passes < 2) {
      assert.equal(ply % 2, 0, 'round completes');
      assert.ok(points(st.players[0]) >= 15 || points(st.players[1]) >= 15);
    } else assert.equal(st.winner, 'draw');
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
// A reachable blocked position: both players hold all coloured tokens, have
// three expensive reservations and cannot afford any market card. Passing is
// forced only here; two forced passes must finish instead of stranding the AI.
let blockedSeed = 1;
const blockedRng = () =>
  (blockedSeed = (blockedSeed * 16807) % 2147483647) / 2147483647;
let blocked: BrocadeState | undefined;
for (let attempt = 0; attempt < 200; attempt++) {
  let g = newGame(blockedRng);
  const future = { ...g.players[0], tokens: [2, 2, 2, 2, 2, 0] };
  if (g.market.flat().some((id) => id !== null && payment(future, id)))
    continue;
  for (const gems of [
    [0, 1, 2],
    [0, 1, 2],
    [3, 4, 0],
    [3, 4, 0],
    [1, 3, 4],
    [1, 3, 4],
    [2],
    [2],
  ])
    g = apply(g, g.toPlay, { t: 'take', gems: gems as (0 | 1 | 2 | 3 | 4)[] });
  for (let i = 0; i < 6; i++)
    g = apply(g, g.toPlay, { t: 'reserve', card: null, tier: 2, ret: [5] });
  blocked = g;
  break;
}
assert.ok(blocked, 'a reachable blocked fixture exists');
assert.equal(cards(blocked), 90);
assert.deepEqual(tokens(blocked), [4, 4, 4, 4, 4, 5]);
assert.ok(!hasAction(blocked, 0) && !hasAction(blocked, 1));
assert.deepEqual(legalMoves(blocked), [{ t: 'pass' }]);
assert.throws(() => apply(s, 0, { t: 'pass' }), /还有可执行/);
for (const level of [1, 2, 3, 4, 5] as const) {
  const ai = chooseBrocadeMove(viewFor(blocked, 0), 0, level, blockedRng);
  assert.deepEqual(ai.move, { t: 'pass' });
  assert.ok(Number.isFinite(ai.score));
}
const onePass = apply(blocked, 0, { t: 'pass' });
assert.equal(onePass.phase, 'play');
assert.equal(onePass.passes, 1);
const draw = apply(onePass, 1, { t: 'pass' });
assert.equal(draw.phase, 'over');
assert.equal(draw.winner, 'draw');
assert.equal(viewFor(draw, 0).passes, 2);
// Empty markets still allow a blind reservation: a heuristic move list must
// never incorrectly grant a pass because it omitted this legal option.
const blindOnly = structuredClone(blocked);
const freed = blindOnly.players[0].reserved.pop()!;
blindOnly.blind[0] = blindOnly.blind[0].filter((id) => id !== freed);
blindOnly.decks[CARDS[freed].tier].push(freed);
blindOnly.market.forEach((row, tier) => {
  row.forEach((id) => id !== null && blindOnly.decks[tier].push(id));
  blindOnly.market[tier] = row.map(() => null);
});
assert.equal(cards(blindOnly), 90);
assert.equal(hasAction(blindOnly, 0), true);
assert.throws(() => apply(blindOnly, 0, { t: 'pass' }), /还有可执行/);
const blindMoves = legalMoves(blindOnly);
assert.ok(
  blindMoves.length === 3 &&
    blindMoves.every((move) => move.t === 'reserve' && move.card === null),
);
for (const move of blindMoves)
  assert.doesNotThrow(() => apply(blindOnly, 0, move));
const resumed = apply({ ...blindOnly, passes: 1 }, 0, blindMoves[0]);
assert.equal(resumed.passes, 0, 'a real action resets forced-pass consent');
// The same boundary is authoritative online and stale passes cannot finish a
// new match; neither a draw nor repeated terminal actions award a win.
let room: typeof o = { ...o, game: blocked, positionRevision: 10 };
for (const seat of [0, 1]) {
  const result = m.act(
    room,
    seat,
    {
      type: 'move',
      move: { t: 'pass' },
      positionRevision: room.positionRevision,
    },
    rng,
    0,
  );
  assert.ok('state' in result && result.state);
  room = result.state;
}
assert.equal(room.game!.winner, 'draw');
assert.deepEqual(room.score, [0, 0]);
assert.ok(
  m.act(
    room,
    1,
    {
      type: 'move',
      move: { t: 'pass' },
      positionRevision: room.positionRevision,
    },
    rng,
    0,
  ).error,
);
for (const seat of [0, 1]) {
  const result = m.act(
    room,
    seat,
    { type: 'rematch', positionRevision: room.positionRevision },
    rng,
    0,
  );
  assert.ok('state' in result && result.state);
  room = result.state;
}
assert.equal(room.game!.passes, 0);
assert.equal(room.game!.toPlay, 1);
assert.ok(
  m.act(
    room,
    1,
    { type: 'move', move: { t: 'pass' }, positionRevision: 10 },
    rng,
    0,
  ).error,
);
assert.ok(
  m.act(
    room,
    1,
    {
      type: 'move',
      move: { t: 'pass' },
      positionRevision: room.positionRevision,
    },
    rng,
    0,
  ).error,
);
console.log('brocade checks passed');
