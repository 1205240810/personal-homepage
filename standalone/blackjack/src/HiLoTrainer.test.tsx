// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HiLoTrainer } from './HiLoTrainer';
import { BlackjackLobby } from './BlackjackLobby';
import { HILO_KEY, hiLoValue } from './hilo';

function shownCount() {
  // Sum the tags printed in the round strip after answering.
  return Array.from(document.querySelectorAll('.hilo-strip span')).reduce((sum, el) => sum + Number(el.textContent), 0);
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('HiLoTrainer', () => {
  it('manual drill: flips cards one by one, then grades the running count and saves it', () => {
    render(<HiLoTrainer />);
    fireEvent.click(screen.getByRole('button', { name: '手动翻牌' }));
    fireEvent.click(screen.getByRole('button', { name: '10 张' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /洗新牌靴/ }));
    let count = 0;
    for (let i = 0; i < 10; i++) {
      const card = screen.getByRole('img');
      const rank = card.getAttribute('aria-label')!.split(' ')[1];
      count += hiLoValue(rank);
      expect(document.querySelector('.hilo-tag')?.textContent).toBe(hiLoValue(rank) > 0 ? `+${hiLoValue(rank)}` : `${hiLoValue(rank)}`);
      if (i < 9) fireEvent.click(screen.getByRole('button', { name: /下一张/ }));
      else {
        // The last card stays on screen until the player moves on.
        expect(screen.getByRole('button', { name: /看完了/ })).toBeTruthy();
        fireEvent.keyDown(window, { key: ' ' });
      }
    }
    const input = screen.getByLabelText(/流水数/);
    fireEvent.change(input, { target: { value: String(count) } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(screen.getByRole('status').textContent).toMatch(/答对了/);
    expect(shownCount()).toBe(count);
    expect(JSON.parse(localStorage.getItem(HILO_KEY)!)).toMatchObject({ rounds: 1, correct: 1, streak: 1 });
  });

  it('auto drill keeps the same shoe across rounds and marks a wrong answer', () => {
    vi.useFakeTimers();
    render(<HiLoTrainer />);
    fireEvent.click(screen.getByRole('button', { name: /快/ }));
    fireEvent.click(screen.getByRole('button', { name: '10 张' }));
    fireEvent.click(screen.getByRole('button', { name: /洗新牌靴/ }));
    act(() => { vi.advanceTimersByTime(500 * 11); });
    expect(screen.getByText(/现在的流水数是多少/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/流水数/), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(screen.getByRole('status').textContent).toMatch(/差一点/);
    expect(screen.getByText(/牌靴剩余 94 张/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续这个牌靴' }));
    expect(screen.getByText('本轮 0 / 10 张')).toBeTruthy();
    expect(screen.getByText('继续上一轮牌靴，流水数继续累计。')).toBeTruthy();
    // The previous round's final card must not be dealt again during the
    // countdown to this round's first card.
    expect(screen.queryByRole('img')).toBeNull();
    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.queryByRole('img')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('img')).toBeTruthy();
    expect(screen.getByText('本轮 1 / 10 张')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(500 * 10); });
    expect(screen.getByText(/牌靴剩余 84 张/)).toBeTruthy();
  });

  it('discloses a required reshuffle and grades the new shoe from zero', () => {
    render(<HiLoTrainer persist={false} />);
    fireEvent.click(screen.getByRole('button', { name: '1 副' }));
    fireEvent.click(screen.getByRole('button', { name: '手动翻牌' }));
    fireEvent.click(screen.getByRole('button', { name: '30 张' }));
    fireEvent.click(screen.getByRole('button', { name: /洗新牌靴/ }));
    for (let round = 0; round < 2; round++) {
      let count = 0;
      for (let i = 0; i < 30; i++) {
        const rank = screen.getByRole('img').getAttribute('aria-label')!.split(' ')[1];
        count += hiLoValue(rank);
        fireEvent.click(screen.getByRole('button', { name: i < 29 ? /下一张/ : /看完了/ }));
      }
      fireEvent.change(screen.getByLabelText(/流水数/), { target: { value: String(count) } });
      fireEvent.click(screen.getByRole('button', { name: '确认' }));
      expect(screen.getByRole('status').textContent).toMatch(/答对了/);
      expect(screen.getByText(/牌靴剩余 22 张/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: '继续这个牌靴' })).toBeNull();
      const reshuffle = screen.getByRole('button', { name: '洗新牌靴，流水数归零' });
      if (round === 0) {
        fireEvent.click(reshuffle);
        expect(screen.getByText('新牌靴：流水数从 0 开始。')).toBeTruthy();
        expect(screen.getByText('本轮 1 / 30 张')).toBeTruthy();
        expect(screen.getByText(/牌靴剩余 51 张/)).toBeTruthy();
      }
    }
  });

  it('is an optional third tab in the lobby', () => {
    render(<BlackjackLobby persist={false} />);
    fireEvent.click(screen.getByRole('button', { name: /记牌练习/ }));
    expect(screen.getByRole('heading', { name: 'Hi-Lo 记牌练习' })).toBeTruthy();
  });
});
