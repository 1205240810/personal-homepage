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
  it.each(LEVELS)('关卡 $id 可从界面通关、撤销并重来', (level) => {
    render(<RuleWords />);
    fireEvent.change(screen.getByLabelText('选择关卡'), {
      target: { value: String(LEVELS.indexOf(level)) },
    });
    play(level.solution);
    expect(document.querySelector('output.kit-ok')).toBeTruthy();
    fireEvent.keyDown(board(), { key: 'z' });
    expect(document.querySelector('output.kit-ok')).toBeNull();
    play(level.solution.slice(-1));
    expect(document.querySelector('output.kit-ok')).toBeTruthy();
    fireEvent.keyDown(board(), { key: 'r' });
    expect(
      screen.getByRole('button', { name: /撤销/ }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(RULEWORDS_RECORDS_KEY)!).best[level.id],
    ).toBe(level.solution.length);
  });

  it('浏览器组合键不会改变棋盘，刷新后保留已通关记录', () => {
    const view = render(<RuleWords />);
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey'])
      fireEvent.keyDown(board(), { key: 'ArrowRight', [modifier]: true });
    expect(
      screen.getByRole('button', { name: /撤销/ }).hasAttribute('disabled'),
    ).toBe(true);
    play(LEVELS[0].solution);
    view.unmount();
    render(<RuleWords />);
    expect(screen.getByText('最少 6 步')).toBeTruthy();
  });

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
    const next = screen.getByRole('button', { name: /下一关 \(N\)/ });
    next.focus();
    fireEvent.click(next);
    expect(
      screen.getByRole('heading', { name: new RegExp(LEVELS[1].name) }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(board());
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
    const retry = document.querySelector('.game-result button') as HTMLElement;
    retry.focus();
    fireEvent.keyDown(retry, { key: 'r' });
    expect(document.querySelector('.game-result')).toBeNull();
    expect(document.activeElement).toBe(board());
  });
});
