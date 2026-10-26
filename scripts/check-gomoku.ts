// 五子棋: rules, renju forbidden moves, AI sanity and online module + relay e2e.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  BLACK,
  WHITE,
  isForbidden,
  newGame,
  play,
  undo,
  type GomokuState,
} from '../lib/games/gomoku.ts';
import { chooseGomokuMove, GOMOKU_LEVELS } from '../lib/games/gomoku-ai.ts';
import { PlayClient } from '../lib/multiplayer/client.ts';
import {
  gomokuOnline as m,
  type GomokuOnlineState,
  type GomokuOnlineView,
} from '../lib/multiplayer/gomoku-online.ts';
import { startPlayServer } from '../server/play/main.ts';

const at = (x: number, y: number) => y * 15 + x;
/** Build a position from black/white coordinate lists (black to move). */
function pos(
  black: [number, number][],
  white: [number, number][],
  renju = true,
): GomokuState {
  const s = newGame(renju);
  const cells = s.cells.slice();
  for (const [x, y] of black) cells[at(x, y)] = BLACK;
  for (const [x, y] of white) cells[at(x, y)] = WHITE;
  return { ...s, cells, moves: [...black, ...white].map(([x, y]) => at(x, y)) };
}

void describe('gomoku rules', () => {
  void it('five in a row wins in every direction', () => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      let s = newGame();
      for (let k = 0; k < 5; k++) {
        s = play(s, at(5 + dx * k, 7 + dy * k));
        if (k < 4) s = play(s, at(0 + k, 0));
      }
      assert.equal(s.winner, BLACK);
      assert.equal(s.line?.length, 5);
    }
  });
  void it('rejects occupied points and moves after the end; undo replays', () => {
    let s = play(newGame(), at(7, 7));
    assert.throws(() => play(s, at(7, 7)));
    s = play(s, at(8, 8));
    assert.equal(undo(s, 2).moves.length, 0);
    assert.equal(undo(s, 1).toPlay, WHITE);
  });
  void it('free rule: overline wins for black', () => {
    const s = pos(
      [
        [2, 7],
        [3, 7],
        [4, 7],
        [6, 7],
        [7, 7],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 1],
      ],
      false,
    );
    assert.equal(play(s, at(5, 7)).winner, BLACK);
  });
  void it('renju: black overline is forbidden, white overline wins', () => {
    const s = pos(
      [
        [2, 7],
        [3, 7],
        [4, 7],
        [6, 7],
        [7, 7],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 1],
      ],
    );
    assert.ok(isForbidden(s, at(5, 7)));
    const r = play(s, at(5, 7));
    assert.equal(r.winner, WHITE);
    assert.equal(r.reason, 'forbidden');
  });
  void it('renju: double three and double four are forbidden; four-three is fine', () => {
    // 三三: two open twos crossing at (7,7).
    const t = pos(
      [
        [5, 7],
        [6, 7],
        [7, 5],
        [7, 6],
      ],
      [
        [0, 0],
        [0, 2],
        [0, 4],
        [0, 6],
      ],
    );
    assert.ok(isForbidden(t, at(7, 7)), 'double three');
    // A blocked line is not a three.
    const blocked = pos(
      [
        [5, 7],
        [6, 7],
        [7, 5],
        [7, 6],
      ],
      [
        [4, 7],
        [8, 7],
        [0, 4],
        [0, 6],
      ],
    );
    assert.ok(!isForbidden(blocked, at(7, 7)), 'one three is dead');
    // 四四.
    const ff = pos(
      [
        [4, 7],
        [5, 7],
        [6, 7],
        [7, 4],
        [7, 5],
        [7, 6],
      ],
      [
        [3, 7],
        [7, 3],
        [0, 0],
        [0, 2],
        [0, 4],
        [0, 6],
      ],
    );
    assert.ok(isForbidden(ff, at(7, 7)), 'double four');
    // 四三 allowed.
    const ft = pos(
      [
        [4, 7],
        [5, 7],
        [6, 7],
        [7, 5],
        [7, 6],
      ],
      [
        [3, 7],
        [0, 0],
        [0, 2],
        [0, 4],
        [0, 6],
      ],
    );
    assert.ok(!isForbidden(ft, at(7, 7)), 'four-three');
    // Exact five overrides forbidden shapes.
    const five = pos(
      [
        [3, 7],
        [4, 7],
        [5, 7],
        [6, 7],
        [7, 5],
        [7, 6],
      ],
      [
        [0, 0],
        [0, 2],
        [0, 4],
        [0, 6],
        [1, 1],
        [1, 3],
      ],
    );
    assert.equal(play(five, at(7, 7)).winner, BLACK);
  });
});

void describe('gomoku AI', () => {
  void it('has ten labelled levels', () => {
    assert.equal(Object.keys(GOMOKU_LEVELS).length, 10);
  });
  void it('takes a five and blocks an open four from level 2 up', () => {
    const win = pos(
      [
        [3, 7],
        [4, 7],
        [5, 7],
        [6, 7],
      ],
      [
        [3, 8],
        [4, 8],
        [5, 8],
        [9, 9],
      ],
      false,
    );
    assert.ok(
      [at(7, 7), at(2, 7)].includes(chooseGomokuMove(win, 3, () => 0.9).move),
    );
    const def = {
      ...pos(
        [
          [0, 0],
          [9, 9],
          [10, 10],
        ],
        [
          [3, 7],
          [4, 7],
          [5, 7],
          [6, 7],
        ],
        false,
      ),
    };
    assert.ok(
      [at(7, 7), at(2, 7)].includes(chooseGomokuMove(def, 5, () => 0.9).move),
    );
  });
  void it('never plays a forbidden point as black under renju', () => {
    const t = pos(
      [
        [5, 7],
        [6, 7],
        [7, 5],
        [7, 6],
      ],
      [
        [0, 0],
        [0, 2],
        [0, 4],
        [14, 14],
      ],
    );
    for (const lv of [5, 8] as const)
      assert.notEqual(chooseGomokuMove(t, lv).move, at(7, 7));
  });
  void it('stronger levels beat weaker ones', () => {
    let wins = 0;
    for (let g = 0; g < 4; g++) {
      let s = newGame();
      const strongBlack = g % 2 === 0;
      while (s.winner === null) {
        const strong = (s.toPlay === BLACK) === strongBlack;
        s = play(s, chooseGomokuMove(s, strong ? 7 : 2).move);
      }
      if ((s.winner === BLACK) === strongBlack) wins++;
    }
    assert.ok(wins >= 3, `level 7 won ${wins}/4 against level 2`);
  });
});

void describe('gomoku online', () => {
  const rng = () => 0.1;
  const start = (renju = false) => {
    const s = m.create(m.options({ renju, creator: 'black' }), rng, 0);
    return m.presence!(s, [true, true], 0);
  };
  const act = (s: GomokuOnlineState, seat: number, a: unknown) => {
    const r = m.act(s, seat, a, rng, 0);
    if ('error' in r) throw new Error(r.error);
    return r.state;
  };
  void it('enforces turns, wins, undo by consent, resign and rematch swap', () => {
    let s = start();
    assert.ok('error' in m.act(s, 1, { type: 'move', p: 0 }, rng, 0));
    s = act(s, 0, { type: 'move', p: at(7, 7) });
    s = act(s, 1, { type: 'move', p: at(0, 0) });
    s = act(s, 0, { type: 'undo-request' });
    assert.equal(s.undoFrom, 0);
    s = act(s, 1, { type: 'undo-answer', accept: true });
    assert.equal(
      s.game.moves.length,
      0,
      'black takes back own stone and the reply',
    );
    s = act(s, 0, { type: 'move', p: at(7, 7) });
    s = act(s, 1, { type: 'move', p: at(0, 0) });
    s = act(s, 1, { type: 'undo-request' });
    s = act(s, 0, { type: 'undo-answer', accept: false });
    assert.equal(s.undoFrom, null);
    assert.equal(s.game.moves.length, 2);
    for (let k = 1; k < 5; k++) {
      s = act(s, 0, { type: 'move', p: at(7 + k, 7) });
      if (k < 4) s = act(s, 1, { type: 'move', p: at(k, 0) });
    }
    assert.equal(s.game.winner, BLACK);
    assert.deepEqual(s.score, [1, 0]);
    s = act(s, 0, { type: 'rematch' });
    s = act(s, 1, { type: 'rematch' });
    assert.deepEqual(s.colors, [WHITE, BLACK]);
    s = act(s, 0, { type: 'resign' });
    assert.equal(s.game.winner, BLACK);
    assert.deepEqual(s.score, [1, 1]);
  });
  void it('applies renju server-side', () => {
    let s = start(true);
    const seq = [
      [at(5, 7), at(0, 0)],
      [at(6, 7), at(0, 2)],
      [at(7, 5), at(0, 4)],
      [at(7, 6), at(0, 6)],
    ];
    for (const [b, w] of seq) {
      s = act(s, 0, { type: 'move', p: b });
      s = act(s, 1, { type: 'move', p: w });
    }
    s = act(s, 0, { type: 'move', p: at(7, 7) });
    assert.equal(s.game.reason, 'forbidden');
    assert.equal(s.game.winner, WHITE);
  });
});

void describe('gomoku over the relay', () => {
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
  void it('two clients play to five, reconnect mid-game and rematch', async () => {
    const a = new PlayClient<GomokuOnlineView>({ url });
    a.create('gomoku', { creator: 'black' });
    await until(() => a.snapshot.code);
    const b = new PlayClient<GomokuOnlineView>({ url });
    b.join(a.snapshot.code!);
    await until(() => a.snapshot.view?.started && b.snapshot.view?.started);
    const n = () => a.snapshot.view!.moves.length;
    const move = async (c: PlayClient<GomokuOnlineView>, p: number) => {
      const before = n();
      c.act({ type: 'move', p });
      await until(() => n() === before + 1);
    };
    await move(a, at(7, 7));
    await move(b, at(0, 0));
    // B's socket drops; it rejoins its seat with the token by itself.
    (b as unknown as { ws: WebSocket }).ws.close();
    await until(() => b.snapshot.status !== 'open');
    await until(() => b.snapshot.status === 'open', 5000);
    assert.equal(b.snapshot.view?.moves.length, 2);
    assert.equal(b.snapshot.view!.you, WHITE);
    for (let k = 1; k < 5; k++) {
      await move(a, at(7 + k, 7));
      if (k < 4) await move(b, at(k, 0));
    }
    await until(() => b.snapshot.view?.winner === BLACK);
    assert.equal(b.snapshot.view!.line?.length, 5);
    a.act({ type: 'rematch' });
    b.act({ type: 'rematch' });
    await until(
      () =>
        a.snapshot.view?.you === WHITE && a.snapshot.view.moves.length === 0,
    );
    a.close();
    b.close();
  });
});
