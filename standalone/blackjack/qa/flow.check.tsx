import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowConnect } from '../../../components/games/flow';
import { FLOW_RECORDS_KEY, generateFlow } from '../../../lib/games/flow';

const cell = (i: number) =>
  document.querySelector(`[data-cell="${i}"]`) as HTMLElement;
const connected = () => screen.getByTestId('flow-connected').textContent;

function drawRoute(size: number, route: number[]) {
  cell(route[0]).focus();
  fireEvent.keyDown(cell(route[0]), { key: 'Enter' });
  for (let k = 1; k < route.length; k++) {
    const from = route[k - 1],
      to = route[k];
    const key =
      to === from + 1
        ? 'ArrowRight'
        : to === from - 1
          ? 'ArrowLeft'
          : to === from + size
            ? 'ArrowDown'
            : 'ArrowUp';
    fireEvent.keyDown(cell(from), { key });
  }
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('连线解谜', () => {
  it('键盘按参考路线画完全部颜色即完成，保存最快用时', () => {
    render(<FlowConnect />);
    const p = generateFlow(6, 20261013);
    expect(connected()).toBe('0');
    p.routes.forEach((route, c) => {
      drawRoute(6, route);
      if (c < p.routes.length - 1) expect(connected()).toBe(String(c + 1));
    });
    expect(document.querySelector('output')?.textContent).toMatch(/完成！用时/);
    expect(
      JSON.parse(localStorage.getItem(FLOW_RECORDS_KEY)!).best['6'],
    ).toBeGreaterThanOrEqual(1);
  });

  it('端点标签可读；空格不能开始画；提示画好一种颜色', () => {
    render(<FlowConnect />);
    const p = generateFlow(6, 20261013);
    expect(cell(p.pairs[0][0]).getAttribute('aria-label')).toMatch(
      /颜色 1 端点/,
    );
    const empty = p.routes[0][1];
    cell(empty).focus();
    fireEvent.keyDown(cell(empty), { key: 'Enter' });
    expect(screen.getByText('这里没有线，从同色圆点开始')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(connected()).toBe('1');
    expect(cell(p.pairs[0][1]).getAttribute('aria-label')).toMatch(/已连通/);
  });

  it('切换尺寸出新题', () => {
    render(<FlowConnect />);
    fireEvent.click(screen.getByRole('button', { name: '9×9' }));
    expect(document.querySelectorAll('[data-cell]').length).toBe(81);
    expect(screen.getByText(/FLOW · 9×9/)).toBeTruthy();
  });
});

describe('连线提示和每日局稳定性', () => {
  it('所有颜色已连通但留下空格时，提示仍能补回参考路线', () => {
    render(<FlowConnect />);
    const p = generateFlow(6, 20261013);
    // Colour 5 has a valid shortcut, but its two skipped cells remain empty.
    p.routes.forEach((route, c) =>
      drawRoute(6, c === 4 ? [27, 33, 32, 31, 25, 19] : route),
    );
    expect(connected()).toBe(String(p.pairs.length));
    expect(document.querySelector('output')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(document.querySelector('output')?.textContent).toMatch(/完成！用时/);
  });

  it('跨午夜保留每日局，并将完成记录归入开局日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 59));
    render(<FlowConnect />);
    fireEvent.click(screen.getByRole('button', { name: /今日连线/ }));
    const initialLabels = [...document.querySelectorAll('[data-cell]')].map(
      (b) => b.getAttribute('aria-label'),
    );
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    const labels = () =>
      [...document.querySelectorAll('[data-cell]')].map((b) =>
        b.getAttribute('aria-label'),
      );
    const before = labels();
    vi.setSystemTime(new Date(2026, 9, 14, 0, 0, 1));
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' });
    expect(labels()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: '重来' }));
    expect(labels()).toEqual(initialLabels);
    for (let i = 0; i < 12 && !document.querySelector('output'); i++)
      fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(JSON.parse(localStorage.getItem(FLOW_RECORDS_KEY)!).daily).toEqual([
      '2026-10-13',
    ]);
  });

  it('Ctrl、Alt、Meta快捷键不画线、不用提示、不吞掉浏览器操作', () => {
    render(<FlowConnect />);
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
      expect(
        fireEvent.keyDown(cell(0), { key: 'ArrowRight', [modifier]: true }),
      ).toBe(true);
      fireEvent.keyDown(cell(0), { key: 'h', [modifier]: true });
    }
    expect(connected()).toBe('0');
  });
});
