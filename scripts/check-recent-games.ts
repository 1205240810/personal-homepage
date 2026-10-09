import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../lib/games/catalog.ts';
import {
  MAX_RECENT,
  RECENT_GAMES_KEY,
  markRecent,
  parseRecent,
  pushRecent,
  relativeDay,
  validateRecent,
} from '../lib/games/recent.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

void test('最近玩过：最新在前、去重、最多四个', () => {
  let list = pushRecent([], 'sudoku', 1);
  list = pushRecent(list, 'stud', 2);
  list = pushRecent(list, 'sudoku', 3);
  assert.deepEqual(
    list.map((x) => x.id),
    ['sudoku', 'stud'],
  );
  for (const [i, game] of GAMES.entries())
    list = pushRecent(list, game.id, 10 + i);
  assert.equal(list.length, MAX_RECENT);
  assert.deepEqual(
    list.map((x) => x.id),
    GAMES.slice(-MAX_RECENT)
      .map((g) => g.id)
      .reverse(),
  );
});

void test('不可信存档：未知游戏、重复、坏时间被丢弃，坏 JSON 返回空', () => {
  assert.deepEqual(
    validateRecent([
      { id: 'sudoku', at: 5 },
      { id: 'sudoku', at: 9 },
      { id: '__proto__', at: 7 },
      { id: 'stud', at: -1 },
      { id: 'yahtzee', at: 1.5 },
      'x',
      null,
      { id: 'blackjack', at: 8 },
    ]),
    [
      { id: 'blackjack', at: 8 },
      { id: 'sudoku', at: 5 },
    ],
  );
  assert.deepEqual(validateRecent({ id: 'sudoku' }), []);
  assert.deepEqual(parseRecent('{'), []);
  assert.deepEqual(parseRecent(null), []);
});

void test('记录访问写入本地存储，存储不可用时不抛错', () => {
  const store = memoryStorage();
  markRecent('mech-sweeper', 100, store);
  markRecent('circuit-repair', 200, store);
  assert.deepEqual(parseRecent(store.values.get(RECENT_GAMES_KEY)!), [
    { id: 'circuit-repair', at: 200 },
    { id: 'mech-sweeper', at: 100 },
  ]);
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(markRecent('sudoku', 1, blocked), null);
});

void test('相对日期按本地日历日计算', () => {
  const now = new Date(2026, 9, 9, 0, 30).getTime();
  assert.equal(relativeDay(new Date(2026, 9, 9, 0, 1).getTime(), now), '今天');
  assert.equal(
    relativeDay(new Date(2026, 9, 8, 23, 59).getTime(), now),
    '昨天',
  );
  assert.equal(relativeDay(new Date(2026, 9, 1, 12).getTime(), now), '8 天前');
  assert.equal(
    relativeDay(now + 86_400_000, now),
    '今天',
    '未来时间按今天显示',
  );
});

void test('今日挑战只列出带每日题的游戏', () => {
  const daily = GAMES.filter((g) => g.daily).map((g) => g.id);
  assert.deepEqual(daily, [
    'signal-pulse',
    'circuit-repair',
    'mech-sweeper',
    'fault-finder',
  ]);
});
