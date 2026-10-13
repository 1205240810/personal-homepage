import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MazeRace } from '../../../components/games/maze';
import {
  DIRS,
  E,
  MAZE_RECORDS_KEY,
  N,
  S,
  dailyMaze,
  generateMaze,
  move,
  run,
  solve,
} from '../../../lib/games/maze';

const KEY: Record<number, string> = {
  [N]: 'ArrowUp',
  [E]: 'ArrowRight',
  [S]: 'ArrowDown',
  8: 'ArrowLeft',
};
const canvas = () => screen.getByLabelText(/^迷宫，/);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('迷宫竞速', () => {
  it('按最短路一步步走到终点，记录最快用时', () => {
    render(<MazeRace />);
    const { maze } = generateMaze('backtracker', 'small', 20261013);
    const path = solve(maze, 0, maze.cells.length - 1);
    for (let k = 1; k < path.length; k++) {
      const d = DIRS.find((x) => move(maze, path[k - 1], x) === path[k])!;
      fireEvent.keyDown(canvas(), { key: KEY[d] });
    }
    expect(document.querySelector('output')?.textContent).toMatch(/到达终点/);
    expect(
      JSON.parse(localStorage.getItem(MAZE_RECORDS_KEY)!).best.small,
    ).toBeGreaterThan(0);
  });

  it('撞墙会提示；Shift 快跑一次走多格；看答案不计成绩', () => {
    render(<MazeRace />);
    const { maze } = generateMaze('backtracker', 'small', 20261013);
    const wall = DIRS.find((d) => move(maze, 0, d) === 0)!;
    fireEvent.keyDown(canvas(), { key: KEY[wall] });
    expect(screen.getByText(/边是墙/)).toBeTruthy();
    const open = DIRS.find((d) => move(maze, 0, d) !== 0)!;
    fireEvent.keyDown(canvas(), { key: KEY[open], shiftKey: true });
    expect(canvas().getAttribute('aria-label')).not.toMatch(/第 1 行第 1 列/);
    fireEvent.click(screen.getByRole('button', { name: /看答案/ }));
    expect(screen.getByText(/不计成绩/)).toBeTruthy();
    fireEvent.keyDown(canvas(), { key: KEY[open] });
    expect(localStorage.getItem(MAZE_RECORDS_KEY)).toBeNull();
  });

  it('换尺寸和算法生成新迷宫；关掉动画时立刻可走', () => {
    render(<MazeRace />);
    fireEvent.click(screen.getByLabelText('动画生成'));
    fireEvent.change(screen.getByLabelText('尺寸'), {
      target: { value: 'large' },
    });
    fireEvent.change(screen.getByLabelText('生成算法'), {
      target: { value: 'wilson' },
    });
    fireEvent.click(screen.getByRole('button', { name: /生成新迷宫/ }));
    expect(screen.getByText(/MAZE · 24×24 · WILSON/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /跳过动画/ })).toBeNull();
  });

  it('手机方向键在经过终点的走廊停下并完成游戏', () => {
    vi.spyOn(Math, 'random').mockReturnValue(2 / 1e9);
    render(<MazeRace />);
    fireEvent.click(screen.getByLabelText('动画生成'));
    fireEvent.change(screen.getByLabelText('尺寸'), {
      target: { value: 'small' },
    });
    fireEvent.click(screen.getByRole('button', { name: /生成新迷宫/ }));
    const { maze } = generateMaze('backtracker', 'small', 2);
    const goal = maze.cells.length - 1;
    let pos = 0;
    const names: Record<number, string> = {
      [N]: '上',
      [E]: '右',
      [S]: '下',
      8: '左',
    };
    for (let guard = 0; pos !== goal && guard < maze.cells.length; guard++) {
      const path = solve(maze, pos, goal);
      const d = DIRS.find((x) => move(maze, pos, x) === path[1])!;
      fireEvent.click(screen.getByRole('button', { name: `向${names[d]}跑` }));
      pos = run(maze, pos, d);
    }
    expect(document.querySelector('output')?.textContent).toMatch(/到达终点/);
  });

  it('今日迷宫跨午夜不换图，完成记录属于开题日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 59));
    render(<MazeRace />);
    fireEvent.click(screen.getByLabelText('动画生成'));
    fireEvent.click(screen.getByRole('button', { name: /今日迷宫/ }));
    const { maze } = dailyMaze({ year: 2026, month: 10, day: 13 });
    const path = solve(maze, 0, maze.cells.length - 1);
    for (let k = 1; k < path.length; k++) {
      if (k === 2) vi.setSystemTime(new Date(2026, 9, 14, 0, 0, 1));
      const d = DIRS.find((x) => move(maze, path[k - 1], x) === path[k])!;
      fireEvent.keyDown(canvas(), { key: KEY[d] });
    }
    expect(document.querySelector('output')?.textContent).toMatch(/到达终点/);
    expect(
      Object.keys(JSON.parse(localStorage.getItem(MAZE_RECORDS_KEY)!).daily),
    ).toEqual(['2026-10-13']);
  });
});
