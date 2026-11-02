import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GomokuGame } from '../../../components/games/gomoku';
import { GomokuBoard } from '../../../components/games/gomoku-board';
import { newGame } from '../../../lib/games/gomoku';

vi.mock('next/link', () => ({
  default: (props: React.ComponentProps<'a'>) => <a {...props} />,
}));

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  message: {
    id: number;
    level: number;
    state: ReturnType<typeof newGame>;
  } | null = null;
  constructor() {
    TestWorker.instances.push(this);
  }
  postMessage(message: TestWorker['message']) {
    this.message = message;
  }
  terminate() {
    this.terminated = true;
  }
  reply(move: number) {
    this.onmessage?.({
      data: { id: 1, result: { move, nodes: 1, reason: 'test' } },
    });
  }
}
const latest = () => TestWorker.instances.at(-1)!;
const point = (i: number) =>
  document.querySelector<HTMLButtonElement>(`[data-pt="${i}"]`)!;
const reply = async (worker: TestWorker, move: number) =>
  act(async () => {
    worker.reply(move);
    await vi.advanceTimersByTimeAsync(350);
  });

beforeEach(() => {
  localStorage.clear();
  TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('五子棋客户端', () => {
  it('AI replies, paired undo, and white openings preserve the current match', async () => {
    render(<GomokuGame />);
    fireEvent.click(point(112));
    const worker = latest();
    expect(screen.getByText('AI 思考中…')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '10' },
    });
    expect(TestWorker.instances).toHaveLength(1);
    expect(worker.message!.level).toBe(4);
    await reply(worker, 113);
    expect(document.querySelectorAll('.go-stone')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '悔棋' }));
    expect(document.querySelectorAll('.go-stone')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    expect(latest().message!.level).toBe(10);
    await reply(latest(), 112);
    expect(screen.getByText('轮到你（白）')).toBeTruthy();
  });

  it('cancels a pending hint when playing and ignores its late reply', async () => {
    render(<GomokuGame />);
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    const hint = latest();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: '提示计算中…' })
        .disabled,
    ).toBe(true);
    fireEvent.click(point(112));
    expect(hint.terminated).toBe(true);
    const ai = latest();
    await reply(hint, 110);
    expect(document.querySelector('.is-hint')).toBeNull();
    await reply(ai, 113);
    expect(screen.getByText('轮到你（黑）')).toBeTruthy();
  });

  it('new games, resignation, and unmount cancel pending jobs', async () => {
    const view = render(<GomokuGame />);
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    const old = latest();
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    expect(old.terminated).toBe(true);
    await reply(old, 111);
    expect(document.querySelectorAll('.go-stone')).toHaveLength(0);
    await reply(latest(), 112);
    fireEvent.click(point(113));
    const pending = latest();
    fireEvent.click(screen.getByRole('button', { name: '认输' }));
    expect(pending.terminated).toBe(true);
    await reply(pending, 114);
    expect(document.querySelectorAll('.go-stone')).toHaveLength(2);
    expect(screen.getByText('你认输了')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    const unmounted = latest();
    view.unmount();
    expect(unmounted.terminated).toBe(true);
  });

  it.each(['error', 'messageerror', 'timeout', 'invalid'] as const)(
    'recovers from a worker %s without a stuck turn',
    async (failure) => {
      render(<GomokuGame />);
      fireEvent.click(point(112));
      const failed = latest();
      await act(async () => {
        if (failure === 'error') failed.onerror?.({ preventDefault() {} });
        if (failure === 'messageerror') failed.onmessageerror?.();
        if (failure === 'invalid') failed.reply(-1);
        if (failure === 'timeout') await vi.advanceTimersByTimeAsync(8000);
      });
      expect(screen.getByText('AI 计算失败，请重试或悔棋')).toBeTruthy();
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: '悔棋' })
          .disabled,
      ).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: '重试 AI' }));
      await reply(latest(), 113);
      expect(screen.getByText('轮到你（黑）')).toBeTruthy();
    },
  );

  it('hint failure can retry; resets clear both pending and visible hints', async () => {
    render(<GomokuGame />);
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    act(() => latest().onerror?.({ preventDefault() {} }));
    expect(screen.getByText('提示计算失败，可以重新请求提示。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    await reply(latest(), 112);
    expect(document.querySelector('.is-hint')).toBe(point(112));
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    expect(document.querySelector('.is-hint')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    const pending = latest();
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    await reply(pending, 113);
    expect(document.querySelector('.is-hint')).toBeNull();
  });

  it('same-screen alternates colors, undoes one move, and starts fresh', () => {
    render(<GomokuGame fromExplore />);
    expect(
      screen.getByRole('link', { name: /和朋友联机/ }).getAttribute('href'),
    ).toBe('/games/gomoku/online?from=explore');
    fireEvent.change(screen.getByLabelText('模式（下局生效）'), {
      target: { value: 'local' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新开一局' }));
    fireEvent.click(point(112));
    fireEvent.click(point(113));
    expect(screen.getByText('轮到黑')).toBeTruthy();
    expect(TestWorker.instances).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '悔棋' }));
    expect(document.querySelectorAll('.go-stone')).toHaveLength(1);
    expect(screen.getByText('轮到白')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '新开一局' }));
    expect(document.querySelectorAll('.go-stone')).toHaveLength(0);
  });

  it('uses one keyboard stop, arrow navigation, and blocks occupied/forbidden/disabled moves', () => {
    const state = newGame();
    state.cells[113] = 1;
    const play = vi.fn();
    const view = render(
      <GomokuBoard
        cells={state.cells}
        forbidden={new Set([114])}
        onPlay={play}
      />,
    );
    expect(document.querySelectorAll('.go-pt[tabindex="0"]')).toHaveLength(1);
    act(() => point(112).focus());
    fireEvent.keyDown(point(112), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(point(113));
    fireEvent.click(point(113));
    fireEvent.click(point(114));
    expect(play).not.toHaveBeenCalled();
    fireEvent.keyDown(point(113), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(point(128));
    fireEvent.click(point(128));
    expect(play).toHaveBeenCalledWith(128);
    view.rerender(<GomokuBoard cells={state.cells} disabled onPlay={play} />);
    fireEvent.click(point(129));
    expect(play).toHaveBeenCalledTimes(1);
  });
});
