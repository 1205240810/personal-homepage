// 军棋：棋盘连线、布阵校验、走法生成（公路 / 铁路 / 工兵拐弯）、交战裁决、
// 暗棋视图不泄露、AI 推理与合法性、联机模块与真实中继重连。
import assert from 'node:assert/strict';
import {
  BOMB,
  CAMP,
  CELLS,
  ENG,
  FLAG,
  HQ,
  JUN,
  LIAN,
  MINE,
  PAI,
  RED_SLOTS,
  SHI,
  SI,
  TUAN,
  YING,
  LV,
  at,
  checkLayout,
  deploy,
  isLegal,
  maskFor,
  movesFor,
  newGame,
  play,
  resign,
  resolve,
  slotsFor,
  targetsFrom,
  type JunqiState,
  type Kind,
  type Layout,
  type Piece,
  type Side,
} from '../lib/games/junqi.ts';
import {
  PRESETS,
  mirrorLayout,
  randomLayout,
} from '../lib/games/junqi-layouts.ts';
import {
  JUNQI_LEVELS,
  chooseJunqiMove,
  inferBelief,
  marginals,
  type JunqiLevel,
} from '../lib/games/junqi-ai.ts';
import {
  junqiOnline as m,
  type JunqiOnlineState,
  type JunqiOnlineView,
} from '../lib/multiplayer/junqi-online.ts';
import { PlayClient } from '../lib/multiplayer/client.ts';
import { RoomHub } from '../lib/multiplayer/hub.ts';
import { startPlayServer } from '../server/play/main.ts';

// 可复现的随机数。
function seeded(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sorted = (a: Iterable<number>) => [...a].sort((p, q) => p - q);

// ---- 棋盘 ----
assert.equal(RED_SLOTS.length, 25);
assert.equal(
  CAMP.reduce((a, b) => a + b, 0),
  10,
);
assert.equal(
  HQ.reduce((a, b) => a + b, 0),
  4,
);
assert.ok(HQ[at(1, 11)] && HQ[at(3, 11)] && HQ[at(1, 0)] && HQ[at(3, 0)]);
assert.deepEqual(
  slotsFor(1),
  RED_SLOTS.map((c) => CELLS - 1 - c),
);

/** 自定义局面：pieces = [格子, 方, 种类]。 */
function position(
  pieces: ([number, Side, Kind] | [number, Side, Kind, number])[],
  toPlay: Side = 0,
): JunqiState {
  const s = newGame();
  const board: (Piece | null)[] = Array(CELLS).fill(null);
  for (const [c, side, k, id] of pieces) board[c] = { s: side, k, id: id ?? c };
  return { ...s, board, phase: 'play', ready: [true, true], toPlay };
}

// ---- 布阵校验 ----
for (const p of PRESETS) {
  assert.deepEqual(checkLayout(p.layout).errors, [], p.name);
  assert.deepEqual(
    checkLayout(mirrorLayout(p.layout)).errors,
    [],
    `${p.name} 镜像`,
  );
}
const rng0 = seeded(1);
for (let n = 0; n < 300; n++)
  assert.deepEqual(checkLayout(randomLayout(rng0)).errors, []);
{
  const base = PRESETS[0].layout;
  const slotAt = (x: number, y: number) => RED_SLOTS.indexOf(at(x, y));
  const swap = (l: Layout, a: number, b: number) => {
    const n = l.slice();
    [n[a], n[b]] = [n[b], n[a]];
    return n;
  };
  const flagSlot = base.indexOf(FLAG);
  // 军旗离开大本营。
  let bad = swap(base, flagSlot, slotAt(0, 11));
  assert.ok(checkLayout(bad).errors.includes('军旗必须放在大本营'));
  assert.ok(checkLayout(bad).cells.includes(slotAt(0, 11)));
  // 地雷放到第 4 排。
  const mineSlot = base.indexOf(MINE);
  bad = swap(base, mineSlot, slotAt(0, 9));
  assert.ok(checkLayout(bad).errors.includes('地雷只能放在最后两排'));
  // 炸弹放到第一排。
  const bombSlot = base.indexOf(BOMB);
  bad = swap(base, bombSlot, slotAt(0, 6));
  assert.ok(checkLayout(bad).errors.includes('炸弹不能放在第一排'));
  // 数量不对。
  bad = base.slice();
  bad[base.indexOf(SI)] = JUN;
  assert.ok(checkLayout(bad).errors.some((e) => e.startsWith('司令应为 1 枚')));
  assert.deepEqual(checkLayout([1, 2, 3]).errors, ['布阵数据无效']);
  assert.throws(() => deploy(newGame(), 0, bad));
  // 布阵：双方都好了才开战，红方先走。
  let g = deploy(newGame(), 1, PRESETS[1].layout);
  assert.equal(g.phase, 'deploy');
  assert.throws(() => deploy(g, 1, PRESETS[1].layout), /已经布好/);
  g = deploy(g, 0, base);
  assert.equal(g.phase, 'play');
  assert.equal(g.toPlay, 0);
  for (let i = 0; i < CELLS; i++)
    if (CAMP[i]) assert.equal(g.board[i], null, '行营开局留空');
}

// ---- 走法：公路、行营斜线、山界、大本营、不能动的子 ----
{
  const s = position([
    [at(2, 9), 0, PAI], // 公路格（第 4 排中间）
    [at(1, 9), 0, LIAN], // 行营
    [at(0, 10), 0, MINE],
    [at(1, 11), 0, TUAN], // 大本营
    [at(3, 11), 0, FLAG],
    [at(2, 3), 1, YING], // 蓝方行营
    [at(1, 4), 1, PAI],
  ]);
  // (2,9) 是公路格：上下左右各一步，(1,9)/(3,9) 是行营。
  assert.deepEqual(
    sorted(targetsFrom(s.board, at(2, 9)).keys()),
    sorted([at(2, 8), at(2, 10), at(3, 9)]),
  );
  // 行营 (1,9) 有斜线：可到 (0,8)(2,8)(0,10 有己方地雷)(2,10)。
  const camp = targetsFrom(s.board, at(1, 9));
  assert.ok(camp.has(at(0, 8)) && camp.has(at(2, 8)) && camp.has(at(2, 10)));
  assert.ok(!camp.has(at(0, 10)));
  // 大本营里的子、地雷、军旗不能动。
  assert.equal(targetsFrom(s.board, at(1, 11)).size, 0);
  assert.equal(targetsFrom(s.board, at(0, 10)).size, 0);
  assert.equal(targetsFrom(s.board, at(3, 11)).size, 0);
  // 不能攻击行营里的子。
  const s2 = position([
    [at(2, 4), 0, SI],
    [at(2, 3), 1, PAI],
    [at(2, 5), 1, PAI],
  ]);
  const t2 = targetsFrom(s2.board, at(2, 4));
  assert.ok(!t2.has(at(2, 3)), '行营里的子不能被攻击');
  assert.ok(t2.has(at(2, 5)));
  // 山界：1、3 列不相通。
  const s3 = position([
    [at(1, 6), 0, PAI],
    [at(2, 6), 0, LIAN],
  ]);
  assert.ok(!targetsFrom(s3.board, at(1, 6)).has(at(1, 5)));
  assert.ok(targetsFrom(s3.board, at(2, 6)).has(at(2, 5)));
}

// ---- 铁路：直走不能拐弯，工兵可以拐弯，不能越子 ----
{
  const s = position([
    [at(4, 10), 0, SHI],
    [at(0, 10), 0, ENG],
    [at(2, 6), 1, PAI],
  ]);
  const shi = targetsFrom(s.board, at(4, 10));
  // 师长沿 y=10 往左直走到 (1,10)，被己方工兵挡住；沿 x=4 往上一直到 (4,1)。
  assert.ok(shi.has(at(1, 10)) && !shi.has(at(0, 10)));
  assert.ok(shi.has(at(4, 1)) && shi.has(at(4, 6)));
  // 不能在 (4,6) 拐弯到前排。
  assert.ok(!shi.has(at(3, 6)));
  // 工兵从 (0,10) 沿铁路拐弯：可到 (0,6) 再右拐到 (1,6)，并进攻 (2,6)。
  const eng = targetsFrom(s.board, at(0, 10));
  assert.ok(eng.has(at(1, 6)));
  assert.ok(eng.has(at(2, 6)), '工兵可以拐弯进攻铁路上的对方棋子');
  // (3,6) 只能绕对方底线铁路过去，不能越过 (2,6) 上的棋子。
  assert.ok(!eng.get(at(3, 6))!.includes(at(2, 6)), '不能越过棋子');
  assert.equal(eng.get(at(3, 6))!.length, 11);
  assert.deepEqual(eng.get(at(2, 6)), [
    at(0, 9),
    at(0, 8),
    at(0, 7),
    at(0, 6),
    at(1, 6),
    at(2, 6),
  ]);
  // 工兵可以经左路铁路过山界一直到对方底线铁路，再拐到 (2,1)。
  assert.ok(eng.has(at(2, 1)));
  // 己方师长挡住了 y=10 往右的铁路：(4,10) 不可达，(3,10) 可达。
  assert.ok(!eng.has(at(4, 10)) && eng.has(at(3, 10)));
  // 合法性只认生成器给出的路线。
  assert.ok(isLegal(s, { from: at(0, 10), to: at(2, 6) }));
  assert.ok(!isLegal(s, { from: at(4, 10), to: at(3, 6) }));
  assert.ok(!isLegal({ ...s, toPlay: 1 }, { from: at(4, 10), to: at(4, 9) }));
}

// ---- 交战裁决 ----
assert.equal(resolve(SI, JUN), 'win');
assert.equal(resolve(PAI, LIAN), 'lose');
assert.equal(resolve(TUAN, TUAN), 'both');
assert.equal(resolve(BOMB, SI), 'both');
assert.equal(resolve(ENG, BOMB), 'both');
assert.equal(resolve(ENG, MINE), 'win');
assert.equal(resolve(SI, MINE), 'lose');
assert.equal(resolve(BOMB, MINE), 'both');
assert.equal(resolve(PAI, FLAG), 'flag');
{
  // 撞雷：地雷留在原地，进攻方阵亡。
  let s = position([
    [at(2, 6), 0, SHI],
    [at(2, 5), 1, MINE],
    [at(0, 0), 1, ENG],
    [at(3, 11), 0, FLAG],
    [at(1, 0), 1, FLAG],
  ]);
  s = play(s, { from: at(2, 6), to: at(2, 5) });
  assert.equal(s.board[at(2, 6)], null);
  assert.equal(s.board[at(2, 5)]?.k, MINE);
  assert.equal(s.log.at(-1)?.outcome, 'lose');
  // 红方已无子可动：轮到蓝方，蓝方还能动，比赛继续；蓝方走完后红方无子可动判负。
  assert.equal(s.phase, 'play');
  s = play(s, { from: at(0, 0), to: at(0, 1) });
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 1);
  assert.equal(s.reason, 'stuck');
}
{
  // 工兵排雷，进入地雷格。
  let s = position([
    [at(4, 6), 0, ENG],
    [at(4, 5), 1, MINE],
    [at(0, 6), 0, PAI],
    [at(0, 0), 1, PAI],
  ]);
  s = play(s, { from: at(4, 6), to: at(4, 5) });
  assert.equal(s.board[at(4, 5)]?.k, ENG);
  assert.equal(s.log.at(-1)?.outcome, 'win');
}
{
  // 司令阵亡亮军旗；夺旗获胜。
  let s = position([
    [at(0, 6), 0, BOMB],
    [at(0, 5), 1, SI],
    [at(1, 1), 0, PAI],
    [at(1, 0), 1, FLAG],
    [at(3, 0), 1, MINE],
    [at(4, 5), 1, PAI],
    [at(3, 11), 0, FLAG],
  ]);
  s = play(s, { from: at(0, 6), to: at(0, 5) });
  assert.equal(s.log.at(-1)?.outcome, 'both');
  assert.deepEqual(s.flagShown, [false, true]);
  assert.deepEqual(s.log.at(-1)?.flags, [1]);
  const seen = maskFor(s, 0);
  assert.equal(seen.board[at(1, 0)]?.k, FLAG, '亮出的军旗双方可见');
  assert.equal(seen.board[at(3, 0)]?.k, -1, '其他暗子仍然看不到');
  s = play(s, { from: at(4, 5), to: at(4, 6) });
  s = play(s, { from: at(1, 1), to: at(1, 0) });
  assert.equal(s.phase, 'over');
  assert.equal(s.reason, 'flag');
  assert.equal(s.winner, 0);
  assert.throws(() => play(s, { from: at(1, 0), to: at(1, 1) }));
}
{
  // 认输。
  const s = deploy(
    deploy(newGame(), 0, PRESETS[0].layout),
    1,
    PRESETS[1].layout,
  );
  const r = resign(s, 0);
  assert.equal(r.winner, 1);
  assert.equal(r.reason, 'resign');
}

// ---- 暗棋视图不泄露对方阵型 ----
{
  const a = deploy(
    deploy(newGame(), 0, PRESETS[0].layout),
    1,
    PRESETS[1].layout,
  );
  const b = deploy(
    deploy(newGame(), 0, PRESETS[0].layout),
    1,
    PRESETS[2].layout,
  );
  assert.equal(
    JSON.stringify(maskFor(a, 0)),
    JSON.stringify(maskFor(b, 0)),
    '对方阵型不同，红方看到的视图必须完全一样',
  );
  assert.notEqual(
    JSON.stringify(maskFor(a, 0, true)),
    JSON.stringify(maskFor(b, 0, true)),
  );
  // 布阵阶段：对方布好阵后只显示 25 个背面。
  const half = deploy(newGame(), 1, PRESETS[1].layout);
  const hv = maskFor(half, 0).board.filter(Boolean);
  assert.equal(hv.length, 25);
  assert.ok(hv.every((p) => p!.k === -1));
  // 交战后的战报：对方棋子种类被抹掉，自己的看得到。
  let s = position([
    [at(0, 6), 0, PAI],
    [at(0, 5), 1, SHI],
    [at(4, 6), 0, LIAN],
    [at(4, 0), 1, LIAN],
  ]);
  s = play(s, { from: at(0, 6), to: at(0, 5) });
  const v0 = maskFor(s, 0);
  const v1 = maskFor(s, 1);
  assert.equal(v0.log[0].ak, PAI);
  assert.equal(v0.log[0].dk, -1);
  assert.equal(v1.log[0].ak, -1);
  assert.equal(v1.log[0].dk, SHI);
  assert.equal(v0.board[at(0, 5)]?.k, -1);
  // 终局全部亮出。
  const over = resign(s, 1);
  assert.equal(maskFor(over, 0).board[at(0, 5)]?.k, SHI);
}

// ---- AI 推理：只根据公开结果 ----
{
  let s = position(
    [
      [at(0, 6), 0, LIAN],
      [at(0, 5), 1, TUAN],
      [at(4, 6), 0, PAI],
      [at(4, 5), 1, PAI],
      [at(3, 11), 0, FLAG],
      [at(1, 0), 1, FLAG],
    ],
    0,
  );
  s = play(s, { from: at(0, 6), to: at(0, 5) }); // 连长撞团长：失利
  const b = inferBelief(maskFor(s, 0), 0);
  const mask = b.masks.get(at(0, 5))!;
  for (const k of [ENG, PAI, LIAN, FLAG, BOMB])
    assert.ok(!(mask & (1 << k)), `不可能是 ${k}`);
  for (const k of [YING, TUAN, LV, SHI, JUN, SI]) assert.ok(mask & (1 << k));
  // 蓝方工兵沿铁路拐弯后会被认出是工兵。
  const t = position(
    [
      [at(0, 1), 1, ENG],
      [at(4, 10), 0, PAI],
      [at(3, 11), 0, FLAG],
    ],
    1,
  );
  const eng = play(t, { from: at(0, 1), to: at(1, 5) });
  const b2 = inferBelief(maskFor(eng, 0), 0);
  assert.equal(b2.masks.get(at(0, 1)), 1 << ENG, '拐弯的一定是工兵');
  // 概率：抽样满足数量约束。
  const fresh = deploy(
    deploy(newGame(), 0, PRESETS[0].layout),
    1,
    PRESETS[1].layout,
  );
  const mg = marginals(inferBelief(maskFor(fresh, 0), 0), 300, seeded(3));
  // 对方前排不可能是炸弹 / 地雷 / 军旗。
  const front = mg.get(at(0, 5))!;
  assert.equal(front[BOMB] + front[MINE] + front[FLAG], 0);
  // 大本营里有一半机会是军旗。
  const hq = mg.get(at(1, 0))![FLAG] + mg.get(at(3, 0))![FLAG];
  assert.ok(Math.abs(hq - 1) < 1e-9);
}

// ---- AI：会护旗、会拿炸弹换大子、会用工兵排雷 ----
{
  // 对方一子贴到我方军旗旁：AI（红）必须吃掉它。
  const s = position(
    [
      [at(1, 11), 0, FLAG],
      [at(0, 11), 1, PAI, at(0, 5)], // 从对方前排一路摸到我方军旗旁的敌子
      [at(0, 10), 0, SHI],
      [at(3, 11), 0, MINE],
      [at(4, 6), 0, LIAN],
      [at(1, 0), 1, FLAG],
      [at(4, 0), 1, LIAN],
    ],
    0,
  );
  for (const level of [2, 3, 4, 5] as JunqiLevel[]) {
    const r = chooseJunqiMove(maskFor(s, 0), level, seeded(level));
    assert.deepEqual(
      r.move,
      { from: at(0, 10), to: at(0, 11) },
      `L${level} 护旗`,
    );
  }
}
{
  // 已暴露的大子：对方一子刚吃掉我方军长 ⇒ 只能是司令或炸弹（炸弹会同归于尽，所以是司令）。
  let s = position(
    [
      [at(0, 6), 0, JUN],
      [at(0, 5), 1, SI],
      [at(1, 6), 0, BOMB],
      [at(1, 11), 0, FLAG],
      [at(3, 11), 0, MINE],
      [at(4, 10), 0, PAI],
      [at(1, 0), 1, FLAG],
      [at(4, 0), 1, LIAN],
    ],
    1,
  );
  s = play(s, { from: at(0, 5), to: at(0, 6) }); // 蓝司令吃掉红军长
  const b = inferBelief(maskFor(s, 0), 0);
  assert.equal(b.masks.get(at(0, 5)), 1 << SI);
  const r = chooseJunqiMove(maskFor(s, 0), 4, seeded(5));
  assert.deepEqual(
    r.move,
    { from: at(1, 6), to: at(0, 6) },
    '炸弹去炸已暴露的司令',
  );
}
{
  // 对方一枚没动过的底排暗子曾炸死我方师长后自己留在原地 ⇒ 地雷；工兵去排。
  let s = position(
    [
      [at(4, 2), 0, SHI],
      [at(4, 1), 1, MINE],
      [at(0, 1), 0, ENG],
      [at(1, 11), 0, FLAG],
      [at(3, 11), 0, MINE],
      [at(3, 0), 1, FLAG],
      [at(1, 0), 1, MINE],
      [at(2, 0), 1, MINE],
      [at(0, 4), 1, PAI],
    ],
    0,
  );
  s = play(s, { from: at(4, 2), to: at(4, 1) });
  s = play(s, { from: at(0, 4), to: at(0, 3) });
  const r = chooseJunqiMove(maskFor(s, 0), 3, seeded(9));
  const p = s.board[r.move.from];
  assert.equal(p?.k, ENG, '工兵出动');
}

// ---- AI 对局：全程合法、不偷看（只拿到视图） ----
{
  const rng = seeded(42);
  for (const [a, b] of [
    [1, 2],
    [3, 4],
  ] as [JunqiLevel, JunqiLevel][]) {
    let s = deploy(
      deploy(newGame(), 0, randomLayout(rng)),
      1,
      randomLayout(rng),
    );
    for (let n = 0; n < 60 && s.phase === 'play'; n++) {
      const v = maskFor(s, s.toPlay);
      const r = chooseJunqiMove(v, s.toPlay ? b : a, rng);
      assert.ok(isLegal(s, r.move));
      assert.ok(
        movesFor(s.board, s.toPlay).some(
          (x) => x.from === r.move.from && x.to === r.move.to,
        ),
      );
      s = play(s, r.move);
    }
  }
  for (const l of Object.keys(JUNQI_LEVELS))
    assert.ok(JUNQI_LEVELS[Number(l) as JunqiLevel].note);
}

// ---- 联机模块 ----
const rng = seeded(7);
let o = m.presence!(
  m.create(m.options({ creator: 'first' }), rng, 0),
  [true, true],
  0,
);
type Loose = { state?: JunqiOnlineState; error?: string };
const act = (seat: number, a: Record<string, unknown>): Loose =>
  m.act(o, seat, { positionRevision: o.positionRevision, ...a }, rng, 0);
assert.throws(() => m.options({ creator: 'x' }));
assert.throws(() => m.options({ open: 'yes' }));
assert.ok(act(0, { type: 'move', move: { from: 0, to: 1 } }).error);
assert.ok(act(0, { type: 'deploy', layout: [1, 2] }).error);
const badLayout = PRESETS[0].layout.slice();
const flagAt = badLayout.indexOf(FLAG);
[badLayout[0], badLayout[flagAt]] = [FLAG, badLayout[0]];
assert.match(act(0, { type: 'deploy', layout: badLayout }).error!, /军旗/);
o = act(0, { type: 'deploy', layout: PRESETS[0].layout }).state!;
assert.ok(act(0, { type: 'deploy', layout: PRESETS[0].layout }).error);
{
  const v1 = m.view(o, 1, 0) as JunqiOnlineView;
  assert.ok(v1.game.board.every((p) => p === null || p.k === -1));
  assert.equal(v1.game.board.filter(Boolean).length, 25, '对方布好后显示背面');
}
o = (
  m.act(
    o,
    1,
    { type: 'deploy', layout: PRESETS[1].layout, positionRevision: -5 },
    rng,
    0,
  ) as Loose
).state!;
assert.equal(o.game.phase, 'play');
{
  const v0 = m.view(o, 0, 0) as JunqiOnlineView;
  const v1 = m.view(o, 1, 0) as JunqiOnlineView;
  assert.equal(v0.you, 0);
  assert.equal(v1.you, 1);
  assert.ok(v0.game.board.filter((p) => p?.s === 1).every((p) => p!.k === -1));
  assert.ok(v1.game.board.filter((p) => p?.s === 0).every((p) => p!.k === -1));
  assert.ok(v0.game.board.filter((p) => p?.s === 0).every((p) => p!.k >= 0));
  const spect = m.view(o, null, 0) as JunqiOnlineView;
  assert.ok(spect.game.board.every((p) => p === null || p.k === -1));
}
// 预设「稳守中路」：红方 (0,10) 是旅长，(4,10) 是工兵。旅长不能在铁路上拐弯。
assert.equal(o.game.board[at(0, 10)]?.k, LV);
assert.match(
  act(0, { type: 'move', move: { from: at(0, 10), to: at(1, 6) } }).error!,
  /不能走/,
);
assert.ok(
  act(1, { type: 'move', move: { from: at(0, 5), to: at(0, 4) } }).error,
  '还没轮到蓝方',
);
let r = act(0, { type: 'move', move: { from: at(0, 6), to: at(0, 5) } });
assert.ok(!r.error, r.error);
o = r.state!;
{
  const e0 = (m.view(o, 0, 0) as JunqiOnlineView).game.log[0];
  const e1 = (m.view(o, 1, 0) as JunqiOnlineView).game.log[0];
  assert.equal(e0.ak, LIAN);
  assert.equal(e0.dk, -1);
  assert.equal(e1.ak, -1);
  assert.ok(e1.dk !== -1);
}
assert.ok(
  act(1, {
    type: 'move',
    positionRevision: o.positionRevision - 1,
    move: { from: 0, to: 1 },
  }).error,
);
r = act(1, { type: 'resign' });
o = r.state!;
assert.equal(o.game.winner, 0);
assert.deepEqual(o.score, [1, 0]);
o = act(0, { type: 'rematch' }).state!;
assert.equal(o.game.phase, 'over');
o = act(1, { type: 'rematch' }).state!;
assert.deepEqual(o.sides, [1, 0]);
assert.equal(o.game.phase, 'deploy');

// ---- 真实中继：双方布阵、走子、断线重连回到原座位和局面 ----
const server = await startPlayServer({ port: 0, hub: new RoomHub([m]) });
const tokens = new Map<string, string>();
const clients: PlayClient<JunqiOnlineView>[] = [];
const client = () => {
  const c = new PlayClient<JunqiOnlineView>({
    url: `ws://127.0.0.1:${server.port}/play/ws`,
    game: 'junqi',
    tokens: {
      get: (code) => tokens.get(code) ?? null,
      set: (code, token) => {
        tokens.set(code, token);
      },
    },
  });
  clients.push(c);
  return c;
};
const until = async (predicate: () => unknown) => {
  const end = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < end, 'relay state timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
try {
  let host = client();
  host.create('junqi', { creator: 'first' });
  await until(() => host.snapshot.code);
  const code = host.snapshot.code!;
  const guest = new PlayClient<JunqiOnlineView>({
    url: `ws://127.0.0.1:${server.port}/play/ws`,
    game: 'junqi',
    tokens: { get: () => null, set: () => {} },
  });
  clients.push(guest);
  guest.join(code);
  await until(
    () => host.snapshot.view?.started && guest.snapshot.view?.started,
  );
  const send = async (
    actor: PlayClient<JunqiOnlineView>,
    action: Record<string, unknown>,
  ) => {
    const revision = Math.max(host.snapshot.version, guest.snapshot.version);
    actor.act({
      ...action,
      positionRevision: actor.snapshot.view!.positionRevision,
    });
    await until(
      () =>
        host.snapshot.version > revision && guest.snapshot.version > revision,
    );
    assert.equal(host.snapshot.error, null);
    assert.equal(guest.snapshot.error, null);
  };
  await send(host, { type: 'deploy', layout: PRESETS[0].layout });
  await send(guest, { type: 'deploy', layout: PRESETS[2].layout });
  assert.equal(host.snapshot.view!.game.phase, 'play');
  // 客户端收到的对方棋子都是背面。
  assert.ok(
    host.snapshot
      .view!.game.board.filter((p) => p?.s === 1)
      .every((p) => p!.k === -1),
  );
  assert.ok(
    guest.snapshot
      .view!.game.board.filter((p) => p?.s === 0)
      .every((p) => p!.k === -1),
  );
  await send(host, { type: 'move', move: { from: at(4, 6), to: at(4, 5) } });
  const board = JSON.stringify(host.snapshot.view!.game.board);
  host.close();
  await until(() => !guest.snapshot.seats[0]?.online);
  host = client();
  host.join(code);
  await until(() => host.snapshot.view && guest.snapshot.seats[0]?.online);
  assert.equal(host.snapshot.seat, 0);
  assert.equal(JSON.stringify(host.snapshot.view!.game.board), board);
} finally {
  for (const c of clients) c.close();
  await server.close();
}
console.log(
  'junqi: board, deployment, railways, combat, masking, AI and relay checks passed',
);
