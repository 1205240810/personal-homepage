// 德州联机: two humans + server-run AI, private hole cards, timers, relay e2e.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  act as engineAct,
  shuffledDeck,
  startHand,
} from '../lib/games/holdem-engine.ts';
import {
  decideBot,
  seededRandom,
  type AiDifficulty,
} from '../lib/games/holdem-strategy.ts';
import { PlayClient } from '../lib/multiplayer/client.ts';
import {
  AI_DELAY_MS,
  NEXT_HAND_MS,
  TURN_MS,
  holdemOnline as m,
  type HoldemOnlineView,
  type OnlineHoldemState,
} from '../lib/multiplayer/holdem-online.ts';
import { startPlayServer } from '../server/play/main.ts';

let seed = 7;
const rng = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const fresh = (bots: 1 | 2 | 3 = 2) =>
  m.presence!(
    m.create(m.options({ bots, difficulty: 'casual' }), rng, 0),
    [true, true],
    0,
  );
const total = (s: OnlineHoldemState) =>
  s.game!.stacks.reduce((a, b) => a + b, 0) +
  (s.game!.result ? 0 : s.game!.committed.reduce((a, b) => a + b, 0));
const act = (s: OnlineHoldemState, seat: number, a: unknown, now = 0) => {
  const r = m.act(s, seat, a, rng, now);
  if ('error' in r) throw new Error(r.error);
  return r.state;
};
/** Drive a hand to completion: humans check/call, AI via tick. */
function playOut(s: OnlineHoldemState, now = 0) {
  for (let i = 0; i < 200 && !s.game!.result; i++) {
    const g = s.game!;
    const p = s.humanAt.indexOf(g.toAct!);
    now += 1000;
    if (p >= 0) {
      const r = m.act(s, p, { type: 'call' }, rng, now);
      s = 'error' in r ? act(s, p, { type: 'check' }, now) : r.state;
    } else s = m.tick!(s, rng, Math.max(now, s.deadline!));
  }
  return s;
}

void describe('holdem online rules', () => {
  void it('validates options and seats humans apart with AI personas', () => {
    assert.throws(() => m.options({ bots: 4 }));
    assert.throws(() => m.options({ difficulty: 'god' }));
    assert.throws(() => m.options({ bots: 2, styles: ['careful'] }));
    assert.throws(() => m.options({ bots: 1, styles: ['god'] }));
    assert.throws(() => m.options({ styles: 'active' }));
    for (const bots of [1, 2, 3]) {
      const styles = ['tricky', 'balanced', 'active'].slice(0, bots);
      const configured = m.create(m.options({ bots, styles }), rng, 0);
      assert.deepEqual(
        configured.seats.filter((x) => x.kind === 'ai').map((x) => x.style),
        styles,
      );
    }
    const s = fresh(3);
    assert.equal(s.seats.length, 5);
    assert.deepEqual(s.humanAt, [0, 2]);
    assert.deepEqual(
      s.seats
        .filter((x) => x.kind === 'ai')
        .map((x) => x.kind === 'ai' && x.name),
      ['灯塔', '疾风', '帷幕'],
    );
  });
  void it('waits for both players before dealing', () => {
    const s = m.create(m.options({}), rng, 0);
    assert.equal(m.presence!(s, [true, false], 0).game, null);
    assert.ok(fresh().game);
  });
  void it('each player sees only their own hole cards; deck never sent', () => {
    const s = fresh();
    const v0 = m.view(s, 0, 0) as HoldemOnlineView;
    const v1 = m.view(s, 1, 0) as HoldemOnlineView;
    assert.deepEqual(v0.seats[s.humanAt[0]].cards, s.game!.holes[s.humanAt[0]]);
    assert.equal(v0.seats[s.humanAt[1]].cards, null);
    assert.equal(v1.seats[s.humanAt[0]].cards, null);
    for (const v of [v0, v1]) {
      for (const seat of v.seats.filter((x) => x.kind === 'ai'))
        assert.equal(seat.cards, null, 'AI hole cards stay private');
      const json = JSON.stringify(v);
      assert.ok(!json.includes('"deck"') && !json.includes('botTrace'));
    }
    const spectator = m.view(s, null, 0) as HoldemOnlineView;
    assert.ok(spectator.seats.every((x) => x.cards === null));
  });
  void it('rejects out-of-turn and illegal actions', () => {
    const s = fresh();
    const g = s.game!;
    const waiting = s.humanAt.findIndex((t) => t !== g.toAct);
    assert.ok(m.act(s, waiting, { type: 'call' }, rng, 0).error);
    const p = s.humanAt.indexOf(g.toAct!);
    if (p >= 0) {
      assert.ok(m.act(s, p, { type: 'raise', to: 1 }, rng, 0).error);
      assert.ok(m.act(s, p, { type: 'nope' }, rng, 0).error);
    }
  });
  void it('rejects a queued human action at its deadline without applying it to the next turn', () => {
    const s = fresh(1); // button 0 is the first player to act in a three-seat table
    const before = JSON.stringify(s);
    const p = s.humanAt.indexOf(s.game!.toAct!);
    assert.equal(p, 0);
    assert.equal(
      m.act(s, p, { type: 'call' }, rng, s.deadline! - 1).error,
      undefined,
    );
    assert.match(
      m.act(s, p, { type: 'call' }, rng, s.deadline!).error!,
      /超时/,
    );
    assert.match(
      m.act(s, p, { type: 'call' }, rng, s.deadline! + 100).error!,
      /超时/,
    );
    assert.equal(JSON.stringify(s), before);
    const expired = m.tick!(s, rng, s.deadline!);
    assert.equal(expired.game!.folded[s.humanAt[p]], true);
  });
  void it('disconnecting preserves the turn deadline and still times the player out', () => {
    const s = fresh(1);
    const disconnected = m.presence!(s, [false, true], s.deadline! - 1);
    assert.equal(disconnected.deadline, s.deadline);
    const expired = m.tick!(disconnected, rng, s.deadline!);
    assert.equal(expired.game!.folded[0], true);
    const rejoined = m.presence!(expired, [true, true], s.deadline! + 1);
    assert.deepEqual(rejoined.game, expired.game);
    assert.deepEqual(rejoined.humanAt, s.humanAt);
  });
  void it('AI cannot read opponents’ holes or undealt cards', () => {
    const g = startHand({
      tableSize: 3,
      button: 1,
      deck: shuffledDeck(seededRandom(54)),
    });
    assert.equal(g.toAct, 1);
    const holes = new Proxy(g.holes, {
      get(target, key, receiver) {
        if (key !== '1') throw new Error(`private hole access: ${String(key)}`);
        return Reflect.get(target, key, receiver);
      },
    });
    const guarded = new Proxy(g, {
      get(target, key, receiver) {
        if (key === 'holes') return holes;
        if (key === 'deck' || key === 'cursor')
          throw new Error(`private deck access: ${String(key)}`);
        return Reflect.get(target, key, receiver);
      },
    });
    for (const difficulty of [
      'casual',
      'standard',
      'advanced',
    ] as AiDifficulty[]) {
      const decision = decideBot(guarded, 1, 'careful', difficulty);
      assert.doesNotThrow(() => engineAct(g, decision.action));
    }
  });
  void it('projects contested payouts separately from uncalled refunds and keeps folded holes hidden', () => {
    const prefix = [
      4, 8, 48, 44, 40, 5, 9, 49, 45, 41, 0, 1, 17, 30, 2, 35, 3, 39,
    ];
    const deck = [
      ...prefix,
      ...Array.from({ length: 52 }, (_, i) => i).filter(
        (c) => !prefix.includes(c),
      ),
    ];
    let g = startHand({
      tableSize: 5,
      button: 2,
      stacks: [25, 100, 70, 100, 100],
      deck,
    });
    g = engineAct(g, { type: 'raise', to: 25 });
    g = engineAct(g, { type: 'raise', to: 100 });
    g = engineAct(g, { type: 'call' });
    g = engineAct(g, { type: 'fold' });
    g = engineAct(g, { type: 'fold' });
    const s = { ...fresh(3), game: g };
    const v = m.view(s, 0, 0) as HoldemOnlineView;
    assert.deepEqual(v.result!.winners, [0, 1]);
    assert.deepEqual(g.result!.returned, [0, 30, 0, 0, 0]);
    assert.deepEqual(
      v.seats.map((x) => x.won),
      [90, 90, 0, 0, 0],
    );
    assert.equal(
      v.seats.reduce((sum, x) => sum + x.won, 0),
      v.result!.pot,
    );
    assert.equal(v.seats[3].cards, null);
    assert.equal(v.seats[4].cards, null);
    assert.equal(
      v.seats.reduce((sum, x) => sum + x.stack, 0),
      395,
    );
  });
  void it('AI acts on tick after a short delay; humans get a 30 s clock', () => {
    let s = fresh(3);
    let ai = 0;
    let human = 0;
    for (let i = 0; i < 60 && !s.game!.result; i++) {
      const g = s.game!;
      const p = s.humanAt.indexOf(g.toAct!);
      const due = s.deadline!;
      if (p >= 0) {
        human++;
        assert.equal(m.tick!(s, rng, due - 1), s, 'no early timeout');
        s = m.tick!(s, rng, due); // timeout → check or fold
        assert.ok(s.timeouts.length > 0);
      } else {
        ai++;
        s = m.tick!(s, rng, due);
      }
    }
    assert.ok(ai > 0 && human > 0);
    assert.ok(s.game!.result, 'hand finishes with timeouts and AI');
    assert.ok(TURN_MS > AI_DELAY_MS);
  });
  void it('chips are conserved, showdown reveals, next hand moves the button', () => {
    let s = fresh();
    const start = total(s);
    s = playOut(s);
    assert.equal(total(s), start);
    const v = m.view(s, 0, 0) as HoldemOnlineView;
    if (v.result?.reason === 'showdown')
      assert.ok(v.seats.filter((x) => !x.folded).every((x) => x.cards));
    const button = s.game!.button;
    s = act(s, 0, { type: 'next' });
    assert.equal(s.game!.hand, 1, 'waits for both');
    s = act(s, 1, { type: 'next' });
    assert.equal(s.game!.hand, 2);
    assert.equal(s.game!.button, (button + 1) % s.seats.length);
    // Also auto-deals after the pause.
    s = playOut(s);
    s = m.tick!(s, rng, s.deadline!);
    assert.equal(s.game!.hand, 3);
    assert.ok(s.deadline! - 0 >= 0 && NEXT_HAND_MS > 0);
  });
  void it('busted seats rebuy automatically', () => {
    let s = playOut(fresh());
    s = { ...s, stacks: s.stacks.map((x, i) => (i === 1 ? 0 : x)) };
    s = act(s, 0, { type: 'next' });
    s = act(s, 1, { type: 'next' });
    assert.equal(s.rebuys[1], 1);
    assert.equal(s.game!.startingStacks[1], 1000);
  });
});

void describe('holdem online over the relay', () => {
  let server: Awaited<ReturnType<typeof startPlayServer>>;
  let url = '';
  before(async () => {
    server = await startPlayServer({ port: 0 });
    url = `ws://127.0.0.1:${server.port}/play/ws`;
  });
  after(() => server.close());
  const until = async (f: () => unknown, ms = 20000) => {
    const end = Date.now() + ms;
    while (!f()) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  void it('rejoins the original seat without leaking cards or accepting a forged actor', async () => {
    const saved = new Map<string, string>();
    const tokens = {
      get: (code: string) => saved.get(code) ?? null,
      set: (code: string, token: string) => {
        saved.set(code, token);
      },
    };
    const a = new PlayClient<HoldemOnlineView>({ url, tokens });
    const b = new PlayClient<HoldemOnlineView>({ url });
    const resumed = new PlayClient<HoldemOnlineView>({ url, tokens });
    const outsider = new PlayClient<HoldemOnlineView>({ url });
    try {
      a.create('holdem', { bots: 1, difficulty: 'casual', styles: ['tricky'] });
      await until(() => a.snapshot.code);
      const code = a.snapshot.code!;
      b.join(code);
      await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
      const original = a.snapshot.view!;
      assert.equal(
        original.seats.find((s) => s.kind === 'ai')!.style,
        'tricky',
      );
      b.act({ type: 'raise', to: 1000, seat: 0 });
      await until(() => b.snapshot.error);
      assert.match(b.snapshot.error!, /轮到/);
      outsider.join(code);
      await until(() => outsider.snapshot.error);
      assert.match(outsider.snapshot.error!, /满/);
      assert.equal(outsider.snapshot.view, null);
      a.close();
      await until(() => b.snapshot.seats[0]?.online === false);
      resumed.join(code);
      await until(() => resumed.snapshot.view?.started);
      const v = resumed.snapshot.view!;
      assert.equal(resumed.snapshot.seat, 0);
      assert.deepEqual(
        v.seats[v.me!].cards,
        original.seats[original.me!].cards,
      );
      assert.equal(v.seats[1].cards, null);
      assert.equal(v.deadline, original.deadline);
      assert.equal(v.hand, original.hand);
    } finally {
      for (const c of [a, b, resumed, outsider]) c.close();
    }
  });
  void it('two humans play hands against server AI with private cards', async () => {
    const a = new PlayClient<HoldemOnlineView>({ url });
    a.create('holdem', { bots: 1, difficulty: 'casual' });
    await until(() => a.snapshot.code);
    const b = new PlayClient<HoldemOnlineView>({ url });
    b.join(a.snapshot.code!);
    await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
    for (let hand = 1; hand <= 2; hand++) {
      await until(() => a.snapshot.view?.hand === hand);
      while (!a.snapshot.view!.result) {
        for (const c of [a, b]) {
          const v = c.snapshot.view!;
          const other = v.seats.find(
            (x) => x.kind === 'human' && x.player !== v.you,
          )!;
          assert.equal(
            other.cards,
            v.result ? other.cards : null,
            'opponent cards hidden',
          );
          if (v.legal)
            c.act(v.legal.canCheck ? { type: 'check' } : { type: 'call' });
        }
        await new Promise((r) => setTimeout(r, 30));
      }
      const v = a.snapshot.view!;
      const sum = v.seats.reduce((t, x) => t + x.stack, 0);
      assert.equal(sum, 3000, 'chips conserved');
      a.act({ type: 'next' });
      b.act({ type: 'next' });
    }
    await until(() => a.snapshot.view?.hand === 3);
    a.close();
    b.close();
  });
});
