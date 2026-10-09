// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import YahtzeeGame, { YahtzeeGame as NamedGame } from './YahtzeeGame';
import { categories, initial, roll, score, STORAGE } from './logic';
import { requestHold, type HoldDecision } from './ai';

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
vi.mock('./ai', () => ({ requestHold: vi.fn(() => vi.fn()) }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('homepage embedding and completion', () => {
  it('retains named/default exports and ignores native summary, editable text and composing keys', () => {
    expect(YahtzeeGame).toBe(NamedGame);
    render(<YahtzeeGame persist={false} />);
    fireEvent.keyDown(screen.getByText('桌边设置与玩法'), { code: 'Space' });
    const editable = document.createElement('span');
    editable.contentEditable = 'true';
    // jsdom does not synthesize the contentEditable attribute from its property.
    editable.setAttribute('contenteditable', 'true');
    screen.getByRole('main').appendChild(editable);
    fireEvent.keyDown(editable, { code: 'Space' });
    fireEvent.keyDown(screen.getByRole('main'), {
      code: 'Space',
      isComposing: true,
    });
    expect(screen.getByText('0 / 3 次投掷')).toBeTruthy();
  });
  it('explicit global shortcuts tolerate Window targets and do not capture a nested button', () => {
    render(<YahtzeeGame persist={false} globalKeyboard />);
    const nested = document.createElement('span');
    screen.getByRole('button', { name: '新一局' }).appendChild(nested);
    fireEvent.keyDown(nested, { code: 'Space' });
    expect(screen.getByText('0 / 3 次投掷')).toBeTruthy();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByText('1 / 3 次投掷')).toBeTruthy();
  });
  it('server rendering never reads storage, and hydration restores before any checkpoint write', async () => {
    const saved = {
      ...initial(),
      rolls: 2,
      dice: [6, 6, 2, 3, 4],
      held: [true, true, false, false, false],
    };
    localStorage.setItem(STORAGE, JSON.stringify(saved));
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    container.innerHTML = renderToString(<YahtzeeGame />);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    document.body.appendChild(container);
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <YahtzeeGame />);
    });
    expect(container.textContent).toContain('已恢复上次对局');
    expect(container.textContent).toContain('2 / 3 次投掷');
    expect(
      write.mock.calls
        .filter(([key]) => key === STORAGE)
        .every(([, raw]) => JSON.parse(String(raw)).id === saved.id),
    ).toBe(true);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(
      /hydration|didn't match/i,
    );
    act(() => root?.unmount());
    container.remove();
  });
  it('exit pauses before a pending decision can advance and cancels its worker request', () => {
    const saved = {
      ...initial(),
      turn: 'ai' as const,
      rolls: 1,
      cards: [{ ones: 1 }, {}] as [{ ones: number }, {}],
    };
    localStorage.setItem(STORAGE, JSON.stringify(saved));
    let pending: ((decision: HoldDecision) => void) | undefined;
    const canceled = vi.fn(),
      onExit = vi.fn();
    vi.mocked(requestHold).mockImplementationOnce(
      (_dice, _card, _difficulty, done) => {
        pending = done;
        return canceled;
      },
    );
    render(<YahtzeeGame onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    act(() => vi.advanceTimersByTime(850));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    act(() => pending?.({ held: [true, true, true, true, true], value: 0 }));
    expect(onExit).toHaveBeenCalledOnce();
    expect(canceled).toHaveBeenCalledOnce();
    expect(screen.getByText('对局已暂停')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).cards[1]).toEqual({});
  });
  it('a completed match notifies once per mount, remains ended and cannot consume more randomness', () => {
    let completed = initial();
    for (const category of categories) {
      completed = score(
        roll(completed, () => 0.2),
        category,
      );
      completed = score(
        roll(completed, () => 0.2),
        category,
      );
    }
    localStorage.setItem(STORAGE, JSON.stringify(completed));
    const onComplete = vi.fn();
    const view = render(<YahtzeeGame onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      player: 190,
      ai: 190,
      winner: 'draw',
    });
    view.rerender(<YahtzeeGame onComplete={onComplete} />);
    act(() => vi.advanceTimersByTime(10000));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole('button', { name: /本局已结束/ })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(requestHold).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).bonus).toEqual([
      100, 100,
    ]);
  });
});
