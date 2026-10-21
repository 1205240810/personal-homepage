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
  vi.useRealTimers();
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

  it.each([
    { kind: '正读数', day: 20, positive: true },
    { kind: '全零读数', day: 21, positive: false },
  ])(
    '$kind 传感器显示状态、高亮模块，并在矛盾出现和解除时更新提示',
    ({ day, positive }) => {
      // Both are valid daily puzzles. In particular, a panel of zero readings
      // can uniquely locate the faults outside all of its sensors.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, day, 12));
      mount();
      const p = todayPuzzle();
      if (!positive)
        expect(p.readings.every((reading) => reading === 0)).toBe(true);
      const index = p.readings.findIndex(
        (reading, i) =>
          p.sensors[i].kind === 'row' &&
          (positive ? reading > 0 : reading === 0),
      );
      expect(index).toBeGreaterThanOrEqual(0);
      const sensors = screen.getAllByRole('button', { name: /传感器，读数/ });
      expect(sensors).toHaveLength(p.sensors.length);
      // Panel DOM order is nodes, rows, columns; locate the actual row by name.
      const sensor = screen.getByRole('button', {
        name: new RegExp(
          `^第 ${p.sensors[index].at + 1} 行总线传感器，读数 ${p.readings[index]}，`,
        ),
      });
      const connected = p.sensors[index].cells;
      fireEvent.click(sensor);
      expect(sensor.getAttribute('aria-pressed')).toBe('true');
      expect(
        cells().flatMap((c, i) => (c.classList.contains('is-lit') ? [i] : [])),
      ).toEqual(connected);
      expect(screen.queryByText(/对不上/)).toBeNull();

      if (positive) {
        // No possible fault remains to satisfy a positive reading.
        for (const c of connected) {
          fireEvent.click(cells()[c]);
          fireEvent.click(cells()[c]);
        }
      } else {
        // A single marked fault already exceeds a zero reading.
        fireEvent.click(cells()[connected[0]]);
      }
      expect(sensor.getAttribute('aria-label')).toMatch(/与标记矛盾/);
      expect(screen.getByText(/对不上/)).toBeTruthy();

      for (const c of positive ? connected : [connected[0]]) {
        fireEvent.click(cells()[c]);
      }
      expect(sensor.getAttribute('aria-label')).not.toMatch(/与标记矛盾/);
      expect(screen.queryByText(/对不上/)).toBeNull();
    },
  );

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

  it('浏览器组合快捷键不修改模块标记或被游戏拦截', () => {
    mount();
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
      expect(
        fireEvent.keyDown(cells()[0], { key: 'f', [modifier]: true }),
      ).toBe(true);
      expect(label(0)).toMatch(/未判断/);
    }
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
