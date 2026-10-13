import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChessGame } from '../../../components/games/chess';
import { CHESS_PUZZLES, CHESS_RECORDS_KEY } from '../../../lib/games/chess';

const sq = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[data-sq="${name}"]`)!;
const move = (from: string, to: string) => {
  fireEvent.click(sq(from));
  fireEvent.click(sq(to));
};
const openPuzzle = (id: string) =>
  fireEvent.change(screen.getByLabelText('残局模式'), {
    target: { value: String(CHESS_PUZZLES.findIndex((p) => p.id === id)) },
  });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('国际象棋', () => {
  it('残局：列加尔杀两步杀，对方按主线应着，解出后记录', () => {
    render(<ChessGame />);
    openPuzzle('legal');
    expect(screen.getByText(/白先，2 步杀/)).toBeTruthy();
    move('c4', 'f7');
    expect(screen.getByText(/对方应 Ke7/)).toBeTruthy();
    move('c3', 'd5');
    expect(screen.getAllByText(/将死/).length).toBeGreaterThan(0);
    expect(
      JSON.parse(localStorage.getItem(CHESS_RECORDS_KEY)!).puzzles,
    ).toContain('legal');
  });

  it('残局：走错会提示并保持局面，提示按钮选中正确的子', () => {
    render(<ChessGame />);
    openPuzzle('back-rank');
    move('d1', 'd2');
    expect(screen.getByText(/Rd2 不能强制将死/)).toBeTruthy();
    expect(sq('d1').getAttribute('aria-label')).toMatch(/白车/);
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(sq('d1').getAttribute('aria-pressed')).toBe('true');
  });

  it('对局：走 e4 后 AI 应着，悔棋回到开局；翻转棋盘', async () => {
    render(<ChessGame />);
    move('e2', 'e4');
    await waitFor(
      () =>
        expect(screen.getByLabelText('棋谱').textContent).toMatch(/1\. e4 \S+/),
      {
        timeout: 4000,
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(sq('e2').getAttribute('aria-label')).toMatch(/白兵/);
    fireEvent.click(screen.getByRole('button', { name: /翻转/ }));
    expect(screen.getByLabelText(/^棋盘，黑方在下/)).toBeTruthy();
  });

  it('键盘：方向键移动焦点，回车选子', () => {
    render(<ChessGame />);
    sq('e2').focus();
    fireEvent.keyDown(sq('e2'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(sq('d2'));
    fireEvent.click(sq('d2'));
    expect(sq('d4').getAttribute('aria-label')).toMatch(/可走/);
  });
});
