// End-to-end checks for the play relay: two real WebSocket clients against the
// Node server, plus hub-level checks with fake connections.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PlayClient } from '../lib/multiplayer/client.ts';
import { RoomHub, type Conn } from '../lib/multiplayer/hub.ts';
import { echoModule } from '../lib/multiplayer/echo.ts';
import type { ServerMsg } from '../lib/multiplayer/protocol.ts';
import { startPlayServer } from '../server/play/main.ts';

export async function until<T>(
  fn: () => T | undefined | null | false,
  ms = 3000,
) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const fake = (ip = '1.1.1.1') => {
  const got: ServerMsg[] = [];
  const conn: Conn = { ip, send: (m) => got.push(m) };
  return { conn, got, last: () => got[got.length - 1] };
};

void describe('RoomHub', () => {
  void it('creates, seats two players and rejects a third', () => {
    const hub = new RoomHub([echoModule]);
    const a = fake();
    hub.message(a.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    const joined = a.got.find((m) => m.t === 'joined');
    assert.ok(joined && joined.t === 'joined');
    const b = fake();
    hub.message(b.conn, JSON.stringify({ t: 'join', code: joined.code }));
    assert.ok(b.got.some((m) => m.t === 'joined' && m.seat === 1));
    const c = fake();
    hub.message(c.conn, JSON.stringify({ t: 'join', code: joined.code }));
    assert.deepEqual(c.last(), {
      t: 'error',
      code: 'room-full',
      message: '房间已满',
    });
  });
  void it('rejects bad messages, unknown rooms and illegal actions', () => {
    const hub = new RoomHub([echoModule]);
    const a = fake();
    hub.message(a.conn, '{nope');
    assert.equal((a.last() as { code: string }).code, 'bad-message');
    hub.message(a.conn, JSON.stringify({ t: 'join', code: 'ZZZZZZ' }));
    assert.equal((a.last() as { code: string }).code, 'no-room');
    hub.message(a.conn, JSON.stringify({ t: 'act', action: {} }));
    assert.equal((a.last() as { code: string }).code, 'not-seated');
    hub.message(a.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    hub.message(a.conn, JSON.stringify({ t: 'act', action: { add: 5 } }));
    assert.equal((a.last() as { code: string }).code, 'illegal');
  });
  void it('rate-limits floods and caps rooms per IP', () => {
    let t = 0;
    const hub = new RoomHub([echoModule], {
      now: () => t,
      rate: 5,
      roomsPerIp: 2,
    });
    const a = fake();
    for (let i = 0; i < 6; i++)
      hub.message(a.conn, JSON.stringify({ t: 'ping' }));
    assert.equal((a.last() as { code: string }).code, 'rate-limited');
    t = 2000;
    for (let i = 0; i < 3; i++)
      hub.message(
        fake('9.9.9.9').conn,
        JSON.stringify({ t: 'create', game: 'echo' }),
      );
    const d = fake('9.9.9.9');
    hub.message(d.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    assert.equal((d.last() as { code: string }).code, 'too-many-rooms');
  });
  void it('sweeps idle rooms', () => {
    let t = 0;
    const hub = new RoomHub([echoModule], { now: () => t, idleMs: 1000 });
    const a = fake();
    hub.message(a.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    hub.disconnect(a.conn);
    t = 500;
    hub.sweep();
    assert.equal(hub.roomCount, 1);
    t = 2000;
    hub.sweep();
    assert.equal(hub.roomCount, 0);
  });

  void it('keeps seat credentials independent of the game random stream', () => {
    const hub = new RoomHub([echoModule], { random: () => 0 });
    const a = fake();
    const b = fake();
    hub.message(a.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    const joined = a.got.find((m) => m.t === 'joined');
    assert.ok(joined && joined.t === 'joined');
    hub.message(b.conn, JSON.stringify({ t: 'join', code: joined.code }));
    const second = b.got.find((m) => m.t === 'joined');
    assert.ok(second && second.t === 'joined');
    assert.notEqual(joined.token, second.token);
    hub.close();
  });

  void it('does not reset the message budget when a seated client rejoins', () => {
    const hub = new RoomHub([echoModule], { now: () => 0, rate: 3 });
    const a = fake();
    hub.message(a.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    const joined = a.got.find((m) => m.t === 'joined');
    assert.ok(joined && joined.t === 'joined');
    const message = JSON.stringify({ t: 'join', code: joined.code, token: joined.token });
    for (let i = 0; i < 3; i++) hub.message(a.conn, message);
    assert.equal((a.last() as { code: string }).code, 'rate-limited');
    hub.close();
  });

  void it('rejects a different game before leaving or claiming a seat', () => {
    const hub = new RoomHub([echoModule]);
    const a = fake();
    const b = fake();
    hub.message(a.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    const joined = a.got.find((m) => m.t === 'joined');
    assert.ok(joined && joined.t === 'joined');
    hub.message(b.conn, JSON.stringify({ t: 'join', code: joined.code, game: 'go' }));
    assert.equal((b.last() as { code: string }).code, 'wrong-game');
    hub.message(b.conn, JSON.stringify({ t: 'join', code: joined.code, game: 'echo' }));
    assert.ok(b.got.some((m) => m.t === 'joined' && m.seat === 1));
    const c = fake();
    hub.message(c.conn, JSON.stringify({ t: 'create', game: 'echo' }));
    hub.message(c.conn, JSON.stringify({ t: 'join', code: joined.code }));
    assert.equal((c.last() as { code: string }).code, 'room-full');
    hub.message(c.conn, JSON.stringify({ t: 'act', action: { add: 1 } }));
    assert.equal((c.last() as { t: string }).t, 'state');
    hub.close();
  });
});

void describe('play server (two real clients)', () => {
  let server: Awaited<ReturnType<typeof startPlayServer>>;
  let url = '';
  before(async () => {
    server = await startPlayServer({ port: 0 });
    url = `ws://127.0.0.1:${server.port}/play/ws`;
  });
  after(() => server.close());

  void it('plays a game, survives a reconnect and keeps the seat', async () => {
    type V = {
      total: number;
      turn: number;
      winner: number | null;
      you: number;
    };
    const a = new PlayClient<V>({ url, name: '甲' });
    a.create('echo', { target: 5 });
    const code = await until(() => a.snapshot.code);
    const b = new PlayClient<V>({ url, name: '乙' });
    b.join(code);
    await until(() => b.snapshot.seat === 1 && b.snapshot.view);
    await until(() => a.snapshot.seats[1]?.online);
    assert.equal(a.snapshot.seats[1].name, '乙');
    a.act({ add: 2 });
    await until(() => b.snapshot.view?.total === 2);
    // Drop B's socket; it must come back to seat 1 by itself.
    (b as unknown as { ws: WebSocket }).ws.close();
    await until(() => a.snapshot.seats[1] && !a.snapshot.seats[1].online);
    await until(
      () => b.snapshot.status === 'open' && a.snapshot.seats[1].online,
      5000,
    );
    assert.equal(b.snapshot.seat, 1);
    b.act({ add: 2 });
    a.act({ add: 1 });
    await until(() => b.snapshot.view?.winner === 0);
    a.close();
    b.close();
  });

  void it('answers health checks', async () => {
    const r = await fetch(`http://127.0.0.1:${server.port}/play/health`);
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { ok: boolean }).ok, true);
  });

  void it('can create another room after playing without keeping the old version or view', async () => {
    const a = new PlayClient<{ total: number }>({ url, game: 'echo' });
    try {
      a.create('echo');
      await until(() => a.snapshot.view);
      a.act({ add: 1 });
      await until(() => a.snapshot.view?.total === 1);
      const first = a.snapshot.code;
      a.create('echo');
      assert.equal(a.snapshot.view, null);
      await until(() => a.snapshot.code && a.snapshot.code !== first && a.snapshot.view);
      assert.equal(a.getSnapshot().view?.total, 0);
    } finally {
      a.close();
    }
  });
});
