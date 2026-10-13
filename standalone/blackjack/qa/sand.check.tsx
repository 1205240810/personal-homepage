import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallingSand } from '../../../components/games/sand';
import { SAND_SAVE_KEY } from '../../../lib/games/sand';

const canvas = () => screen.getByLabelText(/落沙画布/);
const key = (k: string, o: Record<string, unknown> = {}) =>
  fireEvent.keyDown(canvas(), { key: k, ...o });
const total = () => Number(screen.getByTestId('sand-total').textContent);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('落沙模拟', () => {
  it('数字键选元素，[ ] 调笔刷，回车在键盘画笔处放下', () => {
    render(<FallingSand />);
    key('3');
    expect(
      screen.getByRole('button', { name: /墙/, pressed: true }),
    ).toBeTruthy();
    key('c');
    expect(total()).toBe(0);
    key(']');
    expect(screen.getByText('11px')).toBeTruthy();
    key('ArrowDown', { shiftKey: true });
    key('Enter');
    expect(total()).toBeGreaterThan(50);
    expect(screen.getByText(/放下墙/)).toBeTruthy();
    key('0');
    key('Enter');
    expect(total()).toBe(0);
  });

  it('存档与读档；空格暂停', () => {
    render(<FallingSand />);
    const load = screen.getByRole('button', { name: /读取存档/ });
    expect(load).toHaveProperty('disabled', true);
    key('3');
    key('Enter');
    const before = total();
    key('s');
    expect(JSON.parse(localStorage.getItem(SAND_SAVE_KEY)!).width).toBe(240);
    key('c');
    expect(total()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /读取存档/ }));
    expect(total()).toBeGreaterThanOrEqual(before);
    key(' ');
    expect(screen.getByRole('button', { name: /继续/ })).toBeTruthy();
  });
});
