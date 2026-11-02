// 每个目录里的游戏都要有完整的「规则与玩法」；有联机版的还要有联机规则。
import assert from 'node:assert/strict';
import { GAMES } from '../lib/games/catalog.ts';
import { GAME_RULES, type RulesSection } from '../lib/games/rules.ts';

function checkSection(id: string, s: RulesSection | undefined) {
  assert.ok(s, `${id}: 缺少规则`);
  assert.ok(s.goal.trim().length >= 4, `${id}: 目标太短`);
  for (const key of ['play', 'rules', 'scoring', 'tips'] as const) {
    assert.ok(s[key].length > 0, `${id}: ${key} 为空`);
    for (const line of s[key]) assert.ok(line.trim(), `${id}: ${key} 有空行`);
  }
  for (const [k, v] of s.keys ?? []) assert.ok(k && v, `${id}: 快捷键不完整`);
}

const ids = new Set<string>(GAMES.map((g) => g.id));
for (const game of GAMES) {
  checkSection(game.id, GAME_RULES[game.id]);
  if (game.online)
    checkSection(`${game.id}/online`, GAME_RULES[game.id].online);
}
for (const id of Object.keys(GAME_RULES))
  assert.ok(ids.has(id), `规则里有目录中不存在的游戏：${id}`);
console.log(`rules: ${GAMES.length} games covered`);
