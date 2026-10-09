// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  fireEvent,
  screen,
  cleanup,
  act,
} from '@testing-library/react';
import { YahtzeeGame } from './YahtzeeGame';
import { requestHold } from './ai';
import { initial, STORAGE } from './logic';
vi.mock('./audio', () => ({
  createAudio: () => ({
    dispose: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    start: async () => true,
    setMusicEnabled: vi.fn(),
    setMusicVolume: vi.fn(),
    setSfxEnabled: vi.fn(),
    setSfxVolume: vi.fn(),
    play: vi.fn(),
  }),
}));
vi.mock('./ai', () => ({
  requestHold: vi.fn(
    (_d: unknown, _c: unknown, _l: unknown, done: (v: unknown) => void) => {
      const t = setTimeout(
        () => done({ held: [true, true, true, true, true] }),
        30,
      );
      return () => clearTimeout(t);
    },
  ),
}));
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const tick = (n: number) => act(() => vi.advanceTimersByTime(n));
describe('interaction safety', () => {
  it('rapid roll click is one roll; holds block during animation', () => {
    render(<YahtzeeGame persist={false} />);
    const button = screen.getByRole('button', { name: /掷出骰子/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByText('1 / 3 次投掷')).toBeTruthy();
    const die = screen.getByRole('button', { name: /骰子 1/ });
    fireEvent.click(die);
    expect(die.getAttribute('aria-pressed')).toBe('false');
    tick(400);
    fireEvent.click(die);
    expect(die.getAttribute('aria-pressed')).toBe('true');
  });
  it('zero needs confirmation, cancel and Escape retain the card', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<YahtzeeGame persist={false} />);
    fireEvent.click(screen.getByRole('button', { name: /掷出骰子/ }));
    tick(400);
    fireEvent.click(screen.getByRole('button', { name: '二点，记入 0 分' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '二点，记入 0 分' }));
    fireEvent.click(screen.getByRole('button', { name: '确认记零' }));
    expect(screen.getByText('蓝调的回合')).toBeTruthy();
  });
  it('pause cancels AI timer; resume continues; reset cancels stale work', () => {
    const s = {
      ...initial(),
      turn: 'ai' as const,
      cards: [{ ones: 1 }, {}] as [{ ones: number }, {}],
    };
    localStorage.setItem(STORAGE, JSON.stringify(s));
    render(<YahtzeeGame />);
    expect(screen.getByRole('button', { name: '继续' })).toBeTruthy();
    tick(5000);
    expect(screen.getByText('0 / 3 次投掷')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    tick(851);
    expect(screen.getByText('1 / 3 次投掷')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '新一局' }));
    fireEvent.click(screen.getByRole('button', { name: '确认重开' }));
    tick(10000);
    expect(screen.getByText('轮到你了')).toBeTruthy();
    expect(screen.getByText('0 / 3 次投掷')).toBeTruthy();
  });
  it('unmount clears pending timers', () => {
    const { unmount } = render(<YahtzeeGame persist={false} />);
    fireEvent.click(screen.getByRole('button', { name: /掷出骰子/ }));
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    unmount();
    expect(clear).toHaveBeenCalled();
    tick(10000);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('blocked storage does not break play', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<YahtzeeGame />);
    expect(screen.getByText('保存不可用，本局仍可继续')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /掷出骰子/ }));
    expect(screen.getByText('1 / 3 次投掷')).toBeTruthy();
  });
  it('scope keyboard, ignore repeated shortcuts', () => {
    render(<YahtzeeGame persist={false} />);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByText('0 / 3 次投掷')).toBeTruthy();
    const game = screen.getByRole('main');
    fireEvent.keyDown(game, { code: 'Space', repeat: true });
    expect(screen.getByText('0 / 3 次投掷')).toBeTruthy();
    fireEvent.keyDown(game, { code: 'Space' });
    expect(screen.getByText('1 / 3 次投掷')).toBeTruthy();
  });
  it('new game cancel retains progress', () => {
    render(<YahtzeeGame persist={false} />);
    fireEvent.click(screen.getByRole('button', { name: /掷出骰子/ }));
    tick(400);
    fireEvent.click(screen.getByRole('button', { name: '新一局' }));
    fireEvent.click(screen.getByRole('button', { name: '返回对局' }));
    expect(screen.getByText('1 / 3 次投掷')).toBeTruthy();
  });
  it('positive score is previewed, cancellable and committed only once', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<YahtzeeGame persist={false} />);
    fireEvent.click(screen.getByRole('button', { name: /掷出骰子/ }));
    tick(400);
    const category = screen.getByRole('button', { name: '一点，记入 5 分' });
    fireEvent.click(category);
    fireEvent.click(category);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('轮到你了')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
    expect(screen.queryByRole('button', { name: '记入一点 5 分' })).toBeNull();
    fireEvent.click(category);
    const commit = screen.getByRole('button', { name: '记入一点 5 分' });
    fireEvent.click(commit);
    fireEvent.click(commit);
    expect(screen.getByRole('button', { name: '一点，已记入 5' })).toBeTruthy();
    expect(screen.getByText('蓝调的回合')).toBeTruthy();
  });
  it('changing dice invalidates a pending score selection', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<YahtzeeGame persist={false} />);
    fireEvent.click(screen.getByRole('button', { name: /掷出骰子/ }));
    tick(400);
    fireEvent.click(screen.getByRole('button', { name: '一点，记入 5 分' }));
    fireEvent.click(screen.getByRole('button', { name: /骰子 1/ }));
    expect(screen.queryByRole('button', { name: '记入一点 5 分' })).toBeNull();
  });
  it('reload preserves the exact in-progress turn and waits for explicit resume', () => {
    const s = {
      ...initial(),
      dice: [6, 6, 2, 3, 4],
      held: [true, true, false, false, false],
      rolls: 2,
    };
    localStorage.setItem(STORAGE, JSON.stringify(s));
    const { unmount } = render(<YahtzeeGame />);
    expect(screen.getByText(/已恢复上次对局/)).toBeTruthy();
    tick(10000);
    expect(JSON.parse(localStorage.getItem(STORAGE)!).dice).toEqual(s.dice);
    expect(
      screen
        .getByRole('button', { name: '骰子 1，6 点，已保留' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('2 / 3 次投掷')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(
      screen.getByText('已保留 2 枚 · 还可重掷 1 次。点击骰子切换保留。'),
    ).toBeTruthy();
    unmount();
    render(<YahtzeeGame />);
    expect(screen.getByRole('button', { name: '继续' })).toBeTruthy();
    expect(screen.getByText('2 / 3 次投掷')).toBeTruthy();
  });
  it('fast AI changes pacing but retains the same decision inputs', () => {
    const s = {
      ...initial('easy'),
      turn: 'ai' as const,
      rolls: 1,
      dice: [2, 2, 3, 4, 6],
      cards: [{ ones: 1 }, {}] as [{ ones: number }, {}],
    };
    localStorage.setItem(STORAGE, JSON.stringify(s));
    render(<YahtzeeGame />);
    fireEvent.click(screen.getByRole('checkbox', { name: /快速 AI/ }));
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    tick(119);
    expect(screen.getByText('蓝调的回合')).toBeTruthy();
    tick(1);
    expect(requestHold).toHaveBeenLastCalledWith(
      s.dice,
      s.cards[1],
      'easy',
      expect.any(Function),
    );
    tick(31);
    expect(screen.getByText('轮到你了')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).cards[1].chance).toBe(17);
  });
  it('late AI callback after pause or restart cannot mutate the match', () => {
    let callback: ((v: { held: boolean[]; value: number }) => void) | undefined;
    vi.mocked(requestHold).mockImplementationOnce((_d, _c, _l, done) => {
      callback = done;
      return vi.fn();
    });
    const s = {
      ...initial(),
      turn: 'ai' as const,
      rolls: 1,
      cards: [{ ones: 1 }, {}] as [{ ones: number }, {}],
    };
    localStorage.setItem(STORAGE, JSON.stringify(s));
    render(<YahtzeeGame />);
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    tick(850);
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    act(() => callback?.({ held: [true, true, true, true, true], value: 0 }));
    expect(screen.getByText('对局已暂停')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).cards[1]).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: '新一局' }));
    fireEvent.click(screen.getByRole('button', { name: '确认重开' }));
    act(() => callback?.({ held: [true, true, true, true, true], value: 0 }));
    tick(10000);
    expect(screen.getByText('0 / 3 次投掷')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).cards).toEqual([{}, {}]);
  });
});
