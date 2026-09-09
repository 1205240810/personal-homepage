import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assetDailyCost, deliveryRoute } from '../lib/workbench-demos.ts';
import { WORKBENCH_PROJECTS } from '../lib/workbench-projects.ts';
import {
  PULSE_LEVELS,
  PULSE_MASKS,
  pressPulse,
  solvePulse,
} from '../lib/pulse-puzzle.ts';

test('工作台目录使用六个真实公开项目的稳定 ID', () => {
  const projects = JSON.parse(
    readFileSync(
      new URL('../content/data/projects.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(new Set(WORKBENCH_PROJECTS.map((p) => p.id)).size, 6);
  for (const item of WORKBENCH_PROJECTS) {
    const project = projects.find((p: { id: string }) => p.id === item.id);
    assert(project && project.url.startsWith('https://github.com/1205240810/'));
  }
});

test('成本公式包含首尾日期，跨闰日准确，拒绝无效日期与金额', () => {
  assert.deepEqual(assetDailyCost(3600, '2026-01-01', '2026-06-29'), {
    days: 180,
    daily: 20,
  });
  assert.deepEqual(assetDailyCost(100, '2024-02-28', '2024-03-01'), {
    days: 3,
    daily: 33.33,
  });
  assert.deepEqual(assetDailyCost(99.99, '2026-09-09', '2026-09-09'), {
    days: 1,
    daily: 99.99,
  });
  assert.equal(assetDailyCost(100, '2026-02-30', '2026-03-03'), null);
  assert.equal(assetDailyCost(100, '2026-09-09', '2026-09-08'), null);
  assert.equal(assetDailyCost(NaN, '2026-01-01', '2026-01-02'), null);
  assert.equal(assetDailyCost(-1, '2026-01-01', '2026-01-02'), null);
});

test('最短路选择较短的绕行路线，不被直观连线误导', () => {
  assert.deepEqual(deliveryRoute(3), { path: [0, 2, 4, 3], distance: 360 });
  assert.deepEqual(deliveryRoute(5), { path: [0, 2, 4, 5], distance: 490 });
  assert.deepEqual(deliveryRoute(0), { path: [0], distance: 0 });
  assert.equal(deliveryRoute(6), null);
});

test('灯阵边界无环绕，同一开关按两次还原，每关最短解有效', () => {
  assert.equal(PULSE_MASKS[0], 19);
  assert.equal(PULSE_MASKS[3], 140);
  const bits = (mask: number) => mask.toString(2).replaceAll('0', '').length;
  const apply = (board: number, solution: number, size = 4) => {
    for (let i = 0; i < size * size; i++)
      if (solution & (1 << i)) board = pressPulse(board, i, size);
    return board;
  };
  for (const level of PULSE_LEVELS) {
    const solution = solvePulse(level.board, level.size);
    assert.notEqual(solution, null);
    assert.equal(bits(solution!), level.par);
    assert.equal(apply(level.board, solution!, level.size), 0);
    for (let cell = 0; cell < level.size * level.size; cell++) {
      assert.equal(
        pressPulse(pressPulse(level.board, cell, level.size), cell, level.size),
        level.board,
      );
      const changed = pressPulse(level.board, cell, level.size);
      const hint = solvePulse(changed, level.size);
      assert.notEqual(hint, null);
      assert.equal(apply(changed, hint!, level.size), 0);
    }
  }
  assert.equal(solvePulse(0), 0);
  assert.equal(solvePulse(1), null);
  assert.equal(solvePulse(-1), null);
});

test('十二关保持渐进难度，五阶边界及输入范围正确', () => {
  assert.equal(PULSE_LEVELS.length, 12);
  assert.equal(new Set(PULSE_LEVELS.map((level) => level.id)).size, 12);
  assert.equal(
    new Set(PULSE_LEVELS.map((level) => `${level.size}:${level.board}`)).size,
    12,
  );
  assert.deepEqual(
    PULSE_LEVELS.map((level) => level.par),
    [1, 2, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9],
  );
  assert.deepEqual(
    PULSE_LEVELS.map((level) => level.size),
    [4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5],
  );
  assert.equal(pressPulse(0, 0, 5), 35);
  assert.equal(pressPulse(0, 4, 5), 536);
  assert.equal(solvePulse(0, 5), 0);
  assert.equal(solvePulse(1, 5), null);
  assert.equal(solvePulse(2 ** 25, 5), null);
  assert.equal(solvePulse(2 ** 16), null);
  assert.equal(solvePulse(0, 6), null);
  assert.equal(pressPulse(123, 25, 5), 123);
});
