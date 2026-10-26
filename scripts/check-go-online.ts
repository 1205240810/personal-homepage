// 围棋联机: module rules plus a two-client game over the real relay.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PlayClient } from '../lib/multiplayer/client.ts';
import { goOnline, type GoOnlineView } from '../lib/multiplayer/go-online.ts';
import { startPlayServer } from '../server/play/main.ts';
import { BLACK, WHITE } from '../lib/games/go.ts';

const rnd = () => 0.1;
const start = (o = {}) =>
  goOnline.presence!(
    goOnline.create(goOnline.options(o), rnd, 0),
    [true, true],
    0,
  );
const act = (s: ReturnType<typeof start>, seat: number, a: unknown) => {
  const r = goOnline.act(s, seat, a, rnd, 0);
  if (r.error !== undefined) throw new Error(r.error);
  return r.state;
};

void describe('go-online rules', () => {
  void it('validates options', () => {
    assert.throws(() => goOnline.options({ size: 10 }));
    assert.throws(() => goOnline.options({ size: 9, handicap: 7 }));
    assert.throws(() => goOnline.options({ handicap: 1 }));
    assert.deepEqual(
      goOnline.options({ size: 19, creator: 'white', handicap: 3 }),
      {
        size: 19,
        creator: 'white',
        handicap: 3,
      },
    );
  });
  void it('waits for both players and enforces turn order', () => {
    const s0 = goOnline.create(goOnline.options({ creator: 'black' }), rnd, 0);
    assert.ok(goOnline.act(s0, 0, { type: 'move', p: 40 }, rnd, 0).error);
    const s = start({ creator: 'black' });
    assert.deepEqual(s.colors, [BLACK, WHITE]);
    assert.ok(goOnline.act(s, 1, { type: 'move', p: 40 }, rnd, 0).error);
    const s1 = act(s, 0, { type: 'move', p: 40 });
    assert.ok(goOnline.act(s1, 1, { type: 'move', p: 40 }, rnd, 0).error);
  });
  void it('undo needs consent and takes back to before the asker’s move', () => {
    let s = start({ creator: 'black' });
    s = act(s, 0, { type: 'move', p: 40 });
    s = act(s, 1, { type: 'move', p: 41 });
    s = act(s, 0, { type: 'undo-request' });
    assert.equal(s.undoFrom, 0);
    const refused = act(s, 1, { type: 'undo-answer', accept: false });
    assert.equal(refused.game.moves.length, 2);
    s = act(s, 1, { type: 'undo-answer', accept: true });
    assert.deepEqual(s.game.moves, []);
    assert.equal(s.game.toPlay, BLACK);
  });
  void it('two passes → scoring; both confirm → result; rematch swaps colours', () => {
    let s = start({ creator: 'black' });
    s = act(s, 0, { type: 'move', p: 40 });
    s = act(s, 1, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    assert.equal(s.phase, 'scoring');
    s = act(s, 1, { type: 'toggle-dead', p: 40 });
    assert.deepEqual(s.dead, [40]);
    s = act(s, 1, { type: 'toggle-dead', p: 40 });
    s = act(s, 0, { type: 'confirm' });
    assert.equal(s.phase, 'scoring');
    s = act(s, 1, { type: 'confirm' });
    assert.equal(s.phase, 'over');
    assert.equal(s.result?.winner, BLACK); // 81 vs 7.5
    s = act(s, 0, { type: 'rematch' });
    s = act(s, 1, { type: 'rematch' });
    assert.deepEqual(s.colors, [WHITE, BLACK]);
    assert.equal(s.phase, 'play');
  });
  void it('resign ends the game for the opponent', () => {
    const s = act(start({ creator: 'white' }), 0, { type: 'resign' });
    assert.equal(s.result?.winner, BLACK);
    assert.equal(s.result?.reason, 'resign');
  });
});

void describe('go-online over the relay', () => {
  let server: Awaited<ReturnType<typeof startPlayServer>>;
  let url = '';
  before(async () => {
    server = await startPlayServer({ port: 0 });
    url = `ws://127.0.0.1:${server.port}/play/ws`;
  });
  after(() => server.close());
  const until = async (f: () => unknown, ms = 4000) => {
    const end = Date.now() + ms;
    while (!f()) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  void it('two clients play, reconnect and resign', async () => {
    const a = new PlayClient<GoOnlineView>({ url, name: '甲' });
    a.create('go', { size: 9, creator: 'black' });
    await until(() => a.snapshot.code);
    const b = new PlayClient<GoOnlineView>({ url, name: '乙' });
    b.join(a.snapshot.code!);
    await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
    assert.equal(b.snapshot.view?.you, WHITE);
    a.act({ type: 'move', p: 40 });
    await until(() => b.snapshot.view?.board[40] === BLACK);
    b.act({ type: 'move', p: 20 });
    await until(() => a.snapshot.view?.board[20] === WHITE);
    // White can't move twice.
    b.act({ type: 'move', p: 21 });
    await until(() => b.snapshot.error);
    (a as unknown as { ws: WebSocket }).ws.close();
    await until(() => a.snapshot.status === 'reconnecting');
    await until(
      () => a.snapshot.status === 'open' && b.snapshot.seats[0]?.online,
      6000,
    );
    assert.equal(a.snapshot.view?.you, BLACK);
    a.act({ type: 'resign' });
    await until(() => b.snapshot.view?.result?.winner === WHITE);
    a.close();
    b.close();
  });
});
