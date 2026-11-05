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
import {
  quoridorOnline as m,
  type QuoridorOnlineView,
} from '../lib/multiplayer/quoridor-online.ts';
import { PlayClient } from '../lib/multiplayer/client.ts';
import { RoomHub } from '../lib/multiplayer/hub.ts';
import { startPlayServer } from '../server/play/main.ts';

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

// At the board edge a blocked straight jump becomes a diagonal jump, but a
// wall on one diagonal still blocks that side. Also exercise the rotated case.
const edge: QuoridorState = { ...newGame(), pawns: [at(4, 1), at(4, 0)] };
assert.ok(
  pawnMoves(edge).includes(at(3, 0)) && pawnMoves(edge).includes(at(5, 0)),
);
edge.v[3] = true;
assert.ok(
  !pawnMoves(edge).includes(at(3, 0)) && pawnMoves(edge).includes(at(5, 0)),
);
const horizontal: QuoridorState = { ...newGame(), pawns: [at(1, 4), at(0, 4)] };
assert.ok(
  pawnMoves(horizontal).includes(at(0, 3)) &&
    pawnMoves(horizontal).includes(at(0, 5)),
);

// Every search level takes an immediate goal and reports completed depth only.
for (const level of [2, 3, 4, 5, 6] as const) {
  const nearGoal = {
    ...newGame(),
    pawns: [at(4, 1), at(0, 0)] as [number, number],
  };
  const result = chooseQuoridorMove(nearGoal, level, () => 0.3);
  assert.equal(play(nearGoal, result.move).winner, 0);
}
// Exhaust the time budget at the first search node. The fallback is legal,
// finite, and must not claim a depth that was never searched completely.
const clock = Date.now;
let clockReads = 0;
try {
  Date.now = () => ++clockReads * 10_000;
  const position = newGame();
  const result = chooseQuoridorMove(position, 6, () => 0.3);
  assert.ok(isLegal(position, result.move) && Number.isFinite(result.score));
  assert.equal(result.depth, 0);
  assert.ok(clockReads <= 2, 'deadline must be checked on the first node');
} finally {
  Date.now = clock;
}

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
// Old commands cannot act when a player gets the turn again or after a rematch.
const oldRevision = o.positionRevision;
const beforeMove = o;
o = act(1, { type: 'move', move: { t: 'm', to: at(4, 7) } }).state!;
o = act(0, { type: 'move', move: { t: 'm', to: at(4, 1) } }).state!;
const unchanged = JSON.stringify(o);
assert.ok(
  m.act(
    o,
    1,
    {
      type: 'move',
      positionRevision: oldRevision,
      move: { t: 'm', to: at(4, 6) },
    },
    rng,
    0,
  ).error,
);
assert.equal(JSON.stringify(o), unchanged);
assert.equal(
  beforeMove.game.history.length,
  0,
  'moves must not mutate a previous view',
);
// Real relay acceptance: both projections agree, a dropped client resumes its
// own seat and board, and a previous game's revision cannot affect a rematch.
const server = await startPlayServer({ port: 0, hub: new RoomHub([m]) });
const tokens = new Map<string, string>();
const clients: PlayClient<QuoridorOnlineView>[] = [];
const client = () => {
  const c = new PlayClient<QuoridorOnlineView>({
    url: `ws://127.0.0.1:${server.port}/play/ws`,
    game: 'quoridor',
    tokens: {
      get: (code) => tokens.get(code) ?? null,
      set: (code, token) => {
        tokens.set(code, token);
      },
    },
  });
  clients.push(c);
  return c;
};
const until = async (predicate: () => unknown) => {
  const end = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < end, 'relay state timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
try {
  let host = client();
  host.create('quoridor', { creator: 'first' });
  await until(() => host.snapshot.code);
  const code = host.snapshot.code!;
  // Guest credentials must be distinct from the host's resume store.
  const guest = new PlayClient<QuoridorOnlineView>({
    url: `ws://127.0.0.1:${server.port}/play/ws`,
    game: 'quoridor',
    tokens: { get: () => null, set: () => {} },
  });
  clients.push(guest);
  guest.join(code);
  await until(
    () => host.snapshot.view?.started && guest.snapshot.view?.started,
  );
  assert.equal(host.snapshot.seat, 0);
  assert.equal(guest.snapshot.seat, 1);
  const command = async (
    actor: PlayClient<QuoridorOnlineView>,
    action: Record<string, unknown>,
  ) => {
    const revision = Math.max(host.snapshot.version, guest.snapshot.version);
    actor.act({
      ...action,
      positionRevision: actor.snapshot.view!.positionRevision,
    });
    await until(
      () =>
        host.snapshot.version > revision && guest.snapshot.version > revision,
    );
    assert.equal(host.snapshot.error, null);
    assert.equal(guest.snapshot.error, null);
    assert.deepEqual(host.snapshot.view!.game, guest.snapshot.view!.game);
  };
  await command(host, { type: 'move', move: { t: 'm', to: at(4, 7) } });
  await command(guest, { type: 'move', move: { t: 'w', o: 'h', x: 3, y: 6 } });
  const board = JSON.stringify(host.snapshot.view!.game);
  const revision = host.snapshot.view!.positionRevision;
  host.close();
  await until(() => !guest.snapshot.seats[0]?.online);
  host = client();
  host.join(code);
  await until(
    () => host.snapshot.view?.started && guest.snapshot.seats[0]?.online,
  );
  assert.equal(host.snapshot.seat, 0);
  assert.equal(JSON.stringify(host.snapshot.view!.game), board);
  assert.equal(host.snapshot.view!.positionRevision, revision);
  await command(host, { type: 'resign' });
  assert.deepEqual(host.snapshot.view!.score, [0, 1]);
  await command(host, { type: 'rematch' });
  await command(guest, { type: 'rematch' });
  assert.deepEqual(host.snapshot.view!.sides, [1, 0]);
  guest.act({
    type: 'move',
    positionRevision: revision,
    move: { t: 'm', to: at(4, 7) },
  });
  await until(() => guest.snapshot.error?.includes('棋局已更新'));
  assert.equal(host.snapshot.view!.game.history.length, 0);
  assert.equal(guest.snapshot.view!.game.history.length, 0);
} finally {
  for (const c of clients) c.close();
  await server.close();
}
console.log(
  'quoridor: rules, deadline, AI games and real relay/reconnect checks passed',
);
