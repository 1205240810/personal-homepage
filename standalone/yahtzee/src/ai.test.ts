import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestHold } from './ai';
afterEach(() => vi.unstubAllGlobals());
describe('AI worker lifecycle', () => {
  it('worker result terminates and releases URL', () => {
    let worker: any;
    class MockWorker {
      onmessage: any;
      onerror: any;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() {
        worker = this;
      }
    }
    vi.stubGlobal('Worker', MockWorker);
    const done = vi.fn();
    requestHold([1, 2, 3, 4, 5], {}, 'normal', done);
    worker.onmessage({
      data: { held: [true, true, true, true, true], value: 40 },
    });
    worker.onmessage({ data: { held: [], value: 0 } });
    expect(done).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalled();
  });
  it('late result after cancellation cannot score', () => {
    let worker: any;
    class MockWorker {
      onmessage: any;
      onerror: any;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() {
        worker = this;
      }
    }
    vi.stubGlobal('Worker', MockWorker);
    const done = vi.fn();
    const cancel = requestHold([1, 2, 3, 4, 5], {}, 'normal', done);
    cancel();
    worker.onmessage({ data: { held: [], value: 0 } });
    expect(done).not.toHaveBeenCalled();
  });
  it('worker blocked uses cooperative same-strategy fallback', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw Error('CSP');
        }
      },
    );
    const value = await new Promise<{ held: boolean[]; value: number }>(
      (resolve) => requestHold([2, 3, 4, 5, 6], {}, 'normal', resolve),
    );
    expect(value.held.every(Boolean)).toBe(true);
  });
  it('cancel stops fallback delivery', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw Error('CSP');
        }
      },
    );
    const done = vi.fn();
    const cancel = requestHold([2, 3, 4, 5, 6], {}, 'normal', done);
    cancel();
    await new Promise((r) => setTimeout(r, 30));
    expect(done).not.toHaveBeenCalled();
  });
});
