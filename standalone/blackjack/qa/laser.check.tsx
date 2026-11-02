import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LaserMirrors } from '../../../components/games/laser';
import {
  HANDCRAFTED,
  LASER_RECORDS_KEY,
  dims,
  generateLevel,
  trace,
  solutionPlacements,
} from '../../../lib/games/laser';

const cell = (r: number, c: number) =>
  screen.getByRole('button', { name: new RegExp(`^第 ${r} 行第 ${c} 列，`) });
const hit = () => screen.getByTestId('laser-hit').textContent;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('光线反射', () => {
  it('第 1 关：放镜子、旋转到位后全部点亮，三星记录', () => {
    render(<LaserMirrors />);
    expect(hit()).toBe('0');
    fireEvent.click(cell(1, 5));
    expect(cell(1, 5).getAttribute('aria-label')).toMatch(/镜子（\/）/);
    expect(hit()).toBe('0');
    fireEvent.click(cell(1, 5));
    expect(cell(1, 5).getAttribute('aria-label')).toMatch(/镜子（\\）/);
    expect(hit()).toBe('1');
    expect(screen.getByText(/全部点亮！★★★/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(LASER_RECORDS_KEY)!).stars.h1).toBe(
      3,
    );
    const next = screen.getByRole('button', { name: '下一关' });
    next.focus();
    fireEvent.click(next);
    expect(screen.getByText(/第 2 关 · 绕开墙/)).toBeTruthy();
    expect(document.activeElement).toBe(cell(1, 1));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1, 2));
  });

  it('固定格不能放，道具用完有提示；右键移除', () => {
    render(<LaserMirrors />);
    fireEvent.click(cell(1, 1));
    expect(screen.getByText('激光源，不能放')).toBeTruthy();
    fireEvent.click(cell(2, 2));
    fireEvent.click(screen.getByRole('button', { name: /分光镜/ }));
    fireEvent.click(cell(3, 3));
    expect(screen.getByRole('button', { name: /分光镜 \(S\)/ })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: /镜子 \(M\)/ }));
    fireEvent.click(cell(3, 3));
    expect(screen.getByText('镜子不够了')).toBeTruthy();
    fireEvent.contextMenu(cell(2, 2));
    expect(cell(2, 2).getAttribute('aria-label')).toMatch(/空格/);
  });

  it('键盘：方向键移动、回车放置；提示锁定一块并最多两星', () => {
    render(<LaserMirrors />);
    fireEvent.click(screen.getByRole('button', { name: /第 6 关/ }));
    const l = HANDCRAFTED[5];
    const first = cell(1, 1);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1, 2));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(cell(1, 2).getAttribute('aria-label')).toMatch(/镜子/);
    fireEvent.keyDown(document.activeElement!, { key: 'Delete' });
    const { width } = dims(l);
    const sol = [...solutionPlacements(l)];
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(screen.getByText(/提示：第/)).toBeTruthy();
    for (const [i, p] of sol) {
      const b = cell(Math.floor(i / width) + 1, (i % width) + 1);
      if (
        (b.getAttribute('aria-label') ?? '').includes(
          p.kind === 'mirror' ? '镜子' : '分光镜',
        )
      )
        continue;
      fireEvent.click(
        screen.getByRole('button', {
          name: p.kind === 'mirror' ? /镜子 \(M\)/ : /分光镜 \(S\)/,
        }),
      );
      fireEvent.click(b);
      if (p.ori) fireEvent.click(b);
    }
    expect(screen.getByText(/全部点亮！★★☆/)).toBeTruthy();
  });
});

describe('光线反射评星和局面稳定性', () => {
  it('最后一块来自提示时，显示与保存的星级都计入这次提示', () => {
    render(<LaserMirrors />);
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(screen.getByText(/全部点亮！★★☆/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(LASER_RECORDS_KEY)!).stars.h1).toBe(
      2,
    );
    expect(screen.getByText('全部点亮！2 星')).toBeTruthy();
  });

  it('解出后移除多余镜子，保存更高星级', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.000000001);
    render(<LaserMirrors />);
    fireEvent.click(screen.getByRole('button', { name: /随机一关/ }));
    const level = generateLevel('medium', 1);
    const sol = solutionPlacements(level);
    const lit = trace(level, sol).lit;
    const extra = level.grid
      .join('')
      .split('')
      .findIndex((c, i) => c === '.' && !sol.has(i) && !lit.has(i));
    expect(extra).toBeGreaterThanOrEqual(0);
    const button = (i: number) => cell(Math.floor(i / 8) + 1, (i % 8) + 1);
    fireEvent.click(button(extra));
    for (const [i, p] of sol) {
      fireEvent.click(
        screen.getByRole('button', {
          name: p.kind === 'mirror' ? /镜子 \(M\)/ : /分光镜 \(S\)/,
        }),
      );
      fireEvent.click(button(i));
      if (p.ori) fireEvent.click(button(i));
    }
    expect(
      JSON.parse(localStorage.getItem(LASER_RECORDS_KEY)!).stars[level.id],
    ).toBe(2);
    fireEvent.contextMenu(button(extra));
    expect(screen.getByText(/全部点亮！★★★/)).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem(LASER_RECORDS_KEY)!).stars[level.id],
    ).toBe(3);
  });

  it('每日局跨过午夜仍保留原题，完成计入原日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 59));
    render(<LaserMirrors />);
    fireEvent.click(screen.getByRole('button', { name: /今日光路/ }));
    const labels = () =>
      [...document.querySelectorAll('.laser-grid button')].map((b) =>
        b.getAttribute('aria-label'),
      );
    const before = labels();
    vi.setSystemTime(new Date(2026, 9, 14, 0, 0, 1));
    fireEvent.keyDown(cell(1, 1), { key: 'ArrowRight' });
    expect(labels()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: '重来' }));
    expect(labels()).toEqual(before);
    for (let i = 0; i < 12 && !document.querySelector('output'); i++)
      fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(JSON.parse(localStorage.getItem(LASER_RECORDS_KEY)!).daily).toEqual([
      '2026-10-13',
    ]);
  });

  it('Ctrl、Alt、Meta组合键留给浏览器，不移动或使用提示', () => {
    render(<LaserMirrors />);
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
      expect(
        fireEvent.keyDown(cell(1, 1), { key: 'ArrowRight', [modifier]: true }),
      ).toBe(true);
      fireEvent.keyDown(cell(1, 1), { key: 'h', [modifier]: true });
    }
    expect(hit()).toBe('0');
    expect(localStorage.getItem(LASER_RECORDS_KEY)).toBeNull();
  });
});
