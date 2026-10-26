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
    const refused = act(s, 1, {
      type: 'undo-answer',
      accept: false,
      undoRevision: s.undoRevision,
    });
    assert.equal(refused.game.moves.length, 2);
    s = act(s, 1, {
      type: 'undo-answer',
      accept: true,
      undoRevision: s.undoRevision,
    });
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
    s = act(s, 0, { type: 'confirm', scoringRevision: s.scoringRevision });
    assert.equal(s.phase, 'scoring');
    s = act(s, 1, { type: 'confirm', scoringRevision: s.scoringRevision });
    assert.equal(s.phase, 'over');
    assert.equal(s.result?.winner, BLACK); // 81 vs 7.5
    s = act(s, 0, { type: 'rematch' });
    s = act(s, 1, { type: 'rematch' });
    assert.deepEqual(s.colors, [WHITE, BLACK]);
    assert.equal(s.phase, 'play');
  });
  void it('a delayed undo answer cannot approve a newer request', () => {
    let s = start({ creator: 'black' });
    s = act(s, 0, { type: 'move', p: 40 });
    s = act(s, 1, { type: 'move', p: 41 });
    s = act(s, 0, { type: 'undo-request' });
    const oldRevision = s.undoRevision;
    assert.ok(goOnline.act(s, 1, { type: 'undo-request' }, rnd, 0).error);
    s = act(s, 0, { type: 'move', p: 42 });
    assert.equal(s.undoFrom, null);
    s = act(s, 0, { type: 'undo-request' });
    assert.ok(s.undoRevision > oldRevision);
    const stale = goOnline.act(
      s,
      1,
      { type: 'undo-answer', accept: true, undoRevision: oldRevision },
      rnd,
      0,
    );
    assert.ok(stale.error);
    assert.equal(s.game.moves.length, 3);
    assert.equal(s.undoFrom, 0);
    s = act(s, 1, {
      type: 'undo-answer',
      accept: true,
      undoRevision: s.undoRevision,
    });
    assert.deepEqual(s.game.moves, [40, 41]);
    assert.equal(s.game.toPlay, BLACK);
  });
  void it('resign ends the game for the opponent', () => {
    const s = act(start({ creator: 'white' }), 0, { type: 'resign' });
    assert.equal(s.result?.winner, BLACK);
    assert.equal(s.result?.reason, 'resign');
  });
  void it('requires both confirmations to refer to the current scoring proposal', () => {
    let s = start({ creator: 'black' });
    s = act(s, 0, { type: 'move', p: 40 });
    s = act(s, 1, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    const oldRevision = s.scoringRevision;
    s = act(s, 0, { type: 'confirm', scoringRevision: oldRevision });
    s = act(s, 1, { type: 'toggle-dead', p: 40 });
    assert.deepEqual(s.confirmed, [false, false]);
    assert.ok(s.scoringRevision > oldRevision);
    s = act(s, 1, { type: 'confirm', scoringRevision: s.scoringRevision });
    const stale = goOnline.act(
      s,
      0,
      { type: 'confirm', scoringRevision: oldRevision },
      rnd,
      0,
    );
    assert.ok(
      stale.error,
      'an in-flight confirmation must not approve unseen edits',
    );
    assert.equal(s.phase, 'scoring');
    assert.deepEqual(s.confirmed, [false, true]);
    s = act(s, 0, { type: 'confirm', scoringRevision: s.scoringRevision });
    assert.equal(s.phase, 'over');
    const settledRevision = s.scoringRevision;
    s = act(s, 0, { type: 'rematch' });
    s = act(s, 1, { type: 'rematch' });
    s = act(s, 1, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    assert.ok(
      s.scoringRevision > settledRevision,
      'rematches must not reuse a prior proposal revision',
    );
  });
  void it('cannot apply a pending undo after resignation', () => {
    let s = act(start({ creator: 'black' }), 0, { type: 'move', p: 40 });
    s = act(s, 0, { type: 'undo-request' });
    s = act(s, 0, { type: 'resign' });
    assert.equal(s.undoFrom, null);
    assert.ok(
      goOnline.act(
        s,
        1,
        { type: 'undo-answer', accept: true, undoRevision: s.undoRevision },
        rnd,
        0,
      ).error,
    );
    assert.equal(s.game.board[40], BLACK);
    assert.equal(s.phase, 'over');
  });
  void it('undoing the first move after resumed scoring still requires two new passes', () => {
    let s = start({ creator: 'black' });
    s = act(s, 0, { type: 'move', p: 40 });
    s = act(s, 1, { type: 'move', p: 41 });
    s = act(s, 0, { type: 'pass' });
    s = act(s, 1, { type: 'pass' });
    s = act(s, 0, { type: 'resume' });
    s = act(s, 0, { type: 'move', p: 42 });
    s = act(s, 0, { type: 'undo-request' });
    s = act(s, 1, {
      type: 'undo-answer',
      accept: true,
      undoRevision: s.undoRevision,
    });
    assert.equal(s.game.moves.length, 4);
    assert.equal(s.game.passes, 0);
    s = act(s, 0, { type: 'pass' });
    assert.equal(s.phase, 'play');
    assert.equal(s.game.passes, 1);
    s = act(s, 1, { type: 'pass' });
    assert.equal(s.phase, 'scoring');
  });
  for (const size of [9, 13, 19]) {
    void it(`preserves handicap and white's first turn through undo and rematch on ${size} lines`, () => {
      const handicap = size === 9 ? 5 : 9;
      let s = start({ size, handicap, creator: 'black' });
      const board = [...s.game.board];
      assert.equal(board.filter((c) => c === BLACK).length, handicap);
      assert.equal(s.game.toPlay, WHITE);
      assert.equal(s.komi, 0.5);
      s = act(s, 1, { type: 'move', p: 0 });
      s = act(s, 0, { type: 'move', p: 1 });
      s = act(s, 1, { type: 'undo-request' });
      s = act(s, 0, {
        type: 'undo-answer',
        accept: true,
        undoRevision: s.undoRevision,
      });
      assert.deepEqual([...s.game.board], board);
      assert.equal(s.game.toPlay, WHITE);
      s = act(s, 0, { type: 'resign' });
      s = act(s, 0, { type: 'rematch' });
      s = act(s, 1, { type: 'rematch' });
      assert.deepEqual(s.colors, [WHITE, BLACK]);
      assert.deepEqual([...s.game.board], board);
      assert.equal(s.game.toPlay, WHITE);
    });
  }
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

  void it('two clients reconnect, undo, agree scoring and swap colours for a rematch', async (t) => {
    const a = new PlayClient<GoOnlineView>({ url, name: '甲' });
    const b = new PlayClient<GoOnlineView>({ url, name: '乙' });
    t.after(() => {
      a.close();
      b.close();
    });
    a.create('go', { size: 9, creator: 'black' });
    await until(() => a.snapshot.code);
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
    assert.equal(a.snapshot.view?.board[40], BLACK);
    assert.equal(a.snapshot.view?.board[20], WHITE);
    a.act({ type: 'undo-request' });
    await until(() => b.snapshot.view?.undoFrom === 0);
    b.act({
      type: 'undo-answer',
      accept: true,
      undoRevision: b.snapshot.view!.undoRevision,
    });
    await until(() => a.snapshot.view?.moves.length === 0);
    a.act({ type: 'move', p: 40 });
    await until(() => b.snapshot.view?.board[40] === BLACK);
    b.act({ type: 'pass' });
    await until(() => a.snapshot.view?.toPlay === BLACK);
    a.act({ type: 'pass' });
    await until(() => b.snapshot.view?.phase === 'scoring');
    const revision = b.snapshot.view!.scoringRevision;
    a.act({ type: 'confirm', scoringRevision: revision });
    await until(() => b.snapshot.view?.confirmed[0]);
    b.act({ type: 'toggle-dead', p: 40 });
    await until(() => a.snapshot.view!.scoringRevision > revision);
    b.act({
      type: 'confirm',
      scoringRevision: b.snapshot.view!.scoringRevision,
    });
    await until(() => a.snapshot.view?.confirmed[1]);
    a.act({ type: 'confirm', scoringRevision: revision });
    await until(() => a.snapshot.error?.includes('点目结果已更新'));
    assert.equal(a.snapshot.view?.phase, 'scoring');
    assert.deepEqual(a.snapshot.view?.confirmed, [false, true]);
    a.act({
      type: 'confirm',
      scoringRevision: a.snapshot.view!.scoringRevision,
    });
    await until(() => b.snapshot.view?.phase === 'over');
    a.act({ type: 'rematch' });
    await until(() => b.snapshot.view?.rematch[0]);
    b.act({ type: 'rematch' });
    await until(() => a.snapshot.view?.phase === 'play');
    assert.equal(a.snapshot.view?.you, WHITE);
    assert.equal(b.snapshot.view?.you, BLACK);
    a.act({ type: 'resign' });
    await until(() => b.snapshot.view?.result?.winner === BLACK);
    a.close();
    b.close();
  });
});
