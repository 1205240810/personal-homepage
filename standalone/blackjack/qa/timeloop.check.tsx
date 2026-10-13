import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TimeLoop } from '../../../components/games/timeloop';
import { LEVELS, TIMELOOP_RECORDS_KEY } from '../../../lib/games/timeloop';

const KEY = {
  U: 'ArrowUp',
  D: 'ArrowDown',
  L: 'ArrowLeft',
  R: 'ArrowRight',
  W: ' ',
} as const;
const board = () => screen.getByLabelText(/^时间回溯棋盘/);
const play = (moves: string) => {
  for (const m of moves)
    fireEvent.keyDown(board(), { key: KEY[m as keyof typeof KEY] });
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('时间回溯', () => {
  it.each(LEVELS)('关卡 $id 的完整多轮录像可从界面通关', (level) => {
    render(<TimeLoop />);
    fireEvent.change(screen.getByLabelText('选择关卡'), {
      target: { value: String(LEVELS.indexOf(level)) },
    });
    for (const [i, recording] of level.solution.entries()) {
      play(recording);
      expect(screen.getByTestId('tl-time').textContent).toBe(String(recording.length));
      if (i < level.solution.length - 1) fireEvent.keyDown(board(), { key: 't' });
    }
    expect(document.querySelector('output.kit-ok')).toBeTruthy();
    const record = JSON.parse(localStorage.getItem(TIMELOOP_RECORDS_KEY)!).best[level.id];
    expect(record).toEqual({ loops: level.solution.length, moves: level.solution.join('').length });
    fireEvent.keyDown(board(), { key: 'z' });
    expect(document.querySelector('output.kit-ok')).toBeNull();
    play(level.solution.at(-1)!.slice(-1));
    expect(document.querySelector('output.kit-ok')).toBeTruthy();
  });

  it('浏览器组合键不走时，按钮上的空格保留原生点击操作', () => {
    render(<TimeLoop />);
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey'])
      fireEvent.keyDown(board(), { key: 'ArrowRight', [modifier]: true });
    fireEvent.keyDown(screen.getByRole('button', { name: /重来/ }), { key: ' ' });
    expect(screen.getByTestId('tl-time').textContent).toBe('0');
  });

  it('按参考解录一轮、回溯、再走一轮即可逃出，并记录轮数', () => {
    render(<TimeLoop />);
    const [first, last] = LEVELS[0].solution;
    play(first);
    fireEvent.keyDown(board(), { key: 't' });
    expect(screen.getByText(/过去的自己会重演/)).toBeTruthy();
    play(last);
    expect(document.querySelector('output.kit-ok')?.textContent).toMatch(
      /逃出去了/,
    );
    expect(
      JSON.parse(localStorage.getItem(TIMELOOP_RECORDS_KEY)!).best.door.loops,
    ).toBe(2);
  });

  it('门关着时走不通；撤销能跨轮撤回', () => {
    render(<TimeLoop />);
    play('RRRDD');
    expect(screen.getByText(/向下走不通/)).toBeTruthy();
    expect(screen.getByTestId('tl-time').textContent).toBe('4');
    fireEvent.keyDown(board(), { key: 't' });
    expect(screen.getByTestId('tl-time').textContent).toBe('0');
    fireEvent.keyDown(board(), { key: 'z' });
    expect(screen.getByTestId('tl-time').textContent).toBe('4');
  });

  it('时间用完且轮数用尽时提示撤销或重来', () => {
    render(<TimeLoop />);
    play('R');
    fireEvent.keyDown(board(), { key: 't' });
    play('WWWWWWWW');
    expect(screen.getByText(/轮数用完了/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重来/ }));
    expect(screen.getByTestId('tl-time').textContent).toBe('0');
  });
});
