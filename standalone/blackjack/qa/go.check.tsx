import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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
    expect(screen.getByText(/不对。/)).toBeTruthy();
    expect(screen.getByText(/为什么不行/).parentElement!.textContent).toMatch(
      /自己的眼位.*白 B9/,
    );
    fireEvent.click(screen.getByRole('button', { name: /重来/ }));
    fireEvent.click(pt(1));
    expect(screen.getByText(/活了！/)).toBeTruthy();
  });

  it('对局：落子后 AI 应着，悔棋回到开局', async () => {
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '1' },
    });
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

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  message: { type: string; level?: number; state: { board: number[] } } | null =
    null;
  terminated = false;
  constructor() {
    TestWorker.instances.push(this);
  }
  postMessage(message: TestWorker['message']) {
    this.message = message;
  }
  terminate() {
    this.terminated = true;
  }
  reply(result: unknown) {
    this.onmessage?.({ data: { id: 1, result } });
  }
}
const workers = () => TestWorker.instances;
const reply = async (worker: TestWorker, result: unknown) => {
  await act(async () => {
    worker.reply(result);
  });
};
const move = (point: number) => ({ move: point, winrate: 0.5, playouts: 1 });

describe('围棋的对局隔离与数子', () => {
  beforeEach(() => {
    TestWorker.instances = [];
    vi.stubGlobal('Worker', TestWorker);
  });

  it('AI 思考期间同色重新开局会中止旧任务，不让旧棋落入新局', async () => {
    render(<GoGame />);
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    const old = workers().at(-1)!;
    fireEvent.change(screen.getByLabelText('棋盘'), {
      target: { value: '13' },
    });
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    const current = workers().at(-1)!;
    expect(old.terminated).toBe(true);
    expect(current).not.toBe(old);
    expect(current.message!.state.board).toHaveLength(169);
    await reply(old, move(40));
    expect(document.querySelectorAll('.go-stone')).toHaveLength(0);
    await reply(current, move(84));
    expect(pt(84).getAttribute('aria-label')).toContain('黑子');
    expect(document.querySelectorAll('.go-stone')).toHaveLength(1);
  });

  it('估计死子期间禁止提前结算，离开数子会取消旧估计', async () => {
    render(<GoGame />);
    fireEvent.click(screen.getByRole('button', { name: /虚手/ }));
    await reply(workers().at(-1)!, move(-1));
    const dead = workers().at(-1)!;
    expect(dead.message!.type).toBe('dead');
    expect(
      (screen.getByRole('button', { name: '确认结算' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    expect(dead.terminated).toBe(true);
    await reply(dead, [40]);
    expect(pt(40).getAttribute('aria-label')).not.toContain('死');
    expect(screen.queryByText(/已自动标记/)).toBeNull();
  });

  it('死子估计完成后可手工改判，再确认仅记一局', async () => {
    render(<GoGame />);
    fireEvent.click(pt(40));
    await reply(workers().at(-1)!, move(-1));
    fireEvent.click(screen.getByRole('button', { name: /虚手/ }));
    const dead = workers().at(-1)!;
    fireEvent.click(pt(40));
    expect(pt(40).getAttribute('aria-label')).not.toContain('死');
    await reply(dead, [40]);
    expect(pt(40).getAttribute('aria-label')).toContain('死');
    fireEvent.click(pt(40));
    expect(pt(40).getAttribute('aria-label')).not.toContain('死');
    fireEvent.click(screen.getByRole('button', { name: '确认结算' }));
    expect(
      JSON.parse(localStorage.getItem(GO_RECORDS_KEY)!).games['9-2'].played,
    ).toBe(1);
    expect(
      (screen.getByRole('button', { name: /悔棋/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('当前对局保留开局难度，设置只影响下局；切回小棋盘限制让子', () => {
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '4' },
    });
    fireEvent.click(pt(40));
    expect(workers().at(-1)!.message!.level).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /认输/ }));
    expect(workers().at(-1)!.terminated).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(GO_RECORDS_KEY)!).games['9-2'].played,
    ).toBe(1);
    fireEvent.change(screen.getByLabelText('棋盘'), {
      target: { value: '19' },
    });
    fireEvent.change(screen.getByLabelText('让子'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('棋盘'), { target: { value: '9' } });
    expect((screen.getByLabelText('让子') as HTMLSelectElement).value).toBe(
      '5',
    );
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    expect(screen.getByText(/让 5 子，贴 0.5/)).toBeTruthy();
    expect(document.querySelectorAll('.go-stone.is-black')).toHaveLength(5);
  });

  it('Worker 加载失败会回退计算，不会永久停在思考中', async () => {
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    act(() =>
      workers()
        .at(-1)!
        .onerror?.({ preventDefault() {} }),
    );
    await waitFor(() => expect(screen.getByText(/轮到你/)).toBeTruthy());
    expect(document.querySelectorAll('.go-stone.is-black')).toHaveLength(1);
  });

  it('死活题悔棋同时撤销白应手，之后仍可继续解题', () => {
    render(<GoGame />);
    openProblem('straight-three-kill');
    fireEvent.click(pt(1));
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(pt(1).getAttribute('aria-label')).not.toContain('黑子');
    fireEvent.click(pt(1));
    expect(screen.getByText(/好棋！白 A9/)).toBeTruthy();
    fireEvent.click(pt(2));
    expect(screen.getByText(/提掉了！正解/)).toBeTruthy();
  });

  it('组合方向键保留浏览器行为', () => {
    render(<GoGame />);
    pt(40).focus();
    expect(fireEvent.keyDown(pt(40), { key: 'ArrowLeft', altKey: true })).toBe(
      true,
    );
    expect(document.activeElement).toBe(pt(40));
  });
});

it('双活题：虚手才是正解；乱紧公气会被提，解析可展开', () => {
  render(<GoGame />);
  openProblem('seki-pass');
  fireEvent.click(pt(0));
  expect(screen.getByText(/为什么不行/).parentElement!.textContent).toMatch(
    /紧掉了自己的气/,
  );
  fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
  expect(screen.queryByText(/为什么不行/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /虚手/ }));
  expect(screen.getByText(/活了！/)).toBeTruthy();
  expect(screen.getByText(/解析：/).parentElement!.textContent).toMatch(/双活/);
});

it('非双活题不能虚手；解析按钮展开要点', () => {
  render(<GoGame />);
  openProblem('plum-five-kill');
  fireEvent.click(screen.getByRole('button', { name: /虚手/ }));
  expect(screen.getByText(/需要落子/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /解析/ }));
  expect(screen.getByText(/解析：/).parentElement!.textContent).toMatch(
    /梅花五/,
  );
});

it('接不归的另一条正确线路仍会提示当前可落的正解', () => {
  render(<GoGame />);
  openProblem('cut-no-return');
  fireEvent.click(pt(11));
  fireEvent.click(screen.getByRole('button', { name: /提示/ }));
  expect(document.activeElement).toBe(pt(3));
  fireEvent.click(pt(3));
  expect(screen.getByText(/提掉了！正解/)).toBeTruthy();
});

it('后台无响应时限时回退，数子无响应时可改用手工标记', async () => {
  vi.useFakeTimers();
  TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
  render(<GoGame />);
  fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
  const stalled = workers().at(-1)!;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9001);
  });
  expect(stalled.terminated).toBe(true);
  expect(screen.getByText(/轮到你/)).toBeTruthy();
  expect(screen.getByText(/已切换入门强度兼容计算/)).toBeTruthy();
  expect(screen.getByText(/GO · 9 路 · 1 · 刚学规则 · 执白/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /虚手/ }));
  await reply(workers().at(-1)!, move(-1));
  const dead = workers().at(-1)!;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5001);
  });
  expect(dead.terminated).toBe(true);
  expect(screen.getByText(/请点棋块手动标记死子/)).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: '确认结算' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
