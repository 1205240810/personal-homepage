import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGES,
  CHALLENGE_BOARD,
  LIFE_RECORDS_KEY,
  PATTERNS,
  boardFromRows,
  challengeZone,
  createBoard,
  dailyChallenge,
  emptyLifeRecords,
  evaluateChallenge,
  getPattern,
  liveBounds,
  loadLifeRecords,
  mergeLifeRecord,
  oscillatorPeriod,
  patternCells,
  patternSize,
  population,
  setCell,
  spaceshipPeriod,
  stamp,
  step,
  validateLifeRecords,
  type Challenge,
} from '../lib/games/life.ts';

const run = (b: ReturnType<typeof createBoard>, n: number, wrap = false) => {
  for (let i = 0; i < n; i++) b = step(b, wrap);
  return b;
};

void test('B3/S23：闪烁灯翻转，方块不变，孤立细胞死亡', () => {
  const b = boardFromRows(['OOO'], 5, 5, 1, 2);
  const next = step(b, false);
  assert.deepEqual(
    [...next.cells].flatMap((v, i) => (v ? [i] : [])),
    [7, 12, 17],
  );
  assert.equal(oscillatorPeriod(b, false, 4), 2);
  assert.equal(
    oscillatorPeriod(boardFromRows(['OO', 'OO'], 6, 6, 2, 2), false, 3),
    1,
  );
  const lone = createBoard(5, 5);
  setCell(lone, 2, 2, true);
  assert.equal(population(step(lone, false)), 0);
});

void test('环面开关：滑翔机穿过边界后从对边回来，不环绕时撞墙变形', () => {
  const glider = getPattern('glider').rows;
  const torus = boardFromRows(glider, 8, 8, 0, 0);
  // 32 generations move it 8 cells diagonally: exactly once around an 8 × 8 torus.
  assert.deepEqual(run(torus, 32, true).cells, torus.cells);
  const walled = boardFromRows(glider, 8, 8, 0, 0);
  assert.notDeepEqual(run(walled, 32, false).cells, walled.cells);
});

void test('写入缓冲区复用：step 可以 ping-pong，不改动输入', () => {
  const b = boardFromRows(getPattern('r-pentomino').rows, 20, 20, 8, 8);
  const before = b.cells.slice();
  const out = new Uint8Array(400);
  const next = step(b, false, out);
  assert.equal(next.cells, out);
  assert.deepEqual(b.cells, before);
});

void test('图案库：周期、飞船与长寿种子都符合说明', () => {
  const big = (id: Parameters<typeof getPattern>[0], w = 60, h = 60) => {
    const p = getPattern(id);
    const size = patternSize(p.rows);
    return boardFromRows(
      p.rows,
      w,
      h,
      Math.floor((w - size.width) / 2),
      Math.floor((h - size.height) / 2),
    );
  };
  assert.equal(oscillatorPeriod(big('pulsar'), false, 5), 3);
  assert.equal(oscillatorPeriod(big('pentadecathlon'), false, 20), 15);
  assert.equal(oscillatorPeriod(big('toad'), false, 4), 2);
  assert.equal(oscillatorPeriod(big('beacon'), false, 4), 2);
  assert.equal(oscillatorPeriod(big('beehive'), false, 2), 1);
  assert.equal(spaceshipPeriod(big('glider'), false, 4), 4);
  assert.equal(spaceshipPeriod(big('lwss'), false, 4), 4);
  assert.equal(population(run(big('diehard', 80, 80), 130)), 0);
  assert.ok(population(run(big('r-pentomino', 120, 120), 200)) > 0);
  // Gosper gun: one glider per 30 generations (gun is 36 cells, glider 5).
  const gun = boardFromRows(getPattern('gosper-gun').rows, 80, 60, 2, 2);
  assert.equal(population(gun), 36);
  assert.equal(
    oscillatorPeriod(gun, false, 31),
    null,
    '会持续射出滑翔机，不是振荡器',
  );
  const after = run(gun, 120);
  assert.ok(
    population(after) >= 36 + 3 * 5,
    `120 代后至少有三架滑翔机：${population(after)}`,
  );
  for (const p of PATTERNS) assert.ok(patternCells(p.rows).length > 0, p.id);
});

void test('旋转：四次回到原样，尺寸互换，形状仍是同一种', () => {
  for (const p of PATTERNS) {
    const key = (cells: [number, number][]) =>
      cells.map(String).sort().join(' ');
    assert.equal(
      key(patternCells(p.rows, 4)),
      key(patternCells(p.rows, 0)),
      p.id,
    );
    const s0 = patternSize(p.rows, 0),
      s1 = patternSize(p.rows, 1);
    assert.deepEqual([s1.width, s1.height], [s0.height, s0.width]);
    for (const [x, y] of patternCells(p.rows, 1))
      assert.ok(x >= 0 && y >= 0 && x < s1.width && y < s1.height, p.id);
  }
  const b = createBoard(30, 30);
  stamp(b, getPattern('glider').rows, 10, 10, 1);
  assert.equal(spaceshipPeriod(b, false, 4), 4, '旋转后的滑翔机仍然会飞');
});

void test('盖章越界：环面时绕回，否则丢弃', () => {
  const b = createBoard(10, 10);
  stamp(b, ['OOO'], 8, 0, 0, true);
  assert.equal(population(b), 3);
  assert.equal(b.cells[0], 1);
  const c = createBoard(10, 10);
  stamp(c, ['OOO'], 8, 0, 0, false);
  assert.equal(population(c), 2);
});

const known: Record<string, [string, string[]]> = {
  'long-fuse': ['r-pentomino', getPattern('r-pentomino').rows],
  boom: ['r-pentomino', getPattern('r-pentomino').rows],
  'period-3': ['pulsar', getPattern('pulsar').rows],
  'still-10': ['beehive + block', ['.OO.....', 'O..O..OO', '.OO...OO']],
  ship: ['glider', getPattern('glider').rows],
};
const seedFor = (c: Challenge, rows: string[]) => {
  const z = challengeZone(c);
  return boardFromRows(
    rows,
    CHALLENGE_BOARD.width,
    CHALLENGE_BOARD.height,
    z.x,
    z.y,
  );
};

void test('每个挑战都有已知解法，常见错误会给出原因', () => {
  for (const c of CHALLENGES) {
    const [, rows] = known[c.id];
    assert.ok(rows, c.id);
    const result = evaluateChallenge(c, seedFor(c, rows));
    assert.ok(result.ok, `${c.id}: ${JSON.stringify(result)}`);
  }
  const fuse = CHALLENGES[0];
  const empty = createBoard(CHALLENGE_BOARD.width, CHALLENGE_BOARD.height);
  assert.equal(evaluateChallenge(fuse, empty).ok, false);
  const outside = createBoard(CHALLENGE_BOARD.width, CHALLENGE_BOARD.height);
  setCell(outside, 0, 0, true);
  assert.match(
    (evaluateChallenge(fuse, outside) as { reason: string }).reason,
    /建造区外/,
  );
  const blinker = seedFor(fuse, ['OOO']);
  assert.equal(
    evaluateChallenge(getChallenge3(), blinker).ok,
    false,
    '闪烁灯是周期 2',
  );
  const over = seedFor(fuse, ['OOO', 'OOO']);
  assert.match(
    (evaluateChallenge(fuse, over) as { reason: string }).reason,
    /超出上限/,
  );
  const block = seedFor(CHALLENGES[3], ['OO', 'OO']);
  assert.match(
    (evaluateChallenge(CHALLENGES[3], block) as { reason: string }).reason,
    /至少/,
  );
});
function getChallenge3() {
  return CHALLENGES.find((c) => c.id === 'period-3')!;
}

void test('今日挑战：同一天同一题，一年 366 天都能用 R 五格完成', () => {
  const a = dailyChallenge({ year: 2026, month: 10, day: 13 });
  assert.deepEqual(a, dailyChallenge({ year: 2026, month: 10, day: 13 }));
  const seen = new Set<string>();
  for (let d = 0; d < 366; d++) {
    const date = new Date(Date.UTC(2028, 0, 1 + d));
    const c = dailyChallenge({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
    seen.add(c.brief);
    assert.ok(c.budget >= 5 && c.zone.width >= 3);
    const result = evaluateChallenge(
      c,
      seedFor(c, getPattern('r-pentomino').rows),
    );
    assert.ok(result.ok, `${c.id}: ${JSON.stringify(result)}`);
  }
  assert.ok(seen.size > 20, '题目要有变化');
});

void test('本机记录：保留最少格数，记下今日完成，拒绝坏数据', () => {
  let r = emptyLifeRecords();
  r = mergeLifeRecord(r, 'long-fuse', 5);
  r = mergeLifeRecord(r, 'long-fuse', 7);
  r = mergeLifeRecord(r, 'daily-2026-10-13', 5);
  r = mergeLifeRecord(r, 'daily-2026-10-13', 4);
  r = mergeLifeRecord(r, 'nope', 1);
  assert.deepEqual(r, { best: { 'long-fuse': 5 }, daily: ['2026-10-13'] });
  assert.deepEqual(validateLifeRecords(JSON.parse(JSON.stringify(r))), r);
  assert.equal(
    validateLifeRecords({ best: { 'long-fuse': -1 }, daily: [] }),
    null,
  );
  assert.equal(validateLifeRecords({ best: {}, daily: ['x'] }), null);
  const memory = new Map([[LIFE_RECORDS_KEY, '{oops']]);
  assert.deepEqual(
    loadLifeRecords({ getItem: (k) => memory.get(k) ?? null }),
    emptyLifeRecords(),
  );
  assert.deepEqual(
    loadLifeRecords({
      getItem: () => {
        throw new Error('denied');
      },
    }),
    emptyLifeRecords(),
  );
});

void test('性能：256 × 256 环面跑 50 代不超过 1 秒', () => {
  const b = createBoard(256, 256);
  for (let i = 0; i < b.cells.length; i++)
    b.cells[i] = (i * 2654435761) % 7 < 2 ? 1 : 0;
  const t = performance.now();
  run(b, 50, true);
  assert.ok(performance.now() - t < 1000);
  assert.ok(liveBounds(createBoard(4, 4)) === null);
});
