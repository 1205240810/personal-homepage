import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangtonAnt } from '../../../components/games/langton';
import { LANGTON_RECORDS_KEY } from '../../../lib/games/langton';

const steps = () => screen.getByTestId('langton-steps').textContent;
const ants = () => screen.getByTestId('langton-ants').textContent;
const press = (key: string) =>
  fireEvent.keyDown(screen.getByLabelText(/朗顿蚂蚁棋盘/), { key });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('朗顿蚂蚁', () => {
  it('单步、+1000、键盘 N 与 A 放蚂蚁', () => {
    render(
      <StrictMode>
        <LangtonAnt />
      </StrictMode>,
    );
    expect(steps()).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /单步/ }));
    expect(steps()).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '+1000' }));
    expect(steps()).toBe('1,001');
    press('n');
    expect(steps()).toBe('1,002');
    press('a');
    expect(ants()).toBe('2');
    for (let i = 0; i < 10; i++) press('a');
    expect(ants()).toBe('8');
    expect(screen.getByText('最多 8 只蚂蚁')).toBeTruthy();
  });

  it('自定义规则：非法给出原因，合法则重置并更新预设', () => {
    render(<LangtonAnt />);
    const input = screen.getByLabelText('转向规则');
    fireEvent.change(input, { target: { value: 'rxl' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText(/只能用 L、R、N/).length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: 'llrr' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect(screen.getByText('TURMITE · LLRR')).toBeTruthy();
    expect(
      (screen.getByRole('combobox', { name: '预设规则' }) as HTMLSelectElement)
        .value,
    ).toBe('llrr');
    fireEvent.change(screen.getByRole('combobox', { name: '预设规则' }), {
      target: { value: 'rlr' },
    });
    expect(screen.getByText('TURMITE · RLR')).toBeTruthy();
  });

  it('重置时保存本规则走过的最长步数', () => {
    render(<LangtonAnt />);
    fireEvent.click(screen.getByRole('button', { name: '+1000' }));
    fireEvent.click(screen.getByRole('button', { name: /重置/ }));
    expect(steps()).toBe('0');
    expect(
      JSON.parse(localStorage.getItem(LANGTON_RECORDS_KEY)!).rules.RL.maxSteps,
    ).toBe(1000);
    expect(screen.getByText(/本机最长 1,000 步/)).toBeTruthy();
  });
});

describe('朗顿蚂蚁高速路', () => {
  it('手动推进到 11000 步时提示高速路并记下', () => {
    render(<LangtonAnt />);
    for (let i = 0; i < 11; i++)
      fireEvent.click(screen.getByRole('button', { name: '+1000' }));
    expect(screen.getByTestId('langton-highway').textContent).toMatch(
      /每 104 步/,
    );
    expect(
      JSON.parse(localStorage.getItem(LANGTON_RECORDS_KEY)!).rules.RL.highway,
    ).toBeGreaterThan(9000);
  });
});
