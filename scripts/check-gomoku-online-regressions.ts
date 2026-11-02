// Regression coverage for stale browser actions, undo consent and real rooms.
import assert from 'node:assert/strict';
import { after, before, describe, it, type TestContext } from 'node:test';
import { BLACK, WHITE } from '../lib/games/gomoku.ts';
import { PlayClient } from '../lib/multiplayer/client.ts';
import { GAME_MODULES } from '../lib/multiplayer/games.ts';
import {
  gomokuOnline as m,
  type GomokuOnlineState,
  type GomokuOnlineView,
} from '../lib/multiplayer/gomoku-online.ts';
import { RoomHub } from '../lib/multiplayer/hub.ts';
import { startPlayServer } from '../server/play/main.ts';

const rng = () => 0.1;
const fresh = () => m.create(m.options({ creator: 'black' }), rng, 0);
const start = () => m.presence!(fresh(), [true, true], 0);
const command = (s: GomokuOnlineState, a: Record<string, unknown>) => ({
  positionRevision: s.positionRevision,
  undoRevision: s.undoRevision,
  ...a,
});
const act = (
  s: GomokuOnlineState,
  seat: number,
  a: Record<string, unknown>,
) => {
  const r = m.act(s, seat, command(s, a), rng, 0);
  if (r.error !== undefined) throw new Error(r.error);
  return r.state;
};
const rejected = (
  s: GomokuOnlineState,
  seat: number,
  a: Record<string, unknown>,
) => {
  const before = structuredClone(s);
  assert.ok(m.act(s, seat, command(s, a), rng, 0).error);
  assert.deepEqual(s, before, 'rejected commands must not mutate the position');
};

void describe('gomoku room regressions', () => {
  void it('validates settings, waits for both seats, and rejects malformed moves', () => {
    for (const options of [
      true,
      15,
      'black',
      [],
      { renju: 1 },
      { creator: 'red' },
    ])
      assert.throws(() => m.options(options));
    assert.deepEqual(m.options(undefined), { renju: false, creator: 'random' });
    const waiting = fresh();
    for (const type of ['move', 'undo-request', 'resign', 'rematch'])
      rejected(waiting, 0, { type, p: 0 });
    assert.equal(m.presence!(waiting, [true, false], 0).started, false);
    const s = start();
    rejected(s, 1, { type: 'move', p: 0 });
    for (const p of [undefined, null, '0', -1, 225, 0.5, NaN, Infinity])
      rejected(s, 0, { type: 'move', p });
    assert.ok(
      m.act(s, 0, { type: 'move', p: 0 }, rng, 0).error,
      'unversioned commands cannot be applied to an arbitrary current board',
    );
    const played = act(s, 0, { type: 'move', p: 112 });
    rejected(played, 1, { type: 'move', p: 112 });
    rejected(played, 1, { type: 'undo-request' });
    assert.equal(s.game.cells[112], 0);
  });

  void it('rejects a delayed move even when the sender has the turn again', () => {
    let s = start();
    const old = s.positionRevision;
    s = act(s, 0, { type: 'move', p: 112 });
    s = act(s, 1, { type: 'move', p: 0 });
    rejected(s, 0, { type: 'move', p: 113, positionRevision: old });
    rejected(s, 0, { type: 'resign', positionRevision: old });
    rejected(s, 0, { type: 'undo-request', positionRevision: old });
    s = act(s, 0, { type: 'undo-request' });
    s = act(s, 1, { type: 'undo-answer', accept: true });
    assert.equal(s.game.moves.length, 0);
    assert.ok(
      s.positionRevision > old,
      'undo must not reuse an old position revision',
    );
    rejected(s, 0, { type: 'move', p: 113, positionRevision: old });
    s = act(s, 0, { type: 'move', p: 113 });
    assert.deepEqual(s.game.moves, [113]);
  });

  void it('keeps one pending request and rejects answers to older requests', () => {
    let s = act(start(), 0, { type: 'move', p: 112 });
    s = act(s, 0, { type: 'undo-request' });
    const old = s.undoRevision;
    rejected(s, 0, { type: 'undo-request' });
    rejected(s, 1, { type: 'undo-request' });
    rejected(s, 0, { type: 'undo-answer', accept: true });
    rejected(s, 1, { type: 'undo-answer', accept: 'yes' });
    rejected(s, 1, {
      type: 'undo-answer',
      accept: true,
      undoRevision: undefined,
    });
    s = act(s, 1, { type: 'undo-answer', accept: false });
    s = act(s, 0, { type: 'undo-request' });
    assert.ok(s.undoRevision > old);
    for (const accept of [true, false])
      rejected(s, 1, { type: 'undo-answer', accept, undoRevision: old });
    s = act(s, 1, { type: 'undo-answer', accept: true });
    assert.deepEqual(s.game.moves, []);
    assert.deepEqual(s.score, [0, 0]);
    rejected(s, 1, { type: 'undo-answer', accept: true });
  });

  void it('withdraws consent on the next move and undoes the requester’s last turn', () => {
    let s = act(start(), 0, { type: 'move', p: 112 });
    s = act(s, 0, { type: 'undo-request' });
    const old = s.undoRevision;
    s = act(s, 1, { type: 'move', p: 0 });
    assert.equal(s.undoFrom, null);
    rejected(s, 1, { type: 'undo-answer', accept: true, undoRevision: old });
    s = act(s, 1, { type: 'undo-request' });
    s = act(s, 0, { type: 'undo-answer', accept: true });
    assert.deepEqual(s.game.moves, [112]);
    assert.equal(s.game.toPlay, WHITE);
    s = act(s, 1, { type: 'move', p: 1 });
    s = act(s, 0, { type: 'move', p: 113 });
    s = act(s, 1, { type: 'undo-request' });
    s = act(s, 0, { type: 'undo-answer', accept: true });
    assert.deepEqual(s.game.moves, [112]);
    assert.equal(s.game.toPlay, WHITE);
  });

  void it('settles once per round and carries scores, but never consent, into rematches', () => {
    let s = act(start(), 0, { type: 'move', p: 112 });
    s = act(s, 0, { type: 'undo-request' });
    const oldUndo = s.undoRevision;
    s = act(s, 0, { type: 'resign' });
    assert.equal(s.undoFrom, null);
    assert.deepEqual(s.score, [0, 1]);
    for (const type of ['move', 'resign', 'undo-request', 'undo-answer'])
      rejected(s, 0, { type, p: 113, accept: true });
    const ended = s.positionRevision;
    s = act(s, 0, { type: 'rematch' });
    s = act(s, 0, { type: 'rematch' });
    assert.notEqual(
      s.game.winner,
      null,
      'one seat cannot start a rematch alone',
    );
    s = act(s, 1, { type: 'rematch' });
    assert.deepEqual(s.colors, [WHITE, BLACK]);
    assert.deepEqual(s.score, [0, 1]);
    assert.deepEqual(s.rematch, [false, false]);
    assert.equal(s.game.toPlay, BLACK);
    s = act(s, 1, { type: 'move', p: 0 });
    s = act(s, 1, { type: 'undo-request' });
    rejected(s, 0, {
      type: 'undo-answer',
      accept: true,
      undoRevision: oldUndo,
    });
    s = act(s, 0, { type: 'resign' });
    assert.deepEqual(
      s.score,
      [0, 2],
      'scores belong to seats, even after colours swap',
    );
    rejected(s, 0, { type: 'rematch', positionRevision: ended });
    assert.deepEqual(s.rematch, [false, false]);
    const view = m.view(s, 1, 0) as GomokuOnlineView;
    assert.equal(view.you, BLACK);
    assert.equal(view.positionRevision, s.positionRevision);
    assert.equal(view.undoRevision, s.undoRevision);
    assert.equal((m.view(s, null, 0) as GomokuOnlineView).you, null);
    assert.ok(
      !('opts' in view) && !('game' in view),
      'views expose the public projection',
    );
  });
});

const until = async (f: () => unknown, ms = 5000) => {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error('timed out waiting for relay state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

void describe('gomoku room regressions over real WebSockets', () => {
  let server: Awaited<ReturnType<typeof startPlayServer>>;
  let url: string;
  before(async () => {
    server = await startPlayServer({
      port: 0,
      hub: new RoomHub(GAME_MODULES, { rate: 1000 }),
    });
    url = `ws://127.0.0.1:${server.port}/play/ws`;
  });
  after(() => server.close());
  const client = (t: TestContext, game = 'gomoku') => {
    const c = new PlayClient<GomokuOnlineView>({ url, game });
    t.after(() => c.close());
    return c;
  };
  const pair = async (t: TestContext) => {
    const a = client(t);
    a.create('gomoku', { creator: 'black' });
    await until(() => a.snapshot.code);
    const b = client(t);
    b.join(a.snapshot.code!);
    await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
    return [a, b] as const;
  };
  const send = (c: PlayClient<GomokuOnlineView>, a: Record<string, unknown>) =>
    c.act({
      positionRevision: c.snapshot.view!.positionRevision,
      undoRevision: c.snapshot.view!.undoRevision,
      ...a,
    });
  const changed = async (
    players: readonly PlayClient<GomokuOnlineView>[],
    sender: number,
    a: Record<string, unknown>,
  ) => {
    const revision = players[0].snapshot.version;
    send(players[sender], a);
    await until(() => players.every((c) => c.snapshot.version > revision));
  };

  void it('rejects a foreign game invite before taking its open seat and allows retry', async (t) => {
    const host = client(t, 'go');
    host.create('go', { size: 9 });
    await until(() => host.snapshot.code);
    const wrong = client(t);
    wrong.join(host.snapshot.code!);
    await until(() => wrong.snapshot.status === 'closed');
    assert.match(wrong.snapshot.error!, /另一款游戏/);
    assert.equal(wrong.snapshot.code, null);
    assert.equal(wrong.snapshot.view, null);
    assert.equal(host.snapshot.seats[1].taken, false);
    wrong.create('gomoku', { creator: 'white' });
    await until(() => wrong.snapshot.view);
    assert.equal(wrong.snapshot.view!.you, WHITE);
    const guest = client(t, 'go');
    guest.join(host.snapshot.code!);
    await until(() => guest.snapshot.seat === 1);
  });

  void it('enforces fresh board and consent revisions on the wire, then survives reconnect', async (t) => {
    const players = await pair(t);
    const [a, b] = players;
    const oldBoard = a.snapshot.view!.positionRevision;
    await changed(players, 0, {
      type: 'move',
      p: 112,
      score: [99, 0],
      seat: 1,
    });
    await changed(players, 1, { type: 'move', p: 0 });
    send(a, { type: 'move', p: 113, positionRevision: oldBoard });
    await until(() => a.snapshot.error?.includes('棋局已更新'));
    assert.deepEqual(a.snapshot.view!.moves, [112, 0]);
    assert.deepEqual(a.snapshot.view!.score, [0, 0]);
    await changed(players, 0, { type: 'undo-request' });
    const oldUndo = b.snapshot.view!.undoRevision;
    await changed(players, 1, { type: 'undo-answer', accept: false });
    await changed(players, 0, { type: 'undo-request' });
    send(b, { type: 'undo-answer', accept: true, undoRevision: oldUndo });
    await until(() => b.snapshot.error?.includes('悔棋请求已更新'));
    assert.equal(a.snapshot.view!.undoFrom, 0);
    assert.equal(a.snapshot.view!.moves.length, 2);

    (b as unknown as { ws: WebSocket }).ws.close();
    await until(() => b.snapshot.status === 'reconnecting');
    b.act({
      type: 'resign',
      positionRevision: b.snapshot.view!.positionRevision,
    });
    assert.match(b.snapshot.error!, /连接恢复/);
    await until(
      () => b.snapshot.status === 'open' && b.snapshot.seats[1]?.online,
    );
    await until(() => a.snapshot.version === b.snapshot.version);
    assert.equal(b.snapshot.seat, 1);
    assert.equal(b.snapshot.view!.you, WHITE);
    assert.equal(b.snapshot.view!.undoFrom, 0);
    assert.equal(
      b.snapshot.view!.winner,
      null,
      'offline actions are never replayed',
    );
    await changed(players, 1, { type: 'undo-answer', accept: true });
    assert.deepEqual(a.snapshot.view!.moves, []);
    assert.ok(a.snapshot.view!.positionRevision > oldBoard);
    const third = client(t);
    third.join(a.snapshot.code!);
    await until(() => third.snapshot.status === 'closed');
    assert.match(third.snapshot.error!, /已满/);
    assert.equal(JSON.stringify(a.snapshot.seats).includes('token'), false);

    await changed(players, 0, { type: 'resign' });
    const ended = a.snapshot.view!.positionRevision;
    assert.deepEqual(b.snapshot.view!.score, [0, 1]);
    await changed(players, 0, { type: 'rematch' });
    await changed(players, 1, { type: 'rematch' });
    assert.equal(a.snapshot.view!.you, WHITE);
    assert.equal(b.snapshot.view!.you, BLACK);
    assert.deepEqual(a.snapshot.view!.score, [0, 1]);
    await changed(players, 0, { type: 'resign' });
    send(b, { type: 'rematch', positionRevision: ended });
    await until(() => b.snapshot.error?.includes('棋局已更新'));
    assert.deepEqual(a.snapshot.view!.rematch, [false, false]);
    assert.deepEqual(a.snapshot.view!.score, [0, 2]);
  });
});
