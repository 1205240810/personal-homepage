import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LaserMirrors } from '../../../components/games/laser';
import {
  HANDCRAFTED,
  LASER_RECORDS_KEY,
  dims,
  solutionPlacements,
} from '../../../lib/games/laser';

const cell = (r: number, c: number) =>
  screen.getByRole('button', { name: new RegExp(`^第 ${r} 行第 ${c} 列，`) });
const hit = () => screen.getByTestId('laser-hit').textContent;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

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
    fireEvent.click(screen.getByRole('button', { name: '下一关' }));
    expect(screen.getByText(/第 2 关 · 绕开墙/)).toBeTruthy();
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
