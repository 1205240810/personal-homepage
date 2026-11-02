import assert from 'node:assert/strict';
import { after, before, describe, it, type TestContext } from 'node:test';
import { decider, newGame, type Side } from '../lib/games/hanami.ts';
import { legalMoves } from '../lib/games/hanami-ai.ts';
import { PlayClient } from '../lib/multiplayer/client.ts';
import { GAME_MODULES } from '../lib/multiplayer/games.ts';
import {
  hanamiOnline as m,
  type HanamiOnlineState,
  type HanamiOnlineView,
} from '../lib/multiplayer/hanami-online.ts';
import { RoomHub } from '../lib/multiplayer/hub.ts';
import { startPlayServer } from '../server/play/main.ts';

const random =
  (seed = 3) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const start = (rng = random()): HanamiOnlineState => ({
  ...m.create({}, rng, 0),
  started: true,
  positionRevision: 1,
  game: newGame(rng),
});
const act = (
  s: HanamiOnlineState,
  seat: Side,
  a: Record<string, unknown>,
  rng = random(),
) => {
  const r = m.act(
    s,
    seat,
    { positionRevision: s.positionRevision, ...a },
    rng,
    0,
  );
  if (r.error !== undefined) throw new Error(r.error);
  return r.state;
};
const rejected = (
  s: HanamiOnlineState,
  seat: Side,
  a: Record<string, unknown>,
) => {
  const before = structuredClone(s);
  assert.ok(
    m.act(s, seat, { positionRevision: s.positionRevision, ...a }, random(), 0)
      .error,
  );
  assert.deepEqual(s, before);
};
const finishRound = (state: HanamiOnlineState) => {
  let s = state;
  while (s.game!.phase === 'play' || s.game!.phase === 'respond') {
    const g = s.game!;
    const who = decider(g)!;
    s = act(s, who, {
      type: 'move',
      move:
        g.phase === 'respond'
          ? { type: 'pick', index: 0 }
          : legalMoves(g.hands[who], g.used[who])[0],
    });
  }
  return s;
};
const finishMatch = (state: HanamiOnlineState, rng = random()) => {
  let s = finishRound(state);
  while (s.game!.phase === 'round-end') {
    s = act(s, 0, { type: 'next' }, rng);
    s = act(s, 1, { type: 'next' }, rng);
    s = finishRound(s);
  }
  return s;
};

void describe('hanami online regressions', () => {
  void it('waits for both players, retains a single deal on reconnect, and validates moves', () => {
    const waiting = m.create({}, random(), 0);
    assert.equal(m.presence!(waiting, [true, false], 0).game, null);
    rejected(waiting, 0, {
      type: 'move',
      move: { type: 'secret', cards: [0] },
    });
    const s = m.presence!(waiting, [true, true], 0);
    assert.equal(s.positionRevision, 1);
    const offline = m.presence!(s, [false, true], 0);
    assert.deepEqual(m.presence!(offline, [true, true], 0), s);
    for (const move of [
      null,
      {},
      { type: 'pick', index: 0 },
      { type: 'secret', cards: [] },
      { type: 'secret', cards: [7] },
      { type: 'secret', cards: [0.5] },
      { type: 'discard', cards: [0, 0, 0] },
      { type: 'contest', cards: [0, 0, 0, 0, 0] },
    ])
      rejected(s, 0, { type: 'move', move });
    rejected(s, 1, {
      type: 'move',
      seat: 0,
      move: { type: 'secret', cards: [s.game!.hands[0][0]] },
    });
    rejected(s, 0, {
      type: 'move',
      positionRevision: undefined,
      move: { type: 'secret', cards: [s.game!.hands[0][0]] },
    });
  });

  void it('keeps opponent hands, hidden cards and discards out of views, including reconnection views', () => {
    let s = start();
    for (const side of [0, 1] as Side[])
      s = act(s, side, {
        type: 'move',
        move: { type: 'secret', cards: [s.game!.hands[side][0]] },
      });
    for (const side of [0, 1] as Side[])
      s = act(s, side, {
        type: 'move',
        move: { type: 'discard', cards: s.game!.hands[side].slice(0, 2) },
      });
    for (const side of [0, 1, null] as const) {
      const v = m.view(s, side, 0) as HanamiOnlineView;
      const changed = structuredClone(s);
      const g = changed.game!;
      for (const hidden of [0, 1] as Side[]) {
        if (hidden === side) continue;
        g.hands[hidden] = g.hands[hidden].map((c) => (c + 1) % 7);
        g.secret[hidden] = (g.secret[hidden]! + 1) % 7;
        g.discarded[hidden] = g.discarded[hidden].map((c) => (c + 1) % 7);
      }
      g.deck = g.deck.map((c) => (c + 1) % 7);
      g.removed = (g.removed! + 1) % 7;
      assert.deepEqual(
        m.view(changed, side, 0),
        v,
        'changing unseen identities cannot change a recipient’s view',
      );
      assert.deepEqual(v.hand, side === null ? [] : s.game!.hands[side]);
      assert.deepEqual(
        v.mySecretDiscards,
        side === null ? [] : s.game!.discarded[side],
      );
      assert.equal(v.mySecret, side === null ? null : s.game!.secret[side]);
      assert.equal(v.summary, null);
      for (const key of [
        'game',
        'hands',
        'deck',
        'removed',
        'secret',
        'discarded',
      ])
        assert.ok(!Object.hasOwn(v, key), key);
    }
    s = finishRound(s);
    assert.deepEqual(
      (m.view(s, 0, 0) as HanamiOnlineView).summary?.secrets,
      s.game!.secret,
      'round-end secrets are intentionally public',
    );
    assert.deepEqual(
      (m.view(s, null, 0) as HanamiOnlineView).mySecretDiscards,
      [],
    );
  });

  void it('binds picks to the exact offer and rejects malformed or wrong-side choices', () => {
    let s = start();
    s = act(s, 0, {
      type: 'move',
      move: { type: 'gift', cards: s.game!.hands[0].slice(0, 3) },
    });
    const offerRevision = s.positionRevision;
    rejected(s, 0, { type: 'move', move: { type: 'pick', index: 0 } });
    for (const index of [-1, 3, 0.5, '0'])
      rejected(s, 1, { type: 'move', move: { type: 'pick', index } });
    rejected(s, 1, {
      type: 'move',
      move: { type: 'secret', cards: [s.game!.hands[1][0]] },
    });
    s = act(s, 1, { type: 'move', move: { type: 'pick', index: 0 } });
    s = act(s, 1, {
      type: 'move',
      move: { type: 'gift', cards: s.game!.hands[1].slice(0, 3) },
    });
    s = act(s, 0, { type: 'move', move: { type: 'pick', index: 0 } });
    s = act(s, 0, {
      type: 'move',
      move: { type: 'contest', cards: s.game!.hands[0].slice(0, 4) },
    });
    rejected(s, 1, {
      type: 'move',
      positionRevision: offerRevision,
      move: { type: 'pick', index: 0 },
    });
    rejected(s, 1, { type: 'move', move: { type: 'pick', index: 2 } });
    s = act(s, 1, { type: 'move', move: { type: 'pick', index: 1 } });
    assert.equal(s.game!.phase, 'play');
  });

  void it('cannot reuse a previous round’s ready consent, even from a seat whose turn recurs', () => {
    const rng = random(3);
    let s = finishRound(start(rng));
    assert.equal(s.game!.phase, 'round-end');
    const firstRound = s.positionRevision;
    s = act(s, 0, { type: 'next' }, rng);
    s = act(s, 0, { type: 'next' }, rng);
    assert.equal(s.game!.round, 1);
    s = act(s, 1, { type: 'next' }, rng);
    assert.equal(s.game!.starter, 1);
    assert.deepEqual(s.ready, [false, false]);
    rejected(s, 1, {
      type: 'move',
      positionRevision: firstRound,
      move: { type: 'secret', cards: [s.game!.hands[1][0]] },
    });
    s = finishRound(s);
    assert.equal(s.game!.phase, 'round-end');
    rejected(s, 0, { type: 'next', positionRevision: firstRound });
    assert.deepEqual(s.ready, [false, false]);
    s = act(s, 1, { type: 'next' }, rng);
    s = act(s, 0, { type: 'next' }, rng);
    assert.equal(s.game!.round, 3);
    assert.equal(s.game!.starter, 0);
  });

  void it('scores each finished match once, swaps its opener and rejects old rematch consent', () => {
    const rng = random(6);
    let s = finishMatch(start(rng), rng);
    const score = [0, 0];
    if (s.game!.result!.winner !== null) score[s.game!.result!.winner]++;
    assert.deepEqual(s.score, score);
    const old = s.positionRevision;
    rejected(s, 0, { type: 'move', move: { type: 'pick', index: 0 } });
    rejected(s, 0, { type: 'next' });
    s = act(s, 0, { type: 'rematch' }, rng);
    s = act(s, 1, { type: 'rematch' }, rng);
    assert.equal(s.game!.starter, 1);
    assert.deepEqual(s.ready, [false, false]);
    assert.deepEqual(s.score, score);
    s = finishMatch(s, rng);
    if (s.game!.result!.winner !== null) score[s.game!.result!.winner]++;
    assert.deepEqual(s.score, score);
    rejected(s, 0, { type: 'rematch', positionRevision: old });
    assert.deepEqual(s.ready, [false, false]);
    s = act(s, 0, { type: 'rematch' }, rng);
    s = act(s, 1, { type: 'rematch' }, rng);
    assert.equal(s.game!.starter, 0);
    assert.deepEqual(s.score, score);
  });
});

const until = async (f: () => unknown, ms = 5000) => {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error('timed out waiting for relay state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
void describe('hanami regressions over real WebSockets', () => {
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
  const client = (t: TestContext, game = 'hanami') => {
    const c = new PlayClient<HanamiOnlineView>({ url, game });
    t.after(() => c.close());
    return c;
  };
  const send = (c: PlayClient<HanamiOnlineView>, a: Record<string, unknown>) =>
    c.act({ positionRevision: c.snapshot.view!.positionRevision, ...a });
  const changed = async (
    players: PlayClient<HanamiOnlineView>[],
    sender: number,
    a: Record<string, unknown>,
  ) => {
    const version = players[0].snapshot.version;
    send(players[sender], a);
    await until(() => players.every((c) => c.snapshot.version > version));
  };
  void it('rejects a wrong-game invitation without consuming the empty seat', async (t) => {
    const host = client(t, 'gomoku');
    host.create('gomoku');
    await until(() => host.snapshot.code);
    const wrong = client(t);
    wrong.join(host.snapshot.code!);
    await until(() => wrong.snapshot.status === 'closed');
    assert.match(wrong.snapshot.error!, /另一款游戏/);
    assert.equal(wrong.snapshot.view, null);
    assert.equal(host.snapshot.seats[1].taken, false);
    wrong.create('hanami');
    await until(() => wrong.snapshot.view);
    assert.equal(wrong.snapshot.view!.started, false);
  });

  void it('rejoins the same private hand and pending offer, rejects stale picks, then scores and rematches', async (t) => {
    const players = [client(t), client(t)];
    const [a, b] = players;
    a.create('hanami');
    await until(() => a.snapshot.code);
    b.join(a.snapshot.code!);
    await until(() => players.every((c) => c.snapshot.view?.started));
    await changed(players, 0, {
      type: 'move',
      move: { type: 'gift', cards: a.snapshot.view!.hand.slice(0, 3) },
    });
    const oldOffer = b.snapshot.view!.positionRevision;
    const hand = [...b.snapshot.view!.hand];
    const offer = structuredClone(b.snapshot.view!.offer);
    (b as unknown as { ws: WebSocket }).ws.close();
    await until(() => b.snapshot.status === 'reconnecting');
    send(b, { type: 'move', move: { type: 'pick', index: 0 } });
    assert.match(b.snapshot.error!, /连接恢复/);
    await until(
      () =>
        b.snapshot.status === 'open' &&
        a.snapshot.version === b.snapshot.version,
    );
    assert.equal(b.snapshot.seat, 1);
    assert.deepEqual(b.snapshot.view!.hand, hand);
    assert.deepEqual(b.snapshot.view!.offer, offer);
    await changed(players, 1, {
      type: 'move',
      move: { type: 'pick', index: 0 },
    });
    await changed(players, 1, {
      type: 'move',
      move: { type: 'gift', cards: b.snapshot.view!.hand.slice(0, 3) },
    });
    await changed(players, 0, {
      type: 'move',
      move: { type: 'pick', index: 0 },
    });
    await changed(players, 0, {
      type: 'move',
      move: { type: 'contest', cards: a.snapshot.view!.hand.slice(0, 4) },
    });
    send(b, {
      type: 'move',
      positionRevision: oldOffer,
      move: { type: 'pick', index: 0 },
    });
    await until(() => b.snapshot.error?.includes('牌局已更新'));
    assert.equal(a.snapshot.view!.phase, 'respond');
    assert.equal(a.snapshot.view!.offer!.kind, 'contest');

    const advanceMatch = async () => {
      for (let step = 0; a.snapshot.view!.phase !== 'over'; step++) {
        assert.ok(step < 50, 'a match must finish within three rounds');
        for (const c of players) {
          const v = c.snapshot.view!;
          for (const key of [
            'game',
            'hands',
            'deck',
            'removed',
            'secret',
            'discarded',
          ])
            assert.ok(!Object.hasOwn(v, key), key);
          assert.equal(v.hand.length, v.handCounts[c.snapshot.seat!]);
          if (v.phase === 'play' || v.phase === 'respond')
            assert.equal(v.summary, null);
        }
        const v = a.snapshot.view!;
        if (v.phase === 'round-end') {
          const starter = v.starter;
          await changed(players, 0, { type: 'next' });
          await changed(players, 1, { type: 'next' });
          assert.equal(a.snapshot.view!.starter, 1 - starter);
        } else {
          const who = v.decider!;
          const own = players[who].snapshot.view!;
          await changed(players, who, {
            type: 'move',
            move:
              own.phase === 'respond'
                ? { type: 'pick', index: 0 }
                : legalMoves(own.hand, own.used[who])[0],
          });
        }
      }
    };
    await advanceMatch();
    const score = [0, 0];
    const winner = a.snapshot.view!.result!.winner;
    if (winner !== null) score[winner]++;
    assert.deepEqual(a.snapshot.view!.score, score);
    const oldEnd = a.snapshot.view!.positionRevision;
    await changed(players, 0, { type: 'rematch' });
    await changed(players, 1, { type: 'rematch' });
    assert.equal(a.snapshot.view!.starter, 1);
    assert.deepEqual(a.snapshot.view!.score, score);
    assert.deepEqual(a.snapshot.view!.ready, [false, false]);
    await advanceMatch();
    const second = a.snapshot.view!.result!.winner;
    if (second !== null) score[second]++;
    assert.deepEqual(a.snapshot.view!.score, score);
    send(a, { type: 'rematch', positionRevision: oldEnd });
    await until(() => a.snapshot.error?.includes('牌局已更新'));
    assert.deepEqual(a.snapshot.view!.ready, [false, false]);
  });
});
