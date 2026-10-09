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
import { FaultFinder } from '../../../components/games/fault-finder';
import {
  FAULT_RECORDS_KEY,
  dailyFaultSeed,
  generateFaultPuzzle,
  type FaultLevelId,
} from '../../../lib/games/fault-finder';

function cells() {
  return within(screen.getByRole('group', { name: /模块舱$/ })).getAllByRole(
    'button',
  );
}
function mount() {
  return render(
    <StrictMode>
      <div className="fault-stage">
        <FaultFinder />
      </div>
    </StrictMode>,
  );
}
function todayPuzzle(level: FaultLevelId = 'tech') {
  const d = new Date();
  return generateFaultPuzzle(
    level,
    dailyFaultSeed(d.getFullYear(), d.getMonth() + 1, d.getDate(), level),
  );
}
const label = (i: number) => cells()[i].getAttribute('aria-label') ?? '';
const submit = () => screen.getByRole('button', { name: /提交诊断/ });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('故障排查', () => {
  it('标出全部故障并提交，诊断正确后保存记录和今日完成', () => {
    mount();
    const p = todayPuzzle();
    expect(cells()).toHaveLength(16);
    expect(submit()).toHaveProperty('disabled', true);
    for (const f of p.faults) fireEvent.click(cells()[f]);
    expect(label(p.faults[0])).toMatch(/标记为故障/);
    expect(submit()).toHaveProperty('disabled', false);
    fireEvent.click(submit());
    expect(screen.getByText(/诊断正确/)).toBeTruthy();
    expect(screen.getByText(/一次命中、零提示/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(FAULT_RECORDS_KEY)!);
    expect(saved.best.tech).toMatchObject({ solved: 1, clean: 1 });
    expect(saved.daily).toHaveLength(1);
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText(/通关 1 次/)).toBeTruthy();
  });

  it('点击循环「故障 → 正常 → 未判断」，同一帧连点也不会互相覆盖', () => {
    mount();
    act(() => {
      cells()[0].click();
      cells()[1].click();
      cells()[1].click();
    });
    expect(label(0)).toMatch(/标记为故障/);
    expect(label(1)).toMatch(/标记为正常/);
    fireEvent.click(cells()[1]);
    expect(label(1)).toMatch(/未判断/);
  });

  it('误诊扣一次机会并给出命中数，用完后亮出答案并可重试本张', () => {
    mount();
    const p = todayPuzzle();
    const healthy = Array.from({ length: 16 }, (_, i) => i).filter(
      (i) => !p.faults.includes(i),
    );
    for (const c of healthy.slice(0, 2)) fireEvent.click(cells()[c]);
    fireEvent.click(submit());
    expect(
      screen.getByText(/诊断有误.*有 0 个是真故障.*还能再提交 2 次/),
    ).toBeTruthy();
    fireEvent.click(submit());
    fireEvent.click(submit());
    expect(screen.getByText(/提交机会用完了/)).toBeTruthy();
    expect(label(p.faults[0])).toMatch(/真正的故障/);
    expect(localStorage.getItem(FAULT_RECORDS_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /重试本张/ }));
    expect(label(healthy[0])).toMatch(/未判断/);
  });

  it('传感器显示读数与状态，点击高亮它连着的模块；矛盾时提示', () => {
    mount();
    const p = todayPuzzle();
    const sensor = screen.getAllByRole('button', { name: /传感器，读数/ })[0];
    expect(
      screen.getAllByRole('button', { name: /传感器，读数/ }),
    ).toHaveLength(p.sensors.length);
    fireEvent.click(sensor);
    expect(sensor.getAttribute('aria-pressed')).toBe('true');
    const lit = cells().filter((c) => c.classList.contains('is-lit'));
    expect(lit.length).toBe(p.sensors[0].cells.length);
    // Marking every module of a sensor as healthy contradicts any reading > 0.
    const busy = p.sensors.findIndex((_, i) => p.readings[i] > 0);
    for (const c of p.sensors[busy].cells) {
      fireEvent.click(cells()[c]);
      fireEvent.click(cells()[c]);
    }
    expect(screen.getByText(/对不上/)).toBeTruthy();
  });

  it('提示指向一个模块、不算无误通关；键盘 F/X/Delete 与方向键可用', () => {
    mount();
    const p = todayPuzzle();
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    const hinted = cells().findIndex((c) =>
      /提示所指/.test(c.getAttribute('aria-label')!),
    );
    expect(hinted).toBeGreaterThanOrEqual(0);
    expect(document.activeElement).toBe(cells()[hinted]);
    const first = cells()[0];
    first.focus();
    fireEvent.keyDown(first, { key: 'f' });
    expect(label(0)).toMatch(/标记为故障/);
    fireEvent.keyDown(first, { key: 'x' });
    expect(label(0)).toMatch(/标记为正常/);
    fireEvent.keyDown(first, { key: 'Delete' });
    expect(label(0)).toMatch(/未判断/);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells()[1]);
    fireEvent.keyDown(cells()[1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cells()[5]);
    for (const f of p.faults) fireEvent.keyDown(cells()[f], { key: 'f' });
    fireEvent.click(submit());
    expect(screen.getByText(/提示 1 次/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(FAULT_RECORDS_KEY)!);
    expect(saved.best.tech).toMatchObject({ solved: 1, clean: 0 });
  });

  it('切换难度与随机工单，回到今日', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /总工/ }));
    expect(cells()).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: /换一张/ }));
    expect(screen.getByText(/工单编号 #/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /回到今日/ }));
    expect(screen.getByText(/今日排查/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /见习/ }));
    expect(cells()).toHaveLength(9);
  });

  it('坏记录或存储不可用都不影响开局', () => {
    localStorage.setItem(FAULT_RECORDS_KEY, '{oops');
    mount();
    expect(screen.getByText(/旧记录无法读取/)).toBeTruthy();
    cleanup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    mount();
    expect(cells()).toHaveLength(16);
    expect(screen.getByText(/无法保存记录/)).toBeTruthy();
  });

  it('服务端预览与首次 hydration 一致', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<FaultFinder />);
    document.body.append(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <FaultFinder />, {
        onRecoverableError: (error) => {
          throw error;
        },
      });
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/今日排查/);
    act(() => root!.unmount());
    container.remove();
  });
});
