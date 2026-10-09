import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  HoldemWorkerClient,
  type StrategyWorker,
} from '../lib/games/holdem-worker-client.ts';
import { runCooperative } from '../lib/games/cooperative-computation.ts';
import {
  decideBot,
  decideBotSteps,
  reviewHand,
  reviewHandSteps,
  seededRandom,
} from '../lib/games/holdem-strategy.ts';
import {
  act,
  legalActions,
  shuffledDeck,
  startHand,
  type HoldemState,
} from '../lib/games/holdem-engine.ts';

type Job = { type: 'bot' | 'review'; value: number };
class FakeWorker implements StrategyWorker {
  onmessage: StrategyWorker['onmessage'] = null;
  onerror: StrategyWorker['onerror'] = null;
  onmessageerror: StrategyWorker['onmessageerror'] = null;
  sent: ({ id: number } & Job)[] = [];
  terminated = false;
  postMessage(message: unknown) {
    this.sent.push(message as { id: number } & Job);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, result: unknown) {
    this.onmessage?.({ data: { id, result } } as MessageEvent);
  }
}
function fixture(deadline = 50) {
  const workers: FakeWorker[] = [];
  let fallbacks = 0;
  const client = new HoldemWorkerClient<Job>({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    deadlineMs: () => deadline,
    computeFallback: async (job) => {
      fallbacks++;
      return job.value;
    },
  });
  return { client, workers, fallbacks: () => fallbacks };
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

await test('silent worker reaches a finite deadline, terminates, then retry succeeds exactly once', async () => {
  const { client, workers, fallbacks } = fixture(15);
  const first = client.request<number>({ type: 'bot', value: 1 });
  await assert.rejects(first, /AI 计算超时/);
  assert.equal(workers[0].terminated, true);
  assert.equal(
    fallbacks(),
    0,
    'a stalled worker must not silently start expensive fallback',
  );
  const retry = client.request<number>({ type: 'bot', value: 2 });
  let actions = 0;
  const action = retry.then((value) => {
    actions++;
    return value;
  });
  workers[0].reply(workers[0].sent[0].id, 999);
  workers[1].reply(workers[1].sent[0].id, 2);
  workers[1].reply(workers[1].sent[0].id, 3);
  assert.equal(await action, 2);
  assert.equal(actions, 1);
  client.dispose();
});

await test('pause/restart aborts real worker work and ignores late responses from the previous turn', async () => {
  const { client, workers } = fixture();
  const controller = new AbortController();
  const oldTurn = client.request({ type: 'bot', value: 1 }, controller.signal);
  controller.abort();
  await assert.rejects(oldTurn, /取消/);
  assert.equal(workers[0].terminated, true);
  const newTurn = client.request({ type: 'bot', value: 2 });
  workers[0].reply(workers[0].sent[0].id, 999);
  workers[1].reply(workers[1].sent[0].id, 2);
  assert.equal(await newTurn, 2);
  client.dispose();
});

await test('leaving rejects pending work and prevents future requests', async () => {
  const { client, workers } = fixture();
  const pending = client.request({ type: 'review', value: 1 });
  client.dispose();
  await assert.rejects(pending, /页面已离开/);
  await assert.rejects(client.request({ type: 'bot', value: 2 }), /取消/);
  assert.equal(workers[0].terminated, true);
});

await test('worker error preserves fallback, clears deadline and can recreate a worker next time', async () => {
  const { client, workers, fallbacks } = fixture(20);
  const pending = client.request({ type: 'review', value: 7 });
  workers[0].onerror?.({} as ErrorEvent);
  assert.equal(await pending, 7);
  assert.equal(fallbacks(), 1);
  assert.equal(workers[0].terminated, true);
  await delay(25);
  const retry = client.request({ type: 'bot', value: 8 });
  workers[1].reply(workers[1].sent[0].id, 8);
  assert.equal(await retry, 8);
  client.dispose();
});

await test('worker startup/postMessage/message decode failures use fallback', async () => {
  for (const failure of ['startup', 'post', 'decode']) {
    const worker = new FakeWorker();
    if (failure === 'post')
      worker.postMessage = () => {
        throw new Error('clone failed');
      };
    const client = new HoldemWorkerClient<Job>({
      createWorker: () => {
        if (failure === 'startup') throw new Error('unsupported');
        return worker;
      },
      computeFallback: async (job) => job.value,
    });
    const result = client.request({ type: 'bot', value: 4 });
    if (failure === 'decode') worker.onmessageerror?.({} as MessageEvent);
    assert.equal(await result, 4);
    client.dispose();
  }
});

await test('fallback has the same finite deadline and receives cancellation', async () => {
  let fallbackSignal: AbortSignal | undefined;
  const client = new HoldemWorkerClient<Job>({
    createWorker: () => {
      throw new Error('unsupported');
    },
    deadlineMs: () => 15,
    computeFallback: (_job, signal) => {
      fallbackSignal = signal;
      return new Promise(() => {});
    },
  });
  await assert.rejects(
    client.request({ type: 'review', value: 0 }),
    /复盘计算超时/,
  );
  assert.equal(fallbackSignal?.aborted, true);
  client.dispose();
});

await test('fallback mode clears when a subsequent worker starts successfully', async () => {
  const modes: string[] = [];
  let supported = false;
  const worker = new FakeWorker();
  const client = new HoldemWorkerClient<Job>({
    createWorker: () => {
      if (!supported) throw new Error('unsupported');
      return worker;
    },
    computeFallback: async (job) => job.value,
    onModeChange: (mode) => modes.push(mode),
  });
  assert.equal(await client.request({ type: 'bot', value: 1 }), 1);
  supported = true;
  const retry = client.request({ type: 'bot', value: 2 });
  worker.reply(worker.sent[0].id, 2);
  assert.equal(await retry, 2);
  assert.deepEqual(modes, ['fallback', 'worker']);
  client.dispose();
});

await test('leaving during fallback aborts its computation and ignores its late completion', async () => {
  let signal: AbortSignal | undefined;
  let finish: ((result: number) => void) | undefined;
  const client = new HoldemWorkerClient<Job>({
    createWorker: () => {
      throw new Error('unsupported');
    },
    computeFallback: (_job, currentSignal) => {
      signal = currentSignal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const pending = client.request({ type: 'review', value: 1 });
  await Promise.resolve();
  client.dispose();
  await assert.rejects(pending, /页面已离开/);
  assert.equal(signal?.aborted, true);
  finish?.(999);
  await Promise.resolve();
});

await test('cancellation before dispatch starts no worker or fallback', async () => {
  const { client, workers, fallbacks } = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.request({ type: 'bot', value: 0 }, controller.signal),
    /取消/,
  );
  assert.equal(workers.length, 0);
  assert.equal(fallbacks(), 0);
  client.dispose();
});

await test('cooperative fallback yields to UI timers and stops between slices', async () => {
  const controller = new AbortController();
  let steps = 0;
  function* slowSteps() {
    while (steps < 10000) {
      steps++;
      yield;
    }
    return steps;
  }
  const pending = runCooperative(slowSteps(), controller.signal, 0);
  await delay(5);
  assert(steps > 0 && steps < 10000);
  controller.abort();
  await assert.rejects(pending, /取消/);
  const stopped = steps;
  await delay(5);
  assert.equal(steps, stopped);
});

function completedFixture(tableSize: number): HoldemState {
  let state = startHand({
    tableSize,
    deck: shuffledDeck(seededRandom(4100 + tableSize)),
  });
  for (let i = 0; state.street !== 'complete' && i < 100; i++) {
    const legal = legalActions(state)!;
    state = act(state, { type: legal.canCheck ? 'check' : 'call' });
  }
  assert.equal(state.street, 'complete');
  return state;
}
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

await test('cooperative bot and review preserve seeded outputs, sample counts and action order', async () => {
  for (const tableSize of [2, 5, 9]) {
    let turn = startHand({
      tableSize,
      deck: shuffledDeck(seededRandom(5100 + tableSize)),
    });
    if (turn.toAct === 0) turn = act(turn, { type: 'call' });
    const args = [turn, turn.toAct!, 'balanced', 'standard'] as const;
    const syncBot = decideBot(...args);
    const asyncBot = await runCooperative(
      decideBotSteps(...args),
      new AbortController().signal,
    );
    assert.deepEqual(asyncBot, syncBot);
    assert.equal(asyncBot.samples, 260);
    const state = completedFixture(tableSize);
    const syncReview = reviewHand(state, 30);
    const asyncReview = await runCooperative(
      reviewHandSteps(state, 30),
      new AbortController().signal,
    );
    assert.deepEqual(asyncReview, syncReview);
    assert(syncReview.every((point) => point.samples === 30));
    // Fixtures below are generated from the unmodified base commit, not the new generator wrappers.
    const expected: Record<number, [string, string]> = {
      2: [
        '2b2e69c6c8232bb1af108210727825cc46b844b0a12d6883d97c0c48fd3002f0',
        '10fede4f672e8b3212104258a4af6cdbed95311377bf381f45ab536315fbb933',
      ],
      5: [
        '5e9132baf42a0d5526c02d8b3a659e81c7e804d855b0e6e2a2967b88f405eec1',
        'e1f4ead6ebb85d018b1946a28ac674e68f9ef72a16c105d2da928c330a6f1fab',
      ],
      9: [
        '5a497781cc9d502c4cf4a13984f94a8974a58780eff79f1901a922a4c8dcbece',
        '34745292b90168b10aaf5f0ec23c9b4e16a14a9946fdc387d45316d3bc7775ea',
      ],
    };
    assert.equal(digest(syncBot), expected[tableSize][0]);
    assert.equal(digest(syncReview), expected[tableSize][1]);
  }
});

await test('UI binds effect cancellation and retry to native paused help dialog', () => {
  const source = readFileSync(
    new URL('../components/games/holdem-lab.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /新手指南与牌型速查/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /onCancel=/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(
    source,
    /current === state \? act\(current, action, trace\) : current/,
  );
  assert.match(source, /重试 AI 行动/);
  assert.match(source, /aria-describedby=\{humanTurn \? 'poker-call-help'/);
});
