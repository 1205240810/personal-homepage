// 21 点单挑: rules, hidden information and a two-client match over the relay.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PlayClient } from '../lib/multiplayer/client.ts';
import {
  TURN_MS,
  blackjackDuel as m,
  deal,
  total,
  type Card,
  type DuelState,
  type DuelView,
} from '../lib/multiplayer/blackjack-duel.ts';
import { startPlayServer } from '../server/play/main.ts';

const rng = () => 0.42;
const C = (r: number, s = 0): Card => ({ r, s });
/** A dealt round with fixed hands; seat 1 banks, seat 0 plays first. */
function rigged(p: Card[], b: Card[], shoe: Card[] = []): DuelState {
  const s = deal(
    { ...m.create(m.options({ stake: 20 }), rng, 0), started: true, banker: 1 },
    rng,
    0,
  );
  return {
    ...s,
    chips: [1000, 1000],
    result: null,
    hands: [p, b],
    shoe: [...s.shoe.slice(0, 40), ...shoe],
    phase: 'player',
    deadline: TURN_MS,
  };
}
const act = (s: DuelState, seat: number, a: unknown, now = 0) => {
  const r = m.act(s, seat, a, rng, now);
  if (r.error !== undefined) throw new Error(r.error);
  return r.state;
};

void describe('blackjack duel rules', () => {
  void it('scores hands with soft aces', () => {
    assert.equal(total([C(1), C(1), C(9)]), 21);
    assert.equal(total([C(1), C(13)]), 21);
    assert.equal(total([C(10), C(9), C(5)]), 24);
  });
  void it('hides the opponent hole card and the shoe until showdown', () => {
    const s = rigged([C(10), C(7)], [C(9, 1), C(8, 1)]);
    const v0 = m.view(s, 0, 0) as DuelView;
    assert.deepEqual(v0.hands[0], [C(10), C(7)]);
    assert.equal(v0.hands[1][0], null);
    assert.equal(v0.totals[1], null);
    assert.ok(!('shoe' in v0));
    assert.ok(!JSON.stringify(v0).includes('"shoe"'));
  });
  void it('player first, banker second; turn order enforced; ties push', () => {
    const s = rigged([C(10), C(7)], [C(9), C(8)]);
    assert.ok(m.act(s, 1, { type: 'stand' }, rng, 0).error);
    const s1 = act(s, 0, { type: 'stand' });
    assert.equal(s1.phase, 'banker');
    const s2 = act(s1, 1, { type: 'stand' });
    assert.equal(s2.phase, 'done');
    assert.equal(s2.result?.winner, null);
    assert.deepEqual(s2.chips, [1000, 1000]);
  });
  void it('player bust ends the round for the banker', () => {
    const s = act(rigged([C(10), C(9)], [C(2), C(3)], [C(5)]), 0, {
      type: 'hit',
    });
    assert.equal(s.phase, 'done');
    assert.equal(s.result?.winner, 1);
    assert.deepEqual(s.chips, [980, 1020]);
  });
  void it('double doubles the stake and draws exactly one card', () => {
    let s = act(rigged([C(5), C(6)], [C(10), C(7)], [C(10)]), 0, {
      type: 'double',
    });
    assert.equal(s.hands[0].length, 3);
    assert.equal(s.phase, 'banker');
    s = act(s, 1, { type: 'stand' });
    assert.equal(s.result?.winner, 0); // 21 vs 17
    assert.deepEqual(s.chips, [1040, 960]);
  });
  void it('a natural pays 1.5× and settles at once', () => {
    const base = m.create(m.options({ stake: 20 }), rng, 0);
    // Stack the shoe so the player gets A + K (draw order: p, b, p, b).
    const shoe = [...base.shoe.slice(0, 100), C(9), C(13), C(9), C(1)];
    const s = deal({ ...base, shoe, started: true, banker: 1 }, rng, 0);
    assert.equal(s.phase, 'done');
    assert.equal(s.result?.winner, 0);
    assert.deepEqual(s.chips, [1030, 970]);
  });
  void it('keeps both hole cards private in every active phase and for spectators', () => {
    let s = rigged([C(3), C(4)], [C(2, 1), C(5, 1)], [C(6), C(7)]);
    const check = () => {
      for (const seat of [0, 1, null]) {
        const view = JSON.parse(JSON.stringify(m.view(s, seat, 0))) as DuelView;
        assert.ok(!('shoe' in view));
        assert.equal(view.result, null);
        for (const who of [0, 1]) {
          assert.deepEqual(view.hands[who].slice(1), s.hands[who].slice(1));
          if (seat === who) {
            assert.deepEqual(view.hands[who][0], s.hands[who][0]);
            assert.equal(view.totals[who], total(s.hands[who]));
          } else {
            assert.equal(view.hands[who][0], null);
            assert.equal(view.totals[who], null);
          }
        }
      }
    };
    check();
    s = act(s, 0, { type: 'hit' });
    check();
    s = act(s, 0, { type: 'stand' });
    check();
    s = act(s, 1, { type: 'hit' });
    check();
    s = act(s, 1, { type: 'stand' });
    for (const seat of [0, 1, null]) {
      const view = m.view(s, seat, 0) as DuelView;
      assert.deepEqual(view.hands, s.hands);
      assert.deepEqual(view.totals, s.result!.totals);
      assert.ok(
        !('shoe' in view),
        'even showdown must not reveal future cards',
      );
    }
  });
  void it('rejects illegal actions without changing the state or consuming cards', () => {
    const s = rigged([C(3), C(4)], [C(2), C(5)], [C(2)]);
    const before = structuredClone(s);
    for (const [seat, action] of [
      [1, { type: 'hit' }],
      [1, { type: 'double' }],
      [0, { type: 'next' }],
      [0, { type: 'rematch' }],
      [0, { type: 'set-chips', chips: 9000 }],
      [0, null],
      [0, []],
    ] as const) {
      assert.ok(m.act(s, seat, action, rng, 0).error);
      assert.deepEqual(s, before);
    }
    const hit = act(s, 0, { type: 'hit' });
    assert.equal((m.view(hit, 0, 0) as DuelView).canDouble, false);
    assert.ok(m.act(hit, 0, { type: 'double' }, rng, 0).error);
    assert.deepEqual(
      s,
      before,
      'legal actions must not mutate previous state either',
    );
  });
  void it('requires both stacks to cover a double and compounds two doubles', () => {
    const s = rigged([C(5), C(6)], [C(4), C(5)], [C(9), C(9)]);
    for (const chips of [
      [39, 1961],
      [1961, 39],
    ] as [number, number][]) {
      const poor = { ...s, chips };
      assert.equal((m.view(poor, 0, 0) as DuelView).canDouble, false);
      assert.ok(m.act(poor, 0, { type: 'double' }, rng, 0).error);
    }
    const doubled = act(s, 0, { type: 'double' });
    assert.equal(
      (m.view({ ...doubled, chips: [79, 1921] }, 1, 0) as DuelView).canDouble,
      false,
    );
    const done = act(doubled, 1, { type: 'double' });
    assert.equal(done.phase, 'done');
    assert.deepEqual(done.doubled, [true, true]);
    assert.deepEqual(
      done.hands.map((h) => h.length),
      [3, 3],
    );
    assert.deepEqual(done.chips, [1080, 920]);
  });
  void it('enforces each 30-second deadline, including actions that arrive before a delayed timer', () => {
    const s = rigged([C(10), C(7)], [C(9), C(8)]);
    assert.equal(m.nextTick!(s), TURN_MS);
    assert.equal(m.tick!(s, rng, TURN_MS - 1), s);
    for (const type of ['hit', 'stand', 'double']) {
      assert.ok(
        m.act(s, 0, { type }, rng, TURN_MS).error,
        `${type} at deadline must be rejected`,
      );
      assert.ok(m.act(s, 0, { type }, rng, TURN_MS + 1000).error);
    }
    const t = m.tick!(s, rng, TURN_MS);
    assert.equal(t.phase, 'banker');
    assert.equal(t.deadline, 2 * TURN_MS);
    assert.match(t.log.join(), /闲家超时/);
    assert.equal(m.tick!(t, rng, 2 * TURN_MS - 1), t);
    const done = m.tick!(t, rng, 2 * TURN_MS);
    assert.equal(done.phase, 'done');
    assert.equal(done.deadline, null);
    assert.match(done.log.join(), /庄家超时/);
    assert.equal(m.tick!(done, rng, 3 * TURN_MS), done);
    assert.ok(m.act(done, 0, { type: 'hit' }, rng, 3 * TURN_MS).error);
  });
  void it('new decisions get 30 seconds, but reconnects do not reset the clock or hand', () => {
    const s = rigged([C(3), C(4)], [C(2), C(5)], [C(2)]);
    const hit = act(s, 0, { type: 'hit' }, 1000);
    assert.equal(hit.deadline, TURN_MS + 1000);
    const disconnected = m.presence!(hit, [false, true], 2000);
    const rejoined = m.presence!(disconnected, [true, true], 3000);
    assert.equal(rejoined, hit);
    const banker = act(rejoined, 0, { type: 'stand' }, 4000);
    assert.equal(banker.deadline, TURN_MS + 4000);
  });
  void it('rematches require both players and restore stacks while exchanging roles', () => {
    const bankrupt = act(
      { ...rigged([C(10), C(9)], [C(2), C(3)], [C(5)]), chips: [20, 1980] },
      0,
      { type: 'hit' },
    );
    assert.equal(bankrupt.phase, 'over');
    assert.deepEqual(bankrupt.chips, [0, 2000]);
    assert.ok(m.act(bankrupt, 0, { type: 'next' }, rng, 0).error);
    const ready = act(bankrupt, 0, { type: 'rematch' });
    assert.equal(ready.phase, 'over');
    assert.deepEqual(ready.ready, [true, false]);
    assert.equal(act(ready, 0, { type: 'rematch' }).phase, 'over');
    const fresh = act(ready, 1, { type: 'rematch' });
    assert.equal(fresh.banker, 0);
    assert.equal(fresh.round, 1);
    assert.deepEqual(fresh.ready, [false, false]);
    assert.equal(
      fresh.chips.reduce((a, b) => a + b),
      2000,
    );
    assert.ok(fresh.chips.every((c) => c >= 970 && c <= 1030));
  });
  void it('next round swaps banker; match ends when a stack can’t cover the stake', () => {
    let s = act(
      act(rigged([C(10), C(7)], [C(9), C(8)]), 0, { type: 'stand' }),
      1,
      { type: 'stand' },
    );
    s = act(s, 0, { type: 'next' });
    assert.equal(s.phase, 'done');
    s = act(s, 1, { type: 'next' });
    assert.equal(s.banker, 0);
    const broke = act(rigged([C(10), C(9)], [C(2), C(3)], [C(5)]), 0, {
      type: 'hit',
    });
    const s2 = { ...broke, chips: [10, 1990] as [number, number] };
    assert.ok(s2.chips[0] < 20);
    const lost = act(
      { ...rigged([C(10), C(9)], [C(2), C(3)], [C(5)]), chips: [20, 1980] },
      0,
      { type: 'hit' },
    );
    assert.equal(lost.phase, 'over');
  });
});

void describe('blackjack duel over the relay', () => {
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
  void it('keeps disconnected seats private and restores the same hand and deadline on rejoin', async () => {
    const saved = new Map<string, string>();
    const tokens = {
      get: (code: string) => saved.get(code) ?? null,
      set: (code: string, token: string) => {
        saved.set(code, token);
      },
    };
    const a = new PlayClient<DuelView>({ url, tokens });
    const b = new PlayClient<DuelView>({ url });
    const outsider = new PlayClient<DuelView>({ url });
    const resumed = new PlayClient<DuelView>({ url, tokens });
    try {
      a.create('blackjack-duel', { stake: 10 });
      await until(() => a.snapshot.code);
      const code = a.snapshot.code!;
      b.join(code);
      await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
      const before = structuredClone(a.snapshot.view!);
      a.close();
      await until(() => !b.snapshot.seats[0].online);
      outsider.join(code);
      await until(() => outsider.snapshot.error);
      assert.match(outsider.snapshot.error!, /房间已满/);
      assert.equal(outsider.snapshot.view, null);
      assert.equal(outsider.snapshot.seat, null);
      resumed.join(code);
      await until(
        () => resumed.snapshot.view?.started && b.snapshot.seats[0].online,
      );
      const after = resumed.snapshot.view!;
      assert.equal(resumed.snapshot.seat, 0);
      assert.equal(after.round, before.round);
      assert.equal(after.deadline, before.deadline);
      assert.deepEqual(after.hands, before.hands);
      assert.deepEqual(after.chips, before.chips);
      assert.ok(!JSON.stringify(after).includes('"shoe"'));
      if (after.phase === 'player') {
        assert.equal(after.hands[1][0], null);
        assert.equal(b.snapshot.view!.hands[0][0], null);
      }
      assert.ok(!JSON.stringify(b.snapshot).includes(saved.get(code)!));
    } finally {
      a.close();
      b.close();
      outsider.close();
      resumed.close();
    }
  });
  void it('two clients finish rounds and never see each other’s hole card', async () => {
    const a = new PlayClient<DuelView>({ url });
    a.create('blackjack-duel', { stake: 10 });
    await until(() => a.snapshot.code);
    const b = new PlayClient<DuelView>({ url });
    b.join(a.snapshot.code!);
    await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
    for (let round = 0; round < 3; round++) {
      await until(() => {
        const v = a.snapshot.view;
        return v && (v.phase === 'player' || v.phase === 'done');
      });
      const va = a.snapshot.view!;
      if (va.phase === 'player') {
        assert.equal(va.hands[1][0], null, 'A must not see B’s hole card');
        assert.equal(
          b.snapshot.view!.hands[0][0],
          null,
          'B must not see A’s hole card',
        );
        const first = va.banker === 0 ? b : a;
        const second = va.banker === 0 ? a : b;
        first.act({ type: 'stand' });
        await until(() => second.snapshot.view?.phase !== 'player');
        if (second.snapshot.view?.phase === 'banker')
          second.act({ type: 'stand' });
      }
      await until(
        () =>
          a.snapshot.view?.phase === 'done' &&
          b.snapshot.view?.phase === 'done',
      );
      const sum = a.snapshot.view!.chips[0] + a.snapshot.view!.chips[1];
      assert.equal(sum, 2000, 'chips are conserved');
      assert.notEqual(
        a.snapshot.view!.hands[1][0],
        null,
        'cards revealed at showdown',
      );
      const banker = a.snapshot.view!.banker;
      a.act({ type: 'next' });
      b.act({ type: 'next' });
      await until(() => a.snapshot.view?.round === round + 2);
      assert.notEqual(a.snapshot.view!.banker, banker, 'banker alternates');
    }
    a.close();
    b.close();
  });
});
