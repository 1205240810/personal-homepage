import { describe, expect, it } from 'vitest';
import {
  act,
  advance,
  analyzeDecision,
  decide,
  PERSONALITIES,
  type Personality,
  initial,
  limits,
  startHand,
  view,
  type Game,
  type View,
} from './engine';
import { candidateActions, legalDecision, opponentRange } from './strategy';
const c = (r: number, s = 0) => s * 13 + r - 2;
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const opening = (): View => ({
  seat: 0,
  street: 1,
  own: [c(13), c(7, 1)],
  exposed: [c(14)],
  pot: 110,
  stack: 495,
  opponentStack: 395,
  paid: 0,
  otherPaid: 100,
  minRaise: 100,
});
const aggressive = (): View => ({
  ...opening(),
  history: [
    {
      actor: 'opponent',
      street: 1,
      action: { type: 'raise', to: 100 },
      paid: 100,
      potBefore: 10,
      call: 0,
      ownExposed: [c(7, 1)],
      opponentExposed: [c(14)],
    },
  ],
});
describe('public action range and information firewall', () => {
  it('uses soft card-removal-aware likelihoods, not a uniform range or certain strong hand', () => {
    const baseline = opponentRange(opening()),
      changed = opponentRange(aggressive());
    expect(baseline.every((r) => r.weight === 1)).toBe(true);
    const aceSupport = (range: typeof baseline) =>
      range
        .filter((r) => r.card % 13 === 12)
        .reduce((sum, r) => sum + r.weight, 0) /
      range.reduce((sum, r) => sum + r.weight, 0);
    expect(aceSupport(changed)).toBeGreaterThan(aceSupport(baseline) * 1.5);
    expect(changed.every((r) => r.weight > 0)).toBe(true);
    expect(changed.some((r) => r.card === c(2, 2))).toBe(true);
    expect(
      changed.some(
        (r) =>
          opening().own.includes(r.card) || opening().exposed.includes(r.card),
      ),
    ).toBe(false);
    expect(
      analyzeDecision(aggressive(), { type: 'call' }, 'normal', seeded(123))
        .equity,
    ).toBeLessThan(
      analyzeDecision(opening(), { type: 'call' }, 'normal', seeded(123))
        .equity,
    );
  });
  it('never infers ranges from an opponent private review, hole or actual deck', () => {
    let g = startHand(initial(), seeded(19));
    g = act(g, g.turn, { type: 'raise', to: 20 });
    const changed = structuredClone(g);
    const seat = g.turn,
      other = (1 - seat) as 0 | 1;
    [changed.cards[other][0], changed.deck[0]] = [
      changed.deck[0],
      changed.cards[other][0],
    ];
    changed.deck.reverse();
    changed.reviews = [
      {
        seat: other,
        street: g.street,
        action: '隐藏策略',
        equity: 1,
        odds: 0,
        reason: '不可用于推断的私有诊断',
      },
    ];
    expect(view(changed, seat)).toEqual(view(g, seat));
    expect(decide(view(changed, seat), 'normal', seeded(71))).toEqual(
      decide(view(g, seat), 'normal', seeded(71)),
    );
    const observed = view(g, seat);
    observed.history![0].opponentExposed[0] = 51;
    expect(view(g, seat)).not.toEqual(observed);
    expect(Object.keys(g.history![0]).sort()).toEqual([
      'action',
      'call',
      'exposed',
      'paid',
      'potBefore',
      'seat',
      'street',
    ]);
  });
  it('stores a decision-time snapshot that future draws, reveals and diagnostics cannot rewrite', () => {
    let g = startHand(initial(), seeded(4));
    const before = view(g, g.turn),
      review = analyzeDecision(before, { type: 'check' }, 'normal', seeded(22));
    g = act(g, g.turn, { type: 'check' }, g.revision, review);
    g = act(g, g.turn, { type: 'check' });
    g = advance(g, g.revision);
    review.advice!.snapshot.own[0] = 51;
    expect(g.reviews[0].advice!.snapshot.own).toEqual(before.own);
    expect(g.reviews[0].advice!.snapshot.exposed).toHaveLength(1);
    expect(g.cards[0]).toHaveLength(3);
  });
});
describe('legal incremental EV training advice', () => {
  it('uses sunk pot and new payments consistently for calls and raises', () => {
    const v: View = {
      seat: 0,
      street: 4,
      own: [c(10, 3), c(11, 3), c(12, 3), c(13, 3), c(14, 3)],
      exposed: [c(8), c(8, 1), c(8, 2), c(8, 3)],
      pot: 60,
      stack: 485,
      opponentStack: 455,
      paid: 10,
      otherPaid: 40,
      minRaise: 30,
    };
    // A royal flush wins against every legal downcard; response roll zero always calls.
    const review = analyzeDecision(
      v,
      { type: 'raise', to: 100 },
      'normal',
      () => 0,
    );
    expect(review.equity).toBe(1);
    expect(review.advice!.actualEV).toBe(120); // existing 60 + villain's new 60
    expect(
      review.advice!.alternatives.find((a) => a.label === '跟注 30')?.ev,
    ).toBe(60);
    expect(
      review.advice!.alternatives.find((a) => a.label === '弃牌')?.ev,
    ).toBe(0);
    expect(
      review.advice!.alternatives.find((a) => a.label === '下注至 100')?.paid,
    ).toBe(90);
    expect(review.advice!.potAfterCall).toBe(90);
    for (const mode of ['easy', 'normal'] as const)
      expect(decide(v, mode, seeded(86)).action.type).not.toBe('fold');
  });
  it('folds a guaranteed loser facing a large wager in both modes, checks it for free', () => {
    const v: View = {
      seat: 0,
      street: 4,
      own: [c(2), c(7, 1), c(9, 2), c(11, 3), c(3, 1)],
      exposed: [c(14), c(14, 1), c(13, 2), c(13, 3)],
      pot: 210,
      stack: 495,
      opponentStack: 295,
      paid: 0,
      otherPaid: 200,
      minRaise: 200,
    };
    for (const mode of ['easy', 'normal'] as const)
      expect(decide(v, mode, seeded(44)).action).toEqual({ type: 'fold' });
    const free = {
      ...v,
      pot: 10,
      stack: 495,
      opponentStack: 495,
      otherPaid: 0,
      minRaise: 10,
    };
    const review = analyzeDecision(
      free,
      { type: 'fold' },
      'normal',
      seeded(44),
    );
    expect(review.advice!.recommended).toBe('过牌');
    expect(decide(free, 'normal', seeded(44)).action).toEqual({
      type: 'check',
    });
  });
  it('includes custom legal sizes and effective short all-ins without illegal raises', () => {
    const v = opening();
    const actions = candidateActions(v, { type: 'raise', to: 275 });
    expect(actions.every((a) => legalDecision(v, a))).toBe(true);
    expect(actions).toContainEqual({ type: 'raise', to: 275 });
    expect(
      analyzeDecision(
        v,
        { type: 'raise', to: 275 },
        'normal',
        seeded(3),
      ).advice!.alternatives.some((a) => a.label === '下注至 275'),
    ).toBe(true);
    const short: View = {
      ...v,
      pot: 10,
      stack: 3,
      opponentStack: 987,
      otherPaid: 0,
      minRaise: 10,
    };
    expect(candidateActions(short)).toContainEqual({ type: 'raise', to: 3 });
    expect(candidateActions(short).every((a) => legalDecision(short, a))).toBe(
      true,
    );
    expect(() => analyzeDecision(v, { type: 'check' })).toThrow('合法行动');
  });
  it('keeps deep early shoves visible but does not treat their unsearched tree as the default policy', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = startHand(initial(), seeded(seed));
      const v = view(g, g.turn),
        d = decide(v, 'normal', seeded(seed + 500));
      expect(legalDecision(v, d.action)).toBe(true);
      expect(d.action.type).not.toBe('fold');
      if (d.action.type === 'raise')
        expect(d.action.to).toBeLessThanOrEqual(
          Math.max(limits(g).min, limits(g).current + 2 * g.pot),
        );
      expect(
        d.review.advice!.alternatives.some((a) => a.label === '下注至 495'),
      ).toBe(true);
      expect(
        d.review.advice!.warnings.some((w) => w.includes('巨额下注')),
      ).toBe(true);
    }
  });
  it('repeats with the same seed and distinguishes action-specific explanations', () => {
    for (const mode of ['easy', 'normal'] as const)
      expect(decide(aggressive(), mode, seeded(30))).toEqual(
        decide(aggressive(), mode, seeded(30)),
      );
    const call = analyzeDecision(
      aggressive(),
      { type: 'call' },
      'normal',
      seeded(42),
    );
    const fold = analyzeDecision(
      aggressive(),
      { type: 'fold' },
      'normal',
      seeded(42),
    );
    expect(call.reason).not.toBe(fold.reason);
    expect(call.advice!.samples).toBe(480);
    expect(call.advice!.model).toContain('近似');
    expect(call.advice!.warnings.some((w) => w.includes('不是 GTO'))).toBe(
      true,
    );
  });
  it('maintains conservation, legality and finite reviews over AI-driven hands', () => {
    for (const personality of Object.keys(PERSONALITIES) as Personality[])
    for (let seed = 1; seed <= 12; seed++) {
      let g: Game = startHand(initial(), seeded(seed));
      let steps = 0;
      while (g.phase !== 'complete' && steps++ < 100) {
        if (g.phase !== 'betting') g = advance(g, g.revision);
        else {
          const d = decide(
            view(g, g.turn),
            'normal',
            seeded(seed * 100 + steps),
            personality,
          );
          g = act(g, g.turn, d.action, g.revision, d.review);
        }
        expect(g.stacks[0] + g.stacks[1] + g.pot).toBe(1000);
        expect(g.stacks.every((n) => n >= 0)).toBe(true);
      }
      expect(g.phase).toBe('complete');
      expect(g.reviews.every((r) => Number.isFinite(r.advice?.actualEV))).toBe(
        true,
      );
    }
  });
  it('personality preferences preserve legal limits, range samples and the shared review reference', () => {
    for (const mode of ['easy', 'normal'] as const)
    for (let seed = 1; seed <= 12; seed++) {
      const g = startHand(initial(), seeded(seed));
      const v = view(g, g.turn);
      const balanced = decide(v, mode, seeded(seed + 500));
      for (const personality of Object.keys(PERSONALITIES) as Personality[]) {
        const d = decide(v, mode, seeded(seed + 500), personality);
        expect(legalDecision(v, d.action)).toBe(true);
        expect(d.action.type).not.toBe('fold');
        if (d.action.type === 'raise') expect(d.action.to).toBeLessThanOrEqual(Math.max(limits(g).min, limits(g).current + 2 * g.pot));
        expect(d.equity).toBe(balanced.equity);
        expect(d.review.advice!.recommended).toBe(balanced.review.advice!.recommended);
        expect(d.review.advice!.alternatives).toEqual(balanced.review.advice!.alternatives);
        expect(d.review.advice!.snapshot).toEqual(balanced.review.advice!.snapshot);
      }
    }
  });
  it('rejects malformed cards and invalid RNG before they create unreliable advice', () => {
    expect(() =>
      decide({ ...opening(), own: [0, 0] }, 'normal', seeded(1)),
    ).toThrow('可见牌');
    expect(() => decide(opening(), 'normal', () => 1)).toThrow('随机函数');
  });
});
