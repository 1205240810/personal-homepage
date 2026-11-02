// 花街七席: rules engine, AI sanity, hidden-information firewall and a two-client match.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  ACTIONS,
  VALUES,
  apply,
  decider,
  fullDeck,
  newGame,
  nextRound,
  viewFor,
  type HanamiState,
  type Side,
} from '../lib/games/hanami.ts';
import { chooseHanamiMove, legalMoves } from '../lib/games/hanami-ai.ts';
import { PlayClient } from '../lib/multiplayer/client.ts';
import {
  hanamiOnline as m,
  type HanamiOnlineView,
} from '../lib/multiplayer/hanami-online.ts';
import { startPlayServer } from '../server/play/main.ts';

let seed = 11;
const rng = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
/** Every card accounted for exactly once. */
function conserved(s: HanamiState) {
  const n = Array(7).fill(0);
  const add = (c: number) => n[c]++;
  s.deck.forEach(add);
  if (s.removed !== null) add(s.removed);
  for (const side of [0, 1] as Side[]) {
    s.hands[side].forEach(add);
    s.discarded[side].forEach(add);
    const sec = s.secret[side];
    // After round end the secret is already counted in played.
    if (sec !== null && s.phase !== 'round-end' && s.phase !== 'over') add(sec);
    s.played[side].forEach((k, p) => (n[p] += k));
  }
  s.offer?.cards.forEach(add);
  assert.deepEqual(n, [...VALUES]);
}
function playRound(s: HanamiState, pick = () => 0) {
  while (s.phase === 'play' || s.phase === 'respond') {
    const who = decider(s)!;
    if (s.phase === 'respond')
      s = apply(s, who, { type: 'pick', index: pick() });
    else s = apply(s, who, legalMoves(s.hands[who], s.used[who])[0]);
    conserved(s);
  }
  return s;
}

/** A conserved last turn: each side's final eight scoring cards are prescribed. */
function settle(
  counts: [number[], number[]],
  favour: (Side | null)[] = Array(7).fill(null),
  round = 1,
) {
  assert.deepEqual(counts.map(sum), [8, 8]);
  const secrets = counts.map((row) => row.findIndex((n) => n > 0));
  const played = counts.map((row, side) =>
    row.map((n, p) => n - Number(p === secrets[side])),
  ) as [number[], number[]];
  const unused = VALUES.flatMap((n, p) =>
    Array(n - counts[0][p] - counts[1][p]).fill(p),
  );
  assert.equal(unused.length, 5);
  const s: HanamiState = {
    ...newGame(() => 0.5),
    round,
    favour,
    toAct: 1,
    used: [[...ACTIONS], ['discard', 'gift', 'contest']],
    hands: [[], [secrets[1]]],
    secret: [secrets[0], null],
    played,
    discarded: [unused.slice(0, 2), unused.slice(2, 4)],
    removed: unused[4],
    deck: [],
  };
  conserved(s);
  const done = apply(s, 1, { type: 'secret', cards: [secrets[1]] });
  conserved(done);
  return done;
}

/** A real final offer: choosing 桂 counts together with side 0's known secret. */
function secretChoice(): HanamiState {
  return {
    ...newGame(() => 0.5),
    deck: [],
    removed: 5,
    hands: [[], []],
    secret: [4, 3],
    discarded: [
      [2, 6],
      [1, 6],
    ],
    played: [
      [1, 1, 1, 0, 0, 2, 1],
      [0, 0, 0, 1, 1, 1, 2],
    ],
    used: [[...ACTIONS], [...ACTIONS]],
    toAct: 1,
    offer: { kind: 'gift', from: 1, cards: [0, 3, 4] },
    phase: 'respond',
  };
}

void describe('hanami rules', () => {
  void it('21 cards with values 2,2,2,3,3,4,5; deal 6 each, 1 removed, starter draws', () => {
    assert.equal(fullDeck().length, 21);
    const s = newGame(rng, 0);
    assert.equal(s.hands[0].length, 7);
    assert.equal(s.hands[1].length, 6);
    assert.equal(s.deck.length, 7);
    assert.notEqual(s.removed, null);
    conserved(s);
  });
  void it('each action once per round; correct card counts; turn order', () => {
    let s = newGame(rng, 0);
    const h = s.hands[0];
    assert.throws(() =>
      apply(s, 1, { type: 'secret', cards: [s.hands[1][0]] }),
    );
    assert.throws(() =>
      apply(s, 0, { type: 'discard', cards: [h[0]] } as never),
    );
    s = apply(s, 0, { type: 'secret', cards: [h[0]] });
    assert.equal(s.toAct, 1);
    assert.equal(s.hands[1].length, 7, 'next player drew');
    s = apply(s, 1, { type: 'discard', cards: [s.hands[1][0], s.hands[1][1]] });
    assert.throws(
      () => apply(s, 0, { type: 'secret', cards: [s.hands[0][0]] }),
      /用过/,
    );
  });
  void it('gift: opponent picks one, actor keeps two; contest: opponent picks a pair', () => {
    let s = newGame(rng, 0);
    const g = s.hands[0].slice(0, 3);
    s = apply(s, 0, { type: 'gift', cards: [g[0], g[1], g[2]] });
    assert.equal(s.phase, 'respond');
    assert.equal(decider(s), 1);
    assert.throws(() => apply(s, 0, { type: 'pick', index: 0 }));
    s = apply(s, 1, { type: 'pick', index: 2 });
    assert.equal(sum(s.played[1]), 1);
    assert.equal(s.played[1][g[2]], 1);
    assert.equal(sum(s.played[0]), 2);
    const c = s.hands[1].slice(0, 4);
    s = apply(s, 1, { type: 'contest', cards: [c[0], c[1], c[2], c[3]] });
    s = apply(s, 0, { type: 'pick', index: 1 });
    assert.equal(sum(s.played[0]), 4);
    assert.equal(sum(s.played[1]), 3);
    conserved(s);
  });
  void it('round end reveals secrets, majority takes favour, ties keep the marker', () => {
    const s = playRound(newGame(rng, 0));
    assert.ok(s.phase === 'round-end' || s.phase === 'over');
    for (let p = 0; p < 7; p++) {
      const [a, b] = [s.played[0][p], s.played[1][p]];
      if (a > b) assert.equal(s.favour[p], 0);
      if (b > a) assert.equal(s.favour[p], 1);
      if (a === b) assert.equal(s.favour[p], null);
    }
    // Tie keeps the previous marker.
    const r = {
      ...s,
      phase: 'round-end' as const,
      result: null,
      favour: [0, 1, 0, 1, 0, 1, 0] as (Side | null)[],
    };
    let s2 = nextRound(r, rng);
    assert.equal(s2.round, 2);
    assert.equal(s2.starter, 1, 'starter alternates');
    s2 = playRound(s2);
    for (let p = 0; p < 7; p++)
      if (s2.played[0][p] === s2.played[1][p])
        assert.equal(s2.favour[p], [0, 1, 0, 1, 0, 1, 0][p]);
  });
  void it('11 points takes priority over the opponent holding four patrons', () => {
    const s = settle([
      [1, 0, 0, 0, 0, 3, 4],
      [0, 2, 2, 2, 2, 0, 0],
    ]);
    assert.equal(s.phase, 'over');
    assert.deepEqual(s.result, {
      winner: 0,
      reason: 'points',
      points: [11, 10],
      patrons: [3, 4],
    });
  });
  void it('four patrons wins when neither player reaches eleven points', () => {
    const s = settle([
      [1, 1, 1, 2, 0, 2, 1],
      [0, 0, 0, 1, 3, 2, 2],
    ]);
    assert.deepEqual(s.result, {
      winner: 0,
      reason: 'patrons',
      points: [9, 8],
      patrons: [4, 2],
    });
  });
  void it('after three rounds compares points, then patrons, then permits a draw', () => {
    const tied: [number[], number[]] = [
      [1, 1, 1, 1, 1, 2, 1],
      [1, 1, 1, 1, 1, 2, 1],
    ];
    const pointLead: (Side | null)[] = [1, 1, null, 1, null, 0, 0];
    assert.equal(settle(tied, pointLead, 2).phase, 'round-end');
    assert.deepEqual(settle(tied, pointLead, 3).result, {
      winner: 0,
      reason: 'final',
      points: [9, 7],
      patrons: [2, 3],
    });
    assert.deepEqual(settle(tied, [0, 0, null, 1, null, 0, 1], 3).result, {
      winner: 0,
      reason: 'final',
      points: [8, 8],
      patrons: [3, 2],
    });
    assert.deepEqual(settle(tied, [0, 1, 1, 0, null, 0, 1], 3).result, {
      winner: null,
      reason: 'final',
      points: [9, 9],
      patrons: [3, 3],
    });
  });
  void it('a complete match never needs a fourth round', () => {
    let g = newGame(rng, 0);
    for (let r = 0; r < 3 && g.phase !== 'over'; r++) {
      g = playRound(g, () => 1);
      if (g.phase === 'round-end') g = nextRound(g, rng);
    }
    assert.equal(g.phase, 'over', 'at most 3 rounds');
    assert.ok(g.round <= 3);
  });
  void it('illegal card multisets and response indices do not mutate the state', () => {
    const s = newGame(() => 0.5);
    const before = structuredClone(s);
    const missing = VALUES.findIndex(
      (_, p) => s.hands[0].filter((c) => c === p).length < 2,
    );
    assert.throws(
      () => apply(s, 0, { type: 'discard', cards: [missing, missing] }),
      /没有/,
    );
    assert.deepEqual(s, before);
    const offered = apply(s, 0, {
      type: 'gift',
      cards: s.hands[0].slice(0, 3) as [number, number, number],
    });
    const snapshot = structuredClone(offered);
    for (const index of [-1, 3, 0.5, NaN, Infinity])
      assert.throws(() => apply(offered, 1, { type: 'pick', index }));
    assert.deepEqual(offered, snapshot);
  });
});

void describe('hanami AI', () => {
  void it('uses its own known secret when responding to the final offer', () => {
    const s = secretChoice();
    const before = structuredClone(s);
    conserved(s);
    const result = chooseHanamiMove(s, viewFor(s, 0), 0, 3, () => 0.5);
    assert.deepEqual(result.move, { type: 'pick', index: 2 });
    assert.equal(apply(s, 0, result.move).result?.winner, 0);
    assert.equal(apply(s, 0, { type: 'pick', index: 1 }).result?.winner, 1);
    assert.deepEqual(s, before);
  });
  void it('discards an interrupted world and falls back to the informed heuristic', (t) => {
    const s = secretChoice();
    const ticks = [0, 0, 0, 1000];
    t.mock.method(Date, 'now', () => ticks.shift() ?? 1000);
    const result = chooseHanamiMove(s, viewFor(s, 0), 0, 4, () => 0.5);
    assert.equal(
      result.worlds,
      0,
      'one completed candidate is not a completed world',
    );
    assert.deepEqual(result.move, { type: 'pick', index: 2 });
    assert.match(result.reason, /时间已用尽/);
  });
  void it('checks the deadline inside a rollout, before completing all candidates', (t) => {
    const s = newGame(() => 0.5);
    const before = structuredClone(s);
    let calls = 0;
    t.mock.method(Date, 'now', () => (++calls <= 3 ? 0 : 1000));
    const result = chooseHanamiMove(s, viewFor(s, 0), 0, 4, () => 0.5);
    assert.equal(result.worlds, 0);
    assert.equal(calls, 4);
    conserved(apply(s, 0, result.move));
    assert.deepEqual(s, before);
  });
  void it('rejects a spectator, the wrong decision maker, and finished rounds', () => {
    const s = newGame(() => 0.5);
    assert.throws(() => chooseHanamiMove(s, viewFor(s, 1), 1, 1), /决策/);
    assert.throws(() => chooseHanamiMove(s, viewFor(s, null), 0, 1), /决策/);
    const ended = playRound(s);
    assert.throws(
      () => chooseHanamiMove(ended, viewFor(ended, 0), 0, 1),
      /决策/,
    );
  });
  void it('each tier responds legally and full rounds conserve all cards', (t) => {
    t.mock.method(Date, 'now', () => 0);
    for (const level of [1, 2, 3, 4, 5] as const) {
      let s = secretChoice();
      const r = chooseHanamiMove(s, viewFor(s, 0), 0, level, () => 0.5);
      s = apply(s, 0, r.move);
      conserved(s);
      assert.ok(s.phase === 'round-end' || s.phase === 'over');
    }
    for (const starter of [0, 1] as Side[]) {
      let s = newGame(() => 0.5, starter);
      let decisions = 0;
      while (s.phase === 'play' || s.phase === 'respond') {
        const side = decider(s)!;
        const r = chooseHanamiMove(s, viewFor(s, side), side, 3, () => 0.5);
        s = apply(s, side, r.move);
        conserved(s);
        decisions++;
      }
      assert.equal(decisions, 12, 'eight actions plus four opponent responses');
      assert.deepEqual(s.hands, [[], []]);
      assert.deepEqual(s.deck, []);
    }
  });
});

void describe('hanami hidden information', () => {
  const secretsOf = (v: unknown) => JSON.stringify(v);
  void it('a view never contains the opponent hand, secret, discards or the removed card', () => {
    let s = newGame(rng, 0);
    s = apply(s, 0, { type: 'secret', cards: [s.hands[0][0]] });
    s = apply(s, 1, { type: 'discard', cards: [s.hands[1][0], s.hands[1][1]] });
    const v1 = viewFor(s, 1);
    assert.equal(v1.mySecret, null);
    assert.deepEqual(v1.hasSecret, [true, false]);
    assert.deepEqual(v1.hand, s.hands[1]);
    const json = secretsOf(v1);
    for (const key of [
      '"hands":',
      '"removed":',
      '"deck":',
      '"secret":',
      '"discarded":',
    ])
      assert.ok(!json.includes(key), key);
    const v0 = viewFor(s, 0);
    assert.deepEqual(v0.mySecretDiscards, []);
    assert.equal(v0.mySecret, s.secret[0]);
    const spectator = viewFor(s, null);
    assert.deepEqual(spectator.hand, []);
    assert.equal(spectator.mySecret, null);
  });
  void it('the AI result is identical whatever the opponent actually holds', (test) => {
    test.mock.method(Date, 'now', () => 0);
    const s = newGame(rng, 0);
    const v = viewFor(s, 0);
    // Swap the hidden cards between opponent hand, deck and removed card.
    const pool = [...s.hands[1], ...s.deck, s.removed!];
    const t: HanamiState = {
      ...s,
      hands: [s.hands[0], pool.slice(1, 7)],
      deck: pool.slice(7),
      removed: pool[0],
    };
    const fixed = () => {
      let x = 5;
      return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
    };
    const a = chooseHanamiMove(s, v, 0, 4, fixed());
    const b = chooseHanamiMove(t, v, 0, 4, fixed());
    assert.deepEqual(a.move, b.move);
  });
  void it('AI never reads a full-state field, including hidden secrets and discards', (t) => {
    t.mock.method(Date, 'now', () => 0);
    const s = secretChoice();
    const view = viewFor(s, 0);
    const unreadable = new Proxy({} as HanamiState, {
      get() {
        throw new Error('AI read a state field outside its view');
      },
      ownKeys() {
        throw new Error('AI enumerated the full state');
      },
    });
    for (const level of [1, 2, 3, 4, 5] as const)
      assert.deepEqual(
        chooseHanamiMove(unreadable, view, 0, level, () => 0.5),
        chooseHanamiMove(s, view, 0, level, () => 0.5),
      );
  });
  void it('mutating a returned view cannot change engine history or results', () => {
    let s = newGame(() => 0.5);
    s = apply(s, 0, {
      type: 'gift',
      cards: s.hands[0].slice(0, 3) as [number, number, number],
    });
    s = apply(s, 1, { type: 'pick', index: 0 });
    const before = structuredClone(s);
    const v = viewFor(s, 0);
    const log = v.log[0];
    assert.ok(log.kind === 'gift');
    log.cards[0] = 99;
    log.picked[0] = 99;
    assert.deepEqual(s, before);
    const done = settle([
      [1, 0, 0, 0, 0, 3, 4],
      [0, 2, 2, 2, 2, 0, 0],
    ]);
    const result = viewFor(done, 0).result!;
    result.points[0] = 99;
    result.patrons[0] = 99;
    result.winner = 1;
    assert.deepEqual(done.result, {
      winner: 0,
      reason: 'points',
      points: [11, 10],
      patrons: [3, 4],
    });
  });
  void it('module view hides the same things and starts when both seats are present', () => {
    let st = m.create({}, rng, 0);
    assert.equal(m.presence!(st, [true, false], 0).game, null);
    st = m.presence!(st, [true, true], 0);
    const v = m.view(st, 1, 0) as HanamiOnlineView;
    assert.deepEqual(v.hand, st.game!.hands[1]);
    const json = JSON.stringify(v);
    assert.ok(
      !json.includes('"hands"') &&
        !json.includes('"removed"') &&
        !json.includes('"deck"'),
    );
    assert.ok(
      'error' in
        m.act(
          st,
          1,
          { type: 'move', move: { type: 'secret', cards: [0] } },
          rng,
          0,
        ),
    );
  });
});

void describe('hanami over the relay', () => {
  let server: Awaited<ReturnType<typeof startPlayServer>>;
  let url = '';
  before(async () => {
    server = await startPlayServer({ port: 0 });
    url = `ws://127.0.0.1:${server.port}/play/ws`;
  });
  after(() => server.close());
  const until = async (f: () => unknown, ms = 6000) => {
    const end = Date.now() + ms;
    while (!f()) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  void it('two clients finish a match, never see hidden cards, reconnect and rematch', async () => {
    const a = new PlayClient<HanamiOnlineView>({ url, game: 'hanami' });
    a.create('hanami', {});
    await until(() => a.snapshot.code);
    const b = new PlayClient<HanamiOnlineView>({ url, game: 'hanami' });
    b.join(a.snapshot.code!);
    await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
    const clients = [a, b];
    let dropped = false;
    let steps = 0;
    while (a.snapshot.view!.phase !== 'over') {
      const v = a.snapshot.view!;
      if (v.phase === 'round-end') {
        const r = v.round;
        a.act({
          type: 'next',
          positionRevision: a.snapshot.view!.positionRevision,
        });
        b.act({
          type: 'next',
          positionRevision: b.snapshot.view!.positionRevision,
        });
        await until(
          () =>
            a.snapshot.view!.round === r + 1 &&
            b.snapshot.view!.round === r + 1,
        );
        continue;
      }
      const sig = (c: PlayClient<HanamiOnlineView>) =>
        JSON.stringify([
          c.snapshot.view!.played,
          c.snapshot.view!.used,
          c.snapshot.view!.phase,
          c.snapshot.view!.round,
        ]);
      await until(() => b.snapshot.view && sig(a) === sig(b));
      const who = v.decider!;
      const c = clients[who];
      const cv = c.snapshot.view!;
      const ov = clients[1 - who].snapshot.view!;
      // Firewall checks on the wire views.
      for (const view of [cv, ov]) {
        const json = JSON.stringify(view);
        assert.ok(
          !json.includes('"hands"') &&
            !json.includes('"removed"') &&
            !json.includes('"deck"'),
        );
      }
      assert.equal(ov.hand.length, ov.handCounts[1 - who]);
      const n = JSON.stringify([cv.played, cv.used, cv.phase]);
      const move =
        cv.phase === 'respond'
          ? { type: 'pick', index: 0 }
          : legalMoves(cv.hand, cv.used[who])[0];
      c.act({ type: 'move', move, positionRevision: cv.positionRevision });
      await until(
        () =>
          JSON.stringify([
            a.snapshot.view!.played,
            a.snapshot.view!.used,
            a.snapshot.view!.phase,
          ]) !== n,
      );
      if (!dropped && ++steps === 5) {
        dropped = true;
        (b as unknown as { ws: WebSocket }).ws.close();
        await until(() => b.snapshot.status !== 'open');
        await until(
          () =>
            b.snapshot.status === 'open' &&
            b.snapshot.view?.round === a.snapshot.view?.round,
          6000,
        );
      }
    }
    await until(() => b.snapshot.view?.phase === 'over');
    assert.ok(a.snapshot.view!.result);
    a.act({
      type: 'rematch',
      positionRevision: a.snapshot.view!.positionRevision,
    });
    b.act({
      type: 'rematch',
      positionRevision: b.snapshot.view!.positionRevision,
    });
    await until(
      () => a.snapshot.view?.phase === 'play' && a.snapshot.view.round === 1,
    );
    a.close();
    b.close();
  });
});
