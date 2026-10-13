import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HashiBridges } from '../../../components/games/hashi';
import {
  HASHI_RECORDS_KEY,
  dailyHashi,
  generateHashi,
} from '../../../lib/games/hashi';

const island = (k: number) =>
  document.querySelector(`[data-island="${k}"]`) as HTMLElement;
const done = () => screen.getByTestId('hashi-done').textContent;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('数桥', () => {
  it('依次点两座岛架桥，按参考解全部架好即完成并记录', () => {
    render(<HashiBridges />);
    const p = generateHashi('small', 20261013);
    p.solution.forEach((v, i) => {
      const e = p.edges[i];
      for (let k = 0; k < v; k++) {
        fireEvent.click(island(e.a));
        fireEvent.click(island(e.b));
      }
    });
    expect(done()).toBe(String(p.islands.length));
    expect(document.querySelector('output')?.textContent).toMatch(/全部连通/);
    expect(
      JSON.parse(localStorage.getItem(HASHI_RECORDS_KEY)!).best.small,
    ).toBeGreaterThanOrEqual(1);
  });

  it('键盘：方向键加桥循环、超数标红、Shift+方向键跳岛', () => {
    render(<HashiBridges />);
    const p = generateHashi('small', 20261013);
    const e = p.edges[0];
    const a = p.islands[e.a],
      b = p.islands[e.b];
    const key = e.horizontal
      ? b.x > a.x
        ? 'ArrowRight'
        : 'ArrowLeft'
      : b.y > a.y
        ? 'ArrowDown'
        : 'ArrowUp';
    island(e.a).focus();
    fireEvent.keyDown(island(e.a), { key });
    expect(island(e.a).getAttribute('aria-label')).toMatch(/已有 1 座/);
    fireEvent.keyDown(island(e.a), { key });
    expect(island(e.a).getAttribute('aria-label')).toMatch(/已有 2 座/);
    fireEvent.keyDown(island(e.a), { key });
    expect(island(e.a).getAttribute('aria-label')).toMatch(/已有 0 座/);
    fireEvent.keyDown(island(e.a), { key, shiftKey: true });
    expect(document.activeElement).toBe(island(e.b));
  });

  it('提示锁定一座正确的桥；换尺寸出新题', () => {
    render(<HashiBridges />);
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(document.querySelector('.hashi-bridge.is-locked')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '11×11' }));
    expect(screen.getByText(/HASHIWOKAKERO · 11×11/)).toBeTruthy();
  });

  it('浏览器修饰键不架桥或阻止默认操作', () => {
    render(<HashiBridges />);
    const p = generateHashi('small', 20261013);
    const edge = p.edges[0];
    const key = edge.horizontal ? 'ArrowRight' : 'ArrowDown';
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
      expect(fireEvent.keyDown(island(edge.a), { key, [modifier]: true })).toBe(
        true,
      );
      expect(island(edge.a).getAttribute('aria-label')).toMatch(/已有 0 座/);
    }
  });

  it('今日题跨午夜保留棋盘，完成记录属于开题日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 59));
    render(<HashiBridges />);
    fireEvent.click(screen.getByRole('button', { name: /今日数桥/ }));
    const p = dailyHashi({ year: 2026, month: 10, day: 13 });
    const labels = () =>
      [...document.querySelectorAll('[data-island]')].map((el) =>
        el.getAttribute('aria-label'),
      );
    const before = labels();
    fireEvent.click(island(0));
    vi.setSystemTime(new Date(2026, 9, 14, 0, 0, 1));
    fireEvent.click(island(0));
    expect(labels()).toEqual(before);
    p.solution.forEach((v, i) => {
      const e = p.edges[i];
      for (let k = 0; k < v; k++) {
        fireEvent.click(island(e.a));
        fireEvent.click(island(e.b));
      }
    });
    expect(JSON.parse(localStorage.getItem(HASHI_RECORDS_KEY)!).daily).toEqual([
      '2026-10-13',
    ]);
  });
});
