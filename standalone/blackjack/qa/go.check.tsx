import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoGame } from '../../../components/games/go';
import { GO_RECORDS_KEY } from '../../../lib/games/go';
import { GO_PROBLEMS as PROBLEMS } from '../../../lib/games/go-problems';

const pt = (p: number) =>
  document.querySelector<HTMLButtonElement>(`[data-pt="${p}"]`)!;
const openProblem = (id: string) =>
  fireEvent.change(screen.getByLabelText('模式'), {
    target: { value: String(PROBLEMS.findIndex((p) => p.id === id)) },
  });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('围棋', () => {
  it('死活题：直三点眼，白应后黑提子，记录已解', () => {
    render(<GoGame />);
    openProblem('straight-three-kill');
    fireEvent.click(pt(1));
    expect(screen.getByText(/好棋！白 A9/)).toBeTruthy();
    fireEvent.click(pt(2));
    expect(screen.getByText(/提掉了！正解/)).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem(GO_RECORDS_KEY)!).problems,
    ).toContain('straight-three-kill');
  });

  it('死活题：下错时白棋反击并提示失败，重来可再试；区域外不能下', () => {
    render(<GoGame />);
    openProblem('straight-three-live');
    fireEvent.click(pt(40));
    expect(screen.getByText(/只在标出的区域/)).toBeTruthy();
    fireEvent.click(pt(0));
    expect(screen.getByText(/不对。白 B9 应对后，黑棋活不了/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重来/ }));
    fireEvent.click(pt(1));
    expect(screen.getByText(/活了！/)).toBeTruthy();
  });

  it('对局：落子后 AI 应着，悔棋回到开局', async () => {
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('难度'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    fireEvent.click(pt(40));
    expect(pt(40).getAttribute('aria-label')).toMatch(/黑子/);
    await waitFor(() => expect(screen.getByText(/轮到你/)).toBeTruthy(), {
      timeout: 5000,
    });
    expect(document.querySelectorAll('.go-stone.is-white').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(document.querySelectorAll('.go-stone').length).toBe(0);
  });

  it('键盘：方向键移动焦点', () => {
    render(<GoGame />);
    pt(40).focus();
    fireEvent.keyDown(pt(40), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(pt(31));
    fireEvent.keyDown(pt(31), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(pt(32));
  });
});
