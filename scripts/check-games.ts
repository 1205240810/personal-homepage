import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GAMES } from '../lib/games/catalog.ts';
import { SCENES } from '../lib/world/registry.ts';

void test('游戏目录的稳定 ID、唯一地址与实际页面匹配', () => {
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
  assert.equal(new Set(GAMES.map((g) => g.href)).size, GAMES.length);
  for (const game of GAMES) {
    assert.match(game.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(game.href, `/games/${game.id}`);
    assert(
      existsSync(new URL(`../app${game.href}/page.tsx`, import.meta.url)),
      `${game.id} 没有页面`,
    );
  }
});

void test('机甲真实游戏厅节点绑定同一游戏室，返回入口保留探索位置', () => {
  const terminals = SCENES.flatMap((s) =>
    s.nodes.filter((n) => n.action.type === 'open-arcade'),
  );
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].id, 'arcade-terminal');
  const shell = readFileSync(
    new URL('../components/world/world-shell.tsx', import.meta.url),
    'utf8',
  );
  assert(shell.includes('/games?from=explore'));
  const room = readFileSync(
    new URL('../components/games/game-room.tsx', import.meta.url),
    'utf8',
  );
  assert(!room.includes('/explore?scene='), '游戏室回程不能重置机甲出生点');
});

void test('独立游戏的宿主只同步运行源码，不带第二份 React 或独立挂载入口', () => {
  for (const [id, component] of [
    ['sudoku', 'SudokuGame'],
    ['yahtzee', 'YahtzeeGame'],
    ['stud', 'StudGame'],
  ]) {
    const runtime = readFileSync(
      new URL(
        `../components/games/${id}/generated/${component}.tsx`,
        import.meta.url,
      ),
      'utf8',
    );
    assert(runtime.includes(`export function ${component}`));
    assert(!runtime.includes('createRoot('));
    assert(
      !existsSync(
        new URL(
          `../components/games/${id}/generated/main.tsx`,
          import.meta.url,
        ),
      ),
    );
    assert(
      !existsSync(
        new URL(
          `../components/games/${id}/generated/package.json`,
          import.meta.url,
        ),
      ),
    );
    assert(
      !existsSync(
        new URL(
          `../components/games/${id}/generated/node_modules`,
          import.meta.url,
        ),
      ),
    );
  }
});
