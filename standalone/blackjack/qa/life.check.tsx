import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LifeSandbox } from '../../../components/games/life-sandbox';
import {
  CHALLENGE_BOARD,
  LIFE_RECORDS_KEY,
  challengeZone,
  dailyChallenge,
  getChallenge,
} from '../../../lib/games/life';

function mount() {
  return render(
    <StrictMode>
      <div className="life-stage">
        <LifeSandbox />
      </div>
    </StrictMode>,
  );
}
const board = () => screen.getByLabelText(/生命游戏棋盘/);
const gen = () => Number(screen.getByTestId('life-generation').textContent);
const pop = () => Number(screen.getByTestId('life-population').textContent);
const key = (k: string, opts: Record<string, unknown> = {}) =>
  fireEvent.keyDown(board(), { key: k, ...opts });
function moveTo(x: number, y: number) {
  for (let i = 0; i < Math.floor(x / 5); i++)
    key('ArrowRight', { shiftKey: true });
  for (let i = 0; i < x % 5; i++) key('ArrowRight');
  for (let i = 0; i < Math.floor(y / 5); i++)
    key('ArrowDown', { shiftKey: true });
  for (let i = 0; i < y % 5; i++) key('ArrowDown');
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('生命游戏沙盒', () => {
  it('键盘光标逐格编辑，单步演化并更新代数和人口', () => {
    mount();
    board().focus();
    moveTo(10, 10);
    key('Enter');
    expect(pop()).toBe(1);
    expect(screen.getByText(/第 11 行第 11 列点亮/)).toBeTruthy();
    key('Enter');
    expect(pop()).toBe(0);
    // A blinker stays at 3 cells and flips each generation.
    key('Enter');
    key('ArrowRight');
    key('Enter');
    key('ArrowRight');
    key('Enter');
    expect(pop()).toBe(3);
    key('n');
    key('n');
    expect(gen()).toBe(2);
    expect(pop()).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: '回到第 0 代' }));
    expect(gen()).toBe(0);
    expect(pop()).toBe(3);
  });

  it('图案库盖章可旋转；随机与清空可用', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^滑翔机/ }));
    expect(
      screen.getByRole('button', { name: /图案/, pressed: true }),
    ).toBeTruthy();
    key('e');
    expect(screen.getByText(/滑翔机 · 3×3 · 90°/)).toBeTruthy();
    board().focus();
    moveTo(20, 20);
    key('Enter');
    expect(pop()).toBe(5);
    for (let i = 0; i < 4; i++) key('n');
    expect(gen()).toBe(4);
    expect(pop()).toBe(5);
    key('c');
    expect(pop()).toBe(0);
    expect(gen()).toBe(0);
    key('r');
    expect(pop()).toBeGreaterThan(1000);
  });

  it('挑战：建造区外不能画，R 五格通过长引线并保存最少格数', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /挑战/ }));
    fireEvent.click(screen.getByRole('button', { name: /长引线/ }));
    fireEvent.click(screen.getByRole('button', { name: '验证' }));
    expect(screen.getByRole('status').textContent).toMatch(
      /先在建造区里画几个细胞/,
    );
    board().focus();
    key('Enter');
    expect(screen.getByText('这里在建造区外')).toBeTruthy();
    expect(pop()).toBe(0);
    const z = challengeZone(getChallenge('long-fuse')!);
    expect(z.x + z.width).toBeLessThanOrEqual(CHALLENGE_BOARD.width);
    fireEvent.click(screen.getByRole('button', { name: /R 五格/ }));
    moveTo(z.x + 1, z.y + 1);
    key('Enter');
    expect(pop()).toBe(5);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '验证' }));
    });
    expect(screen.getByRole('status').textContent).toMatch(/✓ 通过（5 格）/);
    const saved = JSON.parse(localStorage.getItem(LIFE_RECORDS_KEY)!);
    expect(saved.best['long-fuse']).toBe(5);
    expect(screen.getByText('最佳 5 格')).toBeTruthy();
    key('d');
    key('Enter');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('今日引线：通过后记下今天', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /挑战/ }));
    fireEvent.click(screen.getByRole('button', { name: /今日引线/ }));
    fireEvent.click(screen.getByRole('button', { name: /R 五格/ }));
    board().focus();
    moveTo(30, 22);
    key('Enter');
    fireEvent.click(screen.getByRole('button', { name: '验证' }));
    expect(screen.getByRole('status').textContent).toMatch(/✓ 通过/);
    expect(
      JSON.parse(localStorage.getItem(LIFE_RECORDS_KEY)!).daily,
    ).toHaveLength(1);
    expect(screen.getByText('今日已完成')).toBeTruthy();
  });

  it('跨午夜仍验证已开始的每日题，重新选择才换到新日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59));
    mount();
    fireEvent.click(screen.getByRole('button', { name: /挑战/ }));
    fireEvent.click(screen.getByRole('button', { name: /今日引线/ }));
    const original = dailyChallenge({ year: 2026, month: 10, day: 13 });
    fireEvent.click(screen.getByRole('button', { name: /R 五格/ }));
    moveTo(30, 22);
    key('Enter');
    vi.setSystemTime(new Date(2026, 9, 14, 0, 1));
    key('n');
    expect(screen.getByText(original.brief, { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '验证' }));
    expect(JSON.parse(localStorage.getItem(LIFE_RECORDS_KEY)!).daily).toEqual([
      '2026-10-13',
    ]);
    fireEvent.click(screen.getByRole('button', { name: /今日引线/ }));
    expect(gen()).toBe(0);
    expect(pop()).toBe(0);
    expect(screen.getByText('每天一题')).toBeTruthy();
    expect(
      screen.getByText(
        dailyChallenge({ year: 2026, month: 10, day: 14 }).brief,
        { exact: false },
      ),
    ).toBeTruthy();
  });
});
