import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuleWords } from '../../../components/games/rulewords';
import { LEVELS, RULEWORDS_RECORDS_KEY } from '../../../lib/games/rulewords';

const KEY = {
  U: 'ArrowUp',
  D: 'ArrowDown',
  L: 'ArrowLeft',
  R: 'ArrowRight',
} as const;
const board = () => screen.getByLabelText(/^关卡棋盘/);
const play = (moves: string) => {
  for (const m of moves)
    fireEvent.keyDown(board(), { key: KEY[m as keyof typeof KEY] });
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('改写规则', () => {
  it('按参考解走完第一关，过关并记下步数，可进入下一关', () => {
    render(<RuleWords />);
    play(LEVELS[0].solution);
    expect(document.querySelector('output.kit-ok')?.textContent).toMatch(
      /过关！/,
    );
    expect(
      JSON.parse(localStorage.getItem(RULEWORDS_RECORDS_KEY)!).best[
        LEVELS[0].id
      ],
    ).toBe(LEVELS[0].solution.length);
    fireEvent.click(screen.getByRole('button', { name: /下一关 \(N\)/ }));
    expect(
      screen.getByRole('heading', { name: new RegExp(LEVELS[1].name) }),
    ).toBeTruthy();
  });

  it('撤销与重来恢复步数；拆掉规则后列表更新', () => {
    render(<RuleWords />);
    fireEvent.change(screen.getByLabelText('选择关卡'), {
      target: { value: '2' },
    });
    expect(screen.getByText('墙 是 挡')).toBeTruthy();
    play(LEVELS[2].solution.slice(0, 3));
    expect(screen.queryByText('墙 是 挡')).toBeNull();
    fireEvent.keyDown(board(), { key: 'z' });
    expect(screen.getByText('墙 是 挡')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重来/ }));
    expect(
      screen.getByRole('button', { name: /撤销/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('“你”被岩浆吞掉后提示撤销', () => {
    render(<RuleWords />);
    fireEvent.change(screen.getByLabelText('选择关卡'), {
      target: { value: '3' },
    });
    play('RRRR');
    expect(screen.getByText(/没有“你”了/)).toBeTruthy();
  });
});
