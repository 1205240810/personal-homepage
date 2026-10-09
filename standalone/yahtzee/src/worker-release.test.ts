import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { requestHold, type HoldDecision } from './ai';
import { chooseHold } from './logic';
import { workerSource } from './worker-source';

type MockInstance = {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { preventDefault?: () => void }) => void) | null;
  onmessageerror: (() => void) | null;
  terminate: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};
function mockWorker() {
  const instances: MockInstance[] = [];
  class MockWorker {
    onmessage = null;
    onerror = null;
    onmessageerror = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  vi.stubGlobal('Worker', MockWorker);
  return () => instances.at(-1)!;
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('published worker and request boundary', () => {
  it('executes the generated worker source with the same legal decision and no future RNG', () => {
    const postMessage = vi.fn();
    const self = {
      postMessage,
      onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
    };
    const safeMath = Object.create(Math);
    safeMath.random = () => {
      throw new Error('AI cannot read future RNG');
    };
    runInNewContext(workerSource, { self, Math: safeMath });
    for (const difficulty of ['easy', 'normal'] as const) {
      const dice = [1, 2, 3, 4, 6];
      self.onmessage!({ data: { dice, card: {}, difficulty } });
      expect(postMessage.mock.lastCall?.[0]).toEqual(
        chooseHold(dice, {}, difficulty),
      );
    }
    self.onmessage!({ data: null });
    expect(postMessage.mock.lastCall?.[0]).toEqual({
      error: 'AI 无法分析此快照',
    });
  });
  it('malformed worker decisions fall back instead of corrupting holds', async () => {
    const worker = mockWorker(),
      done = vi.fn();
    const cancel = requestHold([2, 3, 4, 5, 6], {}, 'normal', done);
    worker().onmessage?.({ data: { held: [], value: Infinity } });
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(done.mock.lastCall?.[0]).toEqual(
      chooseHold([2, 3, 4, 5, 6], {}, 'normal'),
    );
    expect(worker().terminate).toHaveBeenCalledOnce();
    cancel();
    expect(worker().terminate).toHaveBeenCalledOnce();
  });
  it('four-second timeout falls back once and ignores a late worker answer', async () => {
    vi.useFakeTimers();
    const worker = mockWorker(),
      done = vi.fn();
    requestHold([2, 3, 4, 5, 6], {}, 'normal', done);
    await vi.advanceTimersByTimeAsync(4100);
    expect(done).toHaveBeenCalledOnce();
    worker().onmessage?.({
      data: { held: [false, false, false, false, false], value: 0 },
    });
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('fallback freezes the original observation and cancellation revokes each URL exactly once', async () => {
    const create = vi.spyOn(URL, 'createObjectURL'),
      revoke = vi.spyOn(URL, 'revokeObjectURL');
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('CSP');
        }
      },
    );
    const dice = [2, 3, 4, 5, 6],
      card = {},
      expected = chooseHold(dice, card, 'normal');
    const decision = new Promise<HoldDecision>((resolve) =>
      requestHold(dice, card, 'normal', resolve),
    );
    dice.fill(1);
    expect(await decision).toEqual(expected);
    expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
    const done = vi.fn(),
      cancel = requestHold([2, 3, 4, 5, 6], {}, 'normal', done);
    cancel();
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(done).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
  });
});
