import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEVELS,
  boardKey,
  emptyRulewordsRecords,
  loadRulewordsRecords,
  mergeRulewordsRecord,
  parseBoard,
  readRules,
  replay,
  saveRulewordsRecords,
  start,
  step,
  validateRulewordsRecords,
} from '../lib/games/rulewords.ts';

void test('关卡数量与编号唯一', () => {
  assert.ok(LEVELS.length >= 10 && LEVELS.length <= 15);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
});

void test('每一关的记录解法回放后都恰好在最后一步获胜', () => {
  for (const l of LEVELS) {
    const r = replay(l.rows, l.solution);
    assert.ok(r.won, `${l.id} 回放未获胜`);
    assert.equal(r.at, l.solution.length, `${l.id} 提前获胜`);
  }
});

void test('关卡开局不会直接获胜或无“你”', () => {
  for (const l of LEVELS) {
    const b = start(l.rows);
    const r = readRules(b);
    assert.ok(
      [...r.props.values()].some((s) => s.has('you')),
      `${l.id} 没有你`,
    );
  }
});

void test('规则解析：横竖两向、名词变名词', () => {
  const b = parseBoard(['B=Y', '=..', 'V..']);
  const r = readRules(b);
  assert.ok(r.props.get('bot')?.has('you'));
  assert.ok(r.props.get('bot')?.has('win'));
  const t = start(['R=F', '.r.']);
  assert.ok(t.objs.some((o) => o.thing === 'flag'));
  assert.ok(!t.objs.some((o) => o.thing === 'rock'));
});

void test('推动链、挡、沉、烫', () => {
  // 推字块链：推到边缘则不动
  let o = step(parseBoard(['B=Y.', 'bP..']), 'R');
  assert.equal(o.moved, true);
  o = step(o.board, 'R');
  assert.equal(o.moved, true);
  o = step(o.board, 'R');
  assert.equal(o.moved, false);
  // 挡
  o = step(parseBoard(['B=Y', 'W=S', 'bw.']), 'R');
  assert.equal(o.moved, false);
  // 规则被拆掉后墙不再挡
  o = step(parseBoard(['B=Y', 'W=.', 'bw.']), 'R');
  assert.equal(o.moved, true);
  // 沉：石头和水同归于尽
  o = step(parseBoard(['B=Y.', 'R=P.', 'A=K.', 'bra.']), 'R');
  assert.ok(
    !o.board.objs.some((x) => x.thing === 'water' || x.thing === 'rock'),
  );
  // 烫：你走上去就没了
  o = step(parseBoard(['B=Y', 'L=H', 'bl.']), 'R');
  assert.ok(o.lost);
});

void test('状态键与撤销所需的不可变性', () => {
  const b = start(LEVELS[0].rows);
  const k = boardKey(b);
  step(b, 'R');
  assert.equal(boardKey(b), k);
});

void test('本机记录：取最少步数并拒绝坏数据', () => {
  let r = emptyRulewordsRecords();
  r = mergeRulewordsRecord(r, 'start', 9);
  r = mergeRulewordsRecord(r, 'start', 6);
  r = mergeRulewordsRecord(r, 'start', 12);
  assert.equal(r.best.start, 6);
  assert.equal(validateRulewordsRecords({ best: { a: -1, b: 3 } })?.best.b, 3);
  assert.equal(
    validateRulewordsRecords({ best: { a: -1 } })?.best.a,
    undefined,
  );
  assert.equal(validateRulewordsRecords('x'), null);
  const mem = new Map<string, string>();
  const s = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  saveRulewordsRecords(r, s);
  assert.equal(loadRulewordsRecords(s).best.start, 6);
});

void test('叠在挡路物上的可推动物不能在推动失败时偷偷移动', () => {
  const b = parseBoard(['B=Y..', 'R=P..', 'W=S..', 'brw..']);
  const wall = b.objs.find((o) => o.thing === 'wall')!;
  wall.x = 1; // A wall can become STOP again after another object overlaps it.
  const result = step(b, 'R');
  assert.equal(result.moved, false);
  assert.equal(boardKey(result.board), boardKey(b));
});
