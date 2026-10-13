import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ANTS,
  PRESETS,
  addAnt,
  createWorld,
  detectHighway,
  loadLangtonRecords,
  mergeLangtonRecord,
  parseRule,
  saveLangtonRecords,
  stepWorld,
  validateLangtonRecords,
  type Turn,
} from '../lib/games/langton.ts';

const rule = (t: string) => {
  const r = parseRule(t);
  assert.ok(r.ok, t);
  return r.rule as Turn[];
};

void test('规则解析：大小写、非法字符、长度、至少一次转向', () => {
  assert.deepEqual(rule('rl'), ['R', 'L']);
  assert.equal(parseRule('R').ok, false);
  assert.equal(parseRule('RXL').ok, false);
  assert.equal(parseRule('NN').ok, false);
  assert.equal(parseRule('R'.repeat(17)).ok, false);
  for (const p of PRESETS) assert.ok(parseRule(p.rule).ok, p.rule);
});

void test('第一步：白格右转、翻色、前进；环面边界', () => {
  const w = createWorld(5, 5, rule('RL'));
  addAnt(w, 0, 0, 0);
  stepWorld(w);
  assert.equal(w.cells[0], 1);
  assert.deepEqual(w.ants[0], { x: 1, y: 0, dir: 1 });
  const e = createWorld(4, 4, rule('RL'));
  addAnt(e, 3, 0, 0); // turns right, moves off the right edge
  stepWorld(e);
  assert.deepEqual(e.ants[0], { x: 0, y: 0, dir: 1 });
});

void test('经典 RL：约 1 万步后出现周期 104 的高速路，之前没有', () => {
  const w = createWorld(400, 400, rule('RL'));
  addAnt(w, 200, 200);
  stepWorld(w, 9000);
  assert.equal(detectHighway(w), null);
  stepWorld(w, 2000);
  const h = detectHighway(w);
  assert.ok(h);
  assert.equal(h.period, 104);
  assert.equal(Math.abs(h.dx), 2);
  assert.equal(Math.abs(h.dy), 2);
});

void test('同样的输入结果一致；RL 走 11000 步后留下大片黑格', () => {
  const run = () => {
    const w = createWorld(400, 400, rule('RL'));
    addAnt(w, 200, 200);
    addAnt(w, 150, 150, 2);
    stepWorld(w, 5000);
    return w.cells.reduce((a, b) => a + b, 0);
  };
  assert.equal(run(), run());
  const one = createWorld(400, 400, rule('RL'));
  addAnt(one, 200, 200);
  stepWorld(one, 11000);
  assert.equal(one.cells.reduce((a, b) => a + b, 0) > 700, true);
});

void test('LLRR 对称生长，RLR 在 2 万步内不出高速路', () => {
  const s = createWorld(200, 200, rule('RLR'));
  addAnt(s, 100, 100);
  stepWorld(s, 20000);
  assert.equal(detectHighway(s), null);
  const l = createWorld(101, 101, rule('LLRR'));
  addAnt(l, 50, 50);
  stepWorld(l, 4000);
  assert.ok(l.cells.some((c) => c === 3));
});

void test('最多 8 只蚂蚁；多状态取模', () => {
  const w = createWorld(10, 10, rule('RLLR'));
  for (let i = 0; i < 10; i++) addAnt(w, i, i);
  assert.equal(w.ants.length, MAX_ANTS);
  stepWorld(w, 500);
  assert.ok(Math.max(...w.cells) <= 3);
});

void test('本机记录：保留最长步数和最早高速路，拒绝坏数据', () => {
  let r = mergeLangtonRecord({ rules: {} }, 'RL', 5000);
  r = mergeLangtonRecord(r, 'RL', 12000, 10200);
  r = mergeLangtonRecord(r, 'RL', 3000, 10400);
  assert.deepEqual(r.rules.RL, { maxSteps: 12000, highway: 10200 });
  assert.equal(
    validateLangtonRecords({ rules: { XX: { maxSteps: 1 } } }),
    null,
  );
  assert.equal(
    validateLangtonRecords({ rules: { RL: { maxSteps: -1 } } }),
    null,
  );
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  assert.equal(saveLangtonRecords(r, st), 'saved');
  assert.deepEqual(loadLangtonRecords(st), r);
  mem.set('tscjj:langton:v1', '{bad');
  assert.deepEqual(loadLangtonRecords(st), { rules: {} });
});

void test('性能：256×256 上 100 万步不到 1 秒', () => {
  const w = createWorld(256, 256, rule('RL'));
  addAnt(w, 128, 128);
  const t = performance.now();
  stepWorld(w, 1_000_000);
  assert.ok(performance.now() - t < 1000);
});
