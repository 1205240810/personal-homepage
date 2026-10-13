import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEVELS,
  blocked,
  emptyTimeloopRecords,
  loadTimeloopRecords,
  mergeTimeloopRecord,
  parseMap,
  pressed,
  reachableAlone,
  replaySolution,
  saveTimeloopRecords,
  simulate,
  validateTimeloopRecords,
} from '../lib/games/timeloop.ts';

void test('关卡：10 关左右，编号唯一，地图里有起点和出口', () => {
  assert.ok(LEVELS.length >= 8 && LEVELS.length <= 15);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
  for (const l of LEVELS) {
    assert.ok(
      l.rows.join('').includes('S') && l.rows.join('').includes('E'),
      l.id,
    );
  }
});

void test('每关参考解回放到达出口，且不超出每轮步数和轮数上限', () => {
  for (const l of LEVELS) {
    assert.ok(replaySolution(l).won, `${l.id} 回放未到达出口`);
    assert.ok(l.solution.length <= l.maxLoops, `${l.id} 轮数超限`);
    for (const s of l.solution)
      assert.ok(s.length <= l.loopLen, `${l.id} 单轮超长`);
  }
});

void test('每关都必须借助过去的自己：单独一轮到不了出口', () => {
  for (const l of LEVELS) assert.equal(reachableAlone(l), null, l.id);
});

void test('多于两轮的关卡：去掉第一个过去的自己后最后一轮到不了出口', () => {
  for (const l of LEVELS.filter((x) => x.solution.length > 2))
    assert.equal(reachableAlone(l, l.solution.slice(1, -1)), null, l.id);
});

void test('门与反向门', () => {
  const m = parseMap(['SaAX']);
  assert.equal(blocked(m, new Set(), 2, 0), true);
  assert.equal(blocked(m, new Set(['a']), 2, 0), false);
  assert.equal(blocked(m, new Set(['a']), 3, 0), true);
  assert.equal(blocked(m, new Set(), 3, 0), false);
  assert.deepEqual([...pressed(m, [{ x: 1, y: 0 }])], ['a']);
});

void test('过去的自己按录像重演，被门挡住时记为卡住', () => {
  const m = parseMap(['S.A.', '.a.E']);
  const s = simulate(m, ['RR'], 'WW');
  assert.deepEqual(s.past[0], { x: 1, y: 0 });
  assert.deepEqual(s.stuck, [0]);
  const t = simulate(m, ['D', 'RR'], 'WW');
  assert.deepEqual(t.past[0], { x: 0, y: 1 });
  assert.deepEqual(t.stuck, [1]);
});

void test('本机记录：先比轮数再比步数', () => {
  let r = emptyTimeloopRecords();
  r = mergeTimeloopRecord(r, 'door', 3, 20);
  r = mergeTimeloopRecord(r, 'door', 2, 30);
  r = mergeTimeloopRecord(r, 'door', 2, 40);
  r = mergeTimeloopRecord(r, 'door', 2, 25);
  assert.deepEqual(r.best.door, { loops: 2, moves: 25 });
  assert.equal(
    validateTimeloopRecords({ best: { x: { loops: 0, moves: 3 } } })?.best.x,
    undefined,
  );
  assert.equal(validateTimeloopRecords(null), null);
  const mem = new Map<string, string>();
  const s = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveTimeloopRecords(r, s);
  assert.deepEqual(loadTimeloopRecords(s).best.door, { loops: 2, moves: 25 });
});

void test('同一拍开门的录像在下一轮仍能重演', () => {
  const m = parseMap(['S.AE', '.a..']);
  const recorded = simulate(m, ['DR'], 'RR');
  assert.deepEqual(recorded.me, { x: 2, y: 0 });
  const replayed = simulate(m, ['DR', 'RR'], 'WW');
  assert.deepEqual(replayed.past[1], recorded.me);
  assert.deepEqual(replayed.stuck, []);
});
