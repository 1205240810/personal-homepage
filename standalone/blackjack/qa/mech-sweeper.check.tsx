import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MechSweeper } from '../../../components/games/mech-sweeper';
import {
  SWEEPER_RECORDS_KEY,
  dailySweeperSeed,
  generateSweeperField,
} from '../../../lib/games/mech-sweeper';

function cells() {
  return within(screen.getByRole('group', { name: /检修舱$/ })).getAllByRole(
    'button',
  );
}
function mount() {
  return render(
    <StrictMode>
      <div className="sweeper-stage">
        <MechSweeper />
      </div>
    </StrictMode>,
  );
}
function todayField(level: 'cadet' | 'tech' | 'chief' = 'cadet') {
  const d = new Date();
  return generateSweeperField(
    level,
    dailySweeperSeed(d.getFullYear(), d.getMonth() + 1, d.getDate(), level),
  );
}
const label = (i: number) => cells()[i].getAttribute('aria-label') ?? '';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('机甲扫雷', () => {
  it('从扫描起点开局，扫开全部安全格后通关并保存记录', () => {
    mount();
    const field = todayField();
    expect(cells()).toHaveLength(64);
    expect(label(field.start)).toMatch(/扫描起点/);
    fireEvent.click(cells()[field.start]);
    field.mines.forEach((mine, i) => {
      if (!mine && /未扫描/.test(label(i))) fireEvent.click(cells()[i]);
    });
    expect(screen.getByText(/检修完成/)).toBeTruthy();
    expect(screen.getByText(/，零短路。/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(SWEEPER_RECORDS_KEY)!);
    expect(saved.cadet).toMatchObject({ wins: 1, clean: 1 });
    expect(screen.getByText(/通关 1 次/)).toBeTruthy();
  });

  it('首次点到故障也安全；保险丝挡一次，第二次短路并可重试本张', () => {
    mount();
    const field = todayField();
    const faults = field.mines.flatMap((m, i) => (m ? [i] : []));
    fireEvent.click(cells()[faults[0]]);
    expect(label(faults[0])).not.toMatch(/故障|短路/);
    // The rescued fault moved; find two faults that are still hidden.
    const hidden = faults.filter(
      (i) => i !== faults[0] && /未扫描/.test(label(i)),
    );
    fireEvent.click(cells()[hidden[0]]);
    expect(screen.getByText(/保险丝熔断/)).toBeTruthy();
    expect(label(hidden[0])).toMatch(/保险丝熔断/);
    fireEvent.click(cells()[hidden[1]]);
    expect(screen.getByText(/短路了/)).toBeTruthy();
    expect(label(hidden[1])).toMatch(/短路点/);
    fireEvent.click(screen.getByRole('button', { name: /重试本张/ }));
    expect(label(field.start)).toMatch(/扫描起点/);
    expect(localStorage.getItem(SWEEPER_RECORDS_KEY)).toBeNull();
  });

  it('右键、标记模式和触控长按都能插旗，长按后不会误扫', () => {
    vi.useFakeTimers();
    mount();
    const field = todayField();
    fireEvent.contextMenu(cells()[0]);
    expect(label(0)).toMatch(/检修旗/);
    fireEvent.contextMenu(cells()[0]);
    expect(label(0)).toMatch(/未扫描/);

    fireEvent.click(screen.getByRole('button', { name: '标记' }));
    fireEvent.click(cells()[1]);
    expect(label(1)).toMatch(/检修旗/);
    fireEvent.click(screen.getByRole('button', { name: '标记' }));

    const target = field.start;
    fireEvent.pointerDown(cells()[target], { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(cells()[target], { pointerType: 'touch' });
    fireEvent.click(cells()[target]);
    expect(label(target)).toMatch(/检修旗/);

    // A short tap still scans.
    fireEvent.pointerDown(cells()[target], { pointerType: 'touch' });
    fireEvent.pointerUp(cells()[target], { pointerType: 'touch' });
    fireEvent.contextMenu(cells()[target]);
    fireEvent.click(cells()[target]);
    expect(label(target)).toMatch(/安全|信号/);
  });

  it('键盘：方向键移动焦点，F 插旗；切换难度与随机编号', () => {
    mount();
    const field = todayField();
    const start = cells()[field.start];
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells()[field.start + 1]);
    fireEvent.keyDown(cells()[field.start + 1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cells()[field.start + 9]);
    fireEvent.keyDown(cells()[field.start + 9], { key: 'f' });
    expect(label(field.start + 9)).toMatch(/检修旗/);

    fireEvent.click(screen.getByRole('button', { name: /总工/ }));
    expect(cells()).toHaveLength(192);
    fireEvent.click(screen.getByRole('button', { name: /换一张/ }));
    expect(screen.getByText(/扫描编号 #/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /回到今日/ }));
    expect(screen.getByText(/今日检修/)).toBeTruthy();
  });

  it('坏记录或存储不可用都不影响开局', () => {
    localStorage.setItem(SWEEPER_RECORDS_KEY, '{oops');
    mount();
    expect(screen.getByText(/旧记录无法读取/)).toBeTruthy();
    cleanup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    mount();
    expect(cells()).toHaveLength(64);
    expect(screen.getByText(/无法保存记录/)).toBeTruthy();
  });

  it('服务端预览与首次 hydration 一致', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<MechSweeper />);
    document.body.append(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <MechSweeper />, {
        onRecoverableError: (error) => {
          throw error;
        },
      });
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/今日检修/);
    act(() => root!.unmount());
    container.remove();
  });
});
