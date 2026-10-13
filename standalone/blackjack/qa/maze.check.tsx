import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MazeRace } from '../../../components/games/maze';
import {
  DIRS,
  E,
  MAZE_RECORDS_KEY,
  N,
  S,
  generateMaze,
  move,
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
});
