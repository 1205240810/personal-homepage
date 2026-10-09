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
import { CircuitRepair } from '../../../components/games/circuit-repair';
import { CIRCUIT_RECORDS_KEY } from '../../../lib/games/circuit-repair';

function cells() {
  return within(screen.getByRole('group', { name: /线路板/ })).getAllByRole(
    'button',
  );
}
function mount() {
  return render(
    <StrictMode>
      <div className="circuit-stage">
        <CircuitRepair />
      </div>
    </StrictMode>,
  );
}
function moveCount() {
  return screen.getByText('步').querySelector('strong')?.textContent;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('线路检修', () => {
  it('跟随提示修好今日线路，并把最佳记录保存在本机', () => {
    mount();
    expect(cells()).toHaveLength(25);
    for (let guard = 0; guard < 30; guard += 1) {
      if (screen.queryByText(/全部接通/)) break;
      fireEvent.click(screen.getByRole('button', { name: /提示/ }));
      const target = cells().find((cell) =>
        /建议顺时针转/.test(cell.getAttribute('aria-label') ?? ''),
      )!;
      const turns = Number(
        /建议顺时针转 (\d) 次/.exec(target.getAttribute('aria-label')!)![1],
      );
      for (let i = 0; i < turns; i += 1) fireEvent.click(target);
    }
    expect(screen.getByText(/全部接通/)).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(CIRCUIT_RECORDS_KEY)!);
    expect(saved['5'].solved).toBe(1);
    expect(screen.getByText(/已修好 1 次/)).toBeTruthy();
  });

  it('撤回、逆时针与锁定都按预期作用于线路块', () => {
    mount();
    const first = cells()[0];
    const before = first.getAttribute('aria-label');
    fireEvent.click(first);
    expect(moveCount()).toBe('01');
    fireEvent.click(screen.getByRole('button', { name: '撤回上一次旋转' }));
    expect(moveCount()).toBe('00');
    expect(cells()[0].getAttribute('aria-label')).toBe(before);

    fireEvent.contextMenu(cells()[0]);
    fireEvent.click(cells()[0]);
    expect(moveCount()).toBe('02');
    expect(cells()[0].getAttribute('aria-label')).toBe(before);

    fireEvent.click(screen.getByRole('button', { name: '锁定' }));
    fireEvent.click(cells()[0]);
    fireEvent.click(screen.getByRole('button', { name: '锁定' }));
    fireEvent.click(cells()[0]);
    expect(cells()[0].getAttribute('aria-label')).toMatch(/已锁定/);
    expect(moveCount()).toBe('02');
  });

  it('切换尺寸与随机线路，方向键在格子之间移动焦点', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /挑战/ }));
    expect(cells()).toHaveLength(49);
    fireEvent.click(screen.getByRole('button', { name: /换一张/ }));
    expect(screen.getByText(/线路编号 #/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /回到今日/ }));
    expect(screen.getByText(/今日线路/)).toBeTruthy();
    const start = cells()[24];
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells()[25]);
    fireEvent.keyDown(cells()[25], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cells()[18]);
  });

  it('坏记录或存储不可用都不影响开局', () => {
    localStorage.setItem(CIRCUIT_RECORDS_KEY, '{oops');
    mount();
    expect(screen.getByText(/旧记录无法读取/)).toBeTruthy();
    cleanup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    mount();
    expect(cells()).toHaveLength(25);
    expect(screen.getByText(/无法保存记录/)).toBeTruthy();
  });

  it('服务端预览与首次 hydration 一致', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<CircuitRepair />);
    document.body.append(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <CircuitRepair />, {
        onRecoverableError: (error) => {
          throw error;
        },
      });
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/今日线路/);
    act(() => root!.unmount());
    container.remove();
  });
});
