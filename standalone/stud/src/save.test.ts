// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  act,
  advance,
  analyzeDecision,
  initial,
  limits,
  startHand,
  view,
  type Game,
} from './engine';
import { loadGame, saveGame, validGame, SAVE_KEY } from './save';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('exact snapshot compatibility', () => {
  it('round trips ready, betting, dealing, runout and complete without replaying antes', () => {
    let g = initial();
    for (let n = 0; n < 10; n++) {
      expect(validGame(g)).toBe(true);
      saveGame(g);
      expect(loadGame(true).game).toEqual(g);
      g = startHand(g, () => 0.4);
      expect(validGame(g)).toBe(true);
      saveGame(g);
      expect(loadGame(true).game).toEqual(g);
      while (g.phase !== 'complete') {
        if (g.phase === 'betting') {
          const l = limits(g);
          g = act(g, g.turn, l.call ? { type: 'call' } : { type: 'check' });
        } else g = advance(g, g.revision);
        expect(validGame(g)).toBe(true);
        saveGame(g);
        expect(loadGame(true).game).toEqual(g);
      }
    }
    g = startHand(initial([3, 997]), () => 0.4);
    expect(g.phase).toBe('runout');
    expect(validGame(g)).toBe(true);
    saveGame(g);
    expect(loadGame(true).game).toEqual(g);
  });
  it('rejects malformed snapshots and duplicate cards', () => {
    const g = startHand(initial(), () => 0.4);
    for (const corrupt of [
      { ...g, deck: [...g.deck, g.cards[0][0]] },
      { ...g, pot: -1 },
      { ...g, stacks: [900, 900] },
      { ...g, phase: 'bad' },
      { ...g, reviews: [null] },
      { ...g, cards: [[], []] },
      { ...g, acted: [1, 2] },
      { ...g, acted: [true, true] },
      { ...g, phase: 'runout', paid: [0, 10] },
    ]) {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, game: corrupt }));
      expect(loadGame(true).game).toEqual(initial());
    }
  });
  it('migrates v1 settled saves, ignores future versions and respects isolated mode', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ v: 1, stacks: [620, 380], hand: 3 }),
    );
    expect(loadGame(true).game.stacks).toEqual([620, 380]);
    expect(loadGame(false).game).toEqual(initial());
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 99, game: initial() }));
    expect(loadGame(true).game).toEqual(initial());
  });
  it('reports storage failure without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(saveGame(initial())).toBe(false);
  });
  it('rejects zero-stack snapshots masquerading as normal betting or dealing', () => {
    let g = startHand(initial([30, 970]), () => 0.4);
    g = act(g, g.turn, { type: 'raise', to: limits(g).max });
    g = act(g, g.turn, { type: 'call' });
    expect(g.phase).toBe('runout');
    expect(validGame(g)).toBe(true);
    for (const phase of ['betting', 'dealing'] as const) {
      const broken = { ...g, phase, acted: [false, false] };
      if (phase === 'dealing') broken.acted = [true, true];
      expect(validGame(broken)).toBe(false);
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, game: broken }));
      expect(loadGame(true).game).toEqual(initial());
    }
  });
  it('accepts action snapshots through randomized legal raises and folds', () => {
    for (let n = 0; n < 50; n++) {
      let g: Game = startHand(initial());
      let count = 0;
      while (g.phase !== 'complete' && count++ < 200) {
        expect(validGame(g)).toBe(true);
        if (g.phase !== 'betting') {
          g = advance(g, g.revision);
          continue;
        }
        const l = limits(g);
        g = act(
          g,
          g.turn,
          Math.random() < 0.05
            ? { type: 'fold' }
            : Math.random() < 0.3 && l.max > l.current
              ? { type: 'raise', to: Math.min(l.max, l.min) }
              : l.call
                ? { type: 'call' }
                : { type: 'check' },
        );
      }
      expect(validGame(g)).toBe(true);
    }
  });
});
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
function reviewedHand() {
  let g = startHand(initial(), seeded(11)),
    step = 0;
  while (g.phase !== 'complete') {
    if (g.phase !== 'betting') {
      g = advance(g, g.revision);
      continue;
    }
    const a = limits(g).call
      ? { type: 'call' as const }
      : { type: 'check' as const };
    const review = analyzeDecision(
      view(g, g.turn),
      a,
      'normal',
      seeded(700 + step++),
    );
    g = act(g, g.turn, a, g.revision, review);
  }
  return g;
}
describe('public history and optional v2 advice', () => {
  it('loads old v2 reviews without fabricating advice or private history', () => {
    let g = startHand(initial(), seeded(9));
    g = act(g, g.turn, { type: 'fold' }, g.revision, {
      seat: g.turn,
      street: g.street,
      action: '',
      equity: 0.4,
      odds: 0,
      reason: '',
    });
    delete g.history;
    expect(validGame(g)).toBe(true);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, game: g }));
    const loaded = loadGame(true).game;
    expect(loaded).toEqual(g);
    expect(view(loaded, 0).history).toEqual([]);
    expect(loaded.reviews[0].advice).toBeUndefined();
  });
  it('round trips complete and ongoing new snapshots with decision-time cards', () => {
    const complete = reviewedHand();
    expect(complete.reviews).toHaveLength(8);
    expect(complete.reviews[0].advice!.snapshot.own).toHaveLength(2);
    expect(complete.reviews.at(-1)!.advice!.snapshot.own).toHaveLength(5);
    expect(validGame(complete)).toBe(true);
    expect(saveGame(complete)).toBe(true);
    expect(loadGame(true).game).toEqual(complete);
    let g = startHand(initial(), seeded(7));
    const a = { type: 'raise' as const, to: 20 };
    g = act(
      g,
      g.turn,
      a,
      g.revision,
      analyzeDecision(view(g, g.turn), a, 'normal', seeded(20)),
    );
    expect(saveGame(g)).toBe(true);
    expect(loadGame(true).game).toEqual(g);
    expect(loadGame(true).resumed).toBe(true);
  });
  it('strictly rejects forged advice values, leaked cards and mismatched alternatives', () => {
    const good = reviewedHand();
    const change = [
      (g: Game) => {
        g.reviews[0].advice!.samples = 0;
      },
      (g: Game) => {
        g.reviews[0].advice!.actualEV = Infinity;
      },
      (g: Game) => {
        g.reviews[0].advice!.recommended = '未知建议';
      },
      (g: Game) => {
        g.reviews[0].advice!.potAfterCall++;
      },
      (g: Game) => {
        g.reviews[0].advice!.snapshot.own.push(g.deck[0]);
      },
      (g: Game) => {
        g.reviews[0].advice!.snapshot.exposed[0] =
          g.cards[1 - g.reviews[0].seat][0];
      },
      (g: Game) => {
        Object.assign(g.reviews[0].advice!.snapshot, { deck: g.deck });
      },
      (g: Game) => {
        g.reviews[0].advice!.alternatives[0].paid = 1001;
      },
      (g: Game) => {
        g.reviews[0].advice!.estimatedLoss = -1;
      },
    ];
    for (const mutate of change) {
      const broken = structuredClone(good);
      mutate(broken);
      expect(validGame(broken)).toBe(false);
      expect(saveGame(broken)).toBe(false);
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, game: broken }));
      expect(loadGame(true).game).toEqual(initial());
    }
  });
  it('rejects private diagnostics, impossible history and future exposed cards', () => {
    const good = reviewedHand();
    for (const mutate of [
      (g: Game) => {
        Object.assign(g.history![0], { equity: 0.99 });
      },
      (g: Game) => {
        g.history![0].action = { type: 'call' };
        g.history![0].call = 20;
      },
      (g: Game) => {
        g.history![0].exposed[0].push(g.cards[0][2]);
      },
      (g: Game) => {
        g.history![0].exposed[1][0] = g.cards[1][0];
      },
      (g: Game) => {
        g.history![2].street = 1;
      },
    ]) {
      const bad = structuredClone(good);
      mutate(bad);
      expect(validGame(bad)).toBe(false);
    }
  });
  it('persists the legal response to an opponent effective all-in', () => {
    let g = startHand(initial([30, 970]), seeded(14));
    if (g.turn !== 0) g = act(g, g.turn, { type: 'check' });
    g = act(g, g.turn, { type: 'raise', to: limits(g).max });
    expect(g.phase).toBe('betting');
    expect(g.stacks[1 - g.turn]).toBe(0);
    expect(limits(g).call).toBeGreaterThan(0);
    expect(validGame(g)).toBe(true);
    expect(saveGame(g)).toBe(true);
    expect(loadGame(true).game).toEqual(g);
    g = act(g, g.turn, { type: 'call' });
    expect(g.phase).toBe('runout');
    expect(validGame(g)).toBe(true);
  });
  it('bounds untrusted JSON parsing without erasing the valid checkpoint', () => {
    const g = reviewedHand();
    expect(saveGame(g)).toBe(true);
    const before = localStorage.getItem(SAVE_KEY);
    expect(saveGame({ ...g, pot: -1 })).toBe(false);
    expect(localStorage.getItem(SAVE_KEY)).toBe(before);
    localStorage.setItem(SAVE_KEY, ' '.repeat(1000001));
    expect(loadGame(true).game).toEqual(initial());
  });
});
