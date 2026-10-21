import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GO_AUTO_RESIGN_KEY, GoGame } from '../../../components/games/go';
import { GO_RECORDS_KEY } from '../../../lib/games/go';
import * as GoAi from '../../../lib/games/go-ai';
import { GO_PROBLEMS as PROBLEMS } from '../../../lib/games/go-problems';

const pt = (p: number) =>
  document.querySelector<HTMLButtonElement>(`[data-pt="${p}"]`)!;
const openProblem = (id: string) =>
  fireEvent.change(screen.getByLabelText('模式'), {
    target: { value: String(PROBLEMS.findIndex((p) => p.id === id)) },
  });

beforeEach(() => localStorage.clear());
afterEach(() => {
  // Clear the external setting store while its subscribers still exist.
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it('开局按界面上显示的难度/棋盘/让子：水合前的选择不会被悄悄丢成入门', () => {
    render(<GoGame />);
    // A choice made before hydration changes the DOM but never fires onChange.
    const level = screen.getByLabelText<HTMLSelectElement>('难度（下局生效）');
    const size = screen.getByLabelText<HTMLSelectElement>('棋盘');
    level.value = '8';
    size.value = '13';
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    expect(screen.getByText(/13 路 · 8 · 强 · 执黑/)).toBeTruthy();
    expect(level.value).toBe('8');
    expect(document.querySelectorAll('.go-pt').length).toBe(169);
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
  message: {
    type: string;
    level?: number;
    komi?: number;
    state: { board: number[] };
  } | null = null;
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
const move = (point: number) => ({
  move: point,
  winrate: 0.5,
  blackWinrate: 0.5,
  lead: 0.5,
  playouts: 1,
});

describe('围棋的对局隔离与数子', () => {
  beforeEach(() => {
    TestWorker.instances = [];
    vi.stubGlobal('Worker', TestWorker);
  });

  it('实际 SSR 水合保留提前选择，读取自动认输设置后仍按所选棋盘、让子和难度发起搜索', async () => {
    localStorage.setItem(GO_AUTO_RESIGN_KEY, '0');
    const host = document.createElement('div');
    host.innerHTML = renderToString(<GoGame />);
    document.body.append(host);
    const select = (label: string) =>
      host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    select('棋盘').value = '13';
    select('难度（下局生效）').value = '8';
    select('让子').value = '5';
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(host, <GoGame />, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(select('棋盘').value).toBe('13');
      expect(select('难度（下局生效）').value).toBe('8');
      expect(select('让子').value).toBe('5');
      fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
      const search = workers().at(-1)!.message!;
      expect(search.level).toBe(8);
      expect(search.komi).toBe(0.5);
      expect(search.state.board).toHaveLength(169);
      expect(search.state.board.filter((x) => x === 1)).toHaveLength(5);
      expect(document.querySelectorAll('.go-pt')).toHaveLength(169);
      expect(errors).toEqual([]);
    } finally {
      act(() => root?.unmount());
      host.remove();
    }
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

  it('原生棋盘选择改回九路时把九子让棋收敛到五子，搜索和棋盘保持一致', () => {
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('棋盘'), {
      target: { value: '19' },
    });
    fireEvent.change(screen.getByLabelText('让子'), {
      target: { value: '9' },
    });
    screen.getByLabelText<HTMLSelectElement>('棋盘').value = '9';
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    const search = workers().at(-1)!.message!;
    expect(search.state.board).toHaveLength(81);
    expect(search.state.board.filter((x) => x === 1)).toHaveLength(5);
    expect(search.komi).toBe(0.5);
    expect(screen.getByLabelText<HTMLSelectElement>('让子').value).toBe('5');
    expect(document.querySelectorAll('.go-stone.is-black')).toHaveLength(5);
  });

  it('同一局复用空闲 Worker，重新开局和换难度清空旧搜索树', async () => {
    const view = render(<GoGame />);
    fireEvent.click(pt(40));
    const first = workers().at(-1)!;
    await reply(first, move(30));
    expect(first.terminated).toBe(false);
    fireEvent.click(pt(50));
    expect(workers()).toHaveLength(1);
    expect(first.message!.state.board[50]).toBe(1);
    await reply(first, move(31));
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    const fresh = workers().at(-1)!;
    expect(first.terminated).toBe(true);
    expect(fresh).not.toBe(first);
    expect(fresh.message!.level).toBe(10);
    expect(fresh.message!.state.board.every((x) => x === 0)).toBe(true);
    await reply(fresh, move(40));
    view.unmount();
    expect(fresh.terminated).toBe(true);
  });

  it('切题和悔棋释放空闲搜索树，错题说明不会残留到新对局', async () => {
    render(<GoGame />);
    fireEvent.click(pt(40));
    const first = workers().at(-1)!;
    await reply(first, move(30));
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(first.terminated).toBe(true);
    fireEvent.click(pt(50));
    const second = workers().at(-1)!;
    await reply(second, move(30));
    openProblem('straight-three-live');
    expect(second.terminated).toBe(true);
    fireEvent.click(pt(0));
    expect(screen.getByText(/为什么不行/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('模式'), {
      target: { value: '' },
    });
    expect(screen.queryByText(/为什么不行/)).toBeNull();
  });

  it('十档的八秒搜索不会被旧超时提前终止', async () => {
    vi.useFakeTimers();
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    const worker = workers().at(-1)!;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(worker.terminated).toBe(false);
    expect(screen.getByText(/AI 思考中/)).toBeTruthy();
    await reply(worker, move(40));
    expect(screen.getByText(/轮到你/)).toBeTruthy();
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

it('打劫题完成造劫目标，不宣称已经无条件做活', () => {
  render(<GoGame />);
  openProblem('ko-live');
  fireEvent.click(pt(4));
  expect(screen.getByText(/形成劫争！/)).toBeTruthy();
  expect(screen.queryByText(/活了！/)).toBeNull();
  expect(screen.getByText(/形成劫争！/).textContent).toMatch(/劫材/);
  expect(JSON.parse(localStorage.getItem(GO_RECORDS_KEY)!).problems).toContain(
    'ko-live',
  );
});

it('已经能活的直四允许虚手保留眼位', () => {
  render(<GoGame />);
  openProblem('straight-four-fill');
  fireEvent.click(screen.getByRole('button', { name: /虚手/ }));
  expect(screen.getByText(/活了！/)).toBeTruthy();
  expect(screen.getByText(/活了！/).textContent).toMatch(/限定区域/);
});

describe('围棋形势判断与 AI 认输', () => {
  beforeEach(() => {
    TestWorker.instances = [];
    vi.stubGlobal('Worker', TestWorker);
  });
  const judgeWorker = () =>
    workers().findLast((w) => w.message?.type === 'judge')!;
  const startAs = (level: string) => {
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: level },
    });
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
  };
  /** Human plays row 0/1 from the left, AI (white) the bottom rows. */
  const playRounds = async (
    rounds: number,
    ai: (i: number) => { winrate: number; lead?: number },
  ) => {
    for (let i = 0; i < rounds; i++) {
      fireEvent.click(pt(i));
      const w = workers().findLast((x) => x.message?.type === 'move')!;
      const r = ai(i);
      // AI plays white: black's share and lead mirror its own estimate.
      await reply(w, {
        move: 80 - i,
        playouts: 1,
        blackWinrate: 1 - r.winrate,
        lead: r.lead ?? 0.5,
        ...r,
      });
    }
  };

  it('形势判断：开关后请求判断，显示胜率目差和归属图，关闭后淡出', async () => {
    render(<GoGame />);
    startAs('2');
    fireEvent.click(screen.getByRole('button', { name: /形势判断/ }));
    expect(screen.getByText(/形势判断计算中/)).toBeTruthy();
    const own = Array.from({ length: 81 }, (_, p) =>
      p % 9 < 4 ? 0.9 : p % 9 > 4 ? -0.6 : 0,
    );
    await reply(judgeWorker(), {
      blackWinrate: 0.62,
      lead: 4.5,
      ownership: own,
      playouts: 100,
    });
    expect(
      screen.getByText(/黑胜率 62%，黑约领先 4.5 目.*黑 36 点 · 白 36 点/),
    ).toBeTruthy();
    expect(document.querySelectorAll('.go-own.is-black').length).toBe(36);
    expect(document.querySelectorAll('.go-own.is-white').length).toBe(36);
    expect(document.querySelector('.go-board.is-judging')).toBeTruthy();
    // A new move invalidates the overlay until the AI has replied.
    fireEvent.click(pt(40));
    expect(document.querySelectorAll('.go-own').length).toBe(0);
    expect(screen.getByText(/等 AI 落子后再判断/)).toBeTruthy();
    const moveWorker = workers().findLast((x) => x.message?.type === 'move')!;
    await reply(moveWorker, {
      move: 30,
      winrate: 0.4,
      blackWinrate: 0.6,
      lead: 2.5,
      playouts: 1,
    });
    expect(judgeWorker().message!.state.board[30]).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /形势判断/ }));
    expect(document.querySelector('.go-board.is-judging')).toBeNull();
    expect(screen.queryByText(/形势判断计算中/)).toBeNull();
  });

  it('AI 认输：开局再差也不认输，大势已去时认输并显示估计', async () => {
    render(<GoGame />);
    startAs('8');
    await playRounds(16, () => ({ winrate: 0.01, lead: 40 }));
    expect(screen.queryByText(/AI 认输/)).toBeNull();
    fireEvent.click(pt(16));
    const w = workers().findLast((x) => x.message?.type === 'move')!;
    await reply(w, {
      move: 64,
      winrate: 0.02,
      blackWinrate: 0.98,
      lead: 40,
      playouts: 1,
    });
    expect(
      screen.getAllByText(/AI 认输：估计胜率 2%，落后约 40 目.*你赢了/),
    ).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem(GO_RECORDS_KEY)!).games['9-8'].won,
    ).toBe(1);
  });

  it('AI 认输：关闭自动认输或入门档时继续下', async () => {
    render(<GoGame />);
    startAs('8');
    fireEvent.click(screen.getByLabelText('AI 自动认输'));
    await playRounds(18, () => ({ winrate: 0.01, lead: 40 }));
    expect(screen.queryByText(/AI 认输/)).toBeNull();
    cleanup();
    render(<GoGame />);
    startAs('1');
    await playRounds(18, () => ({ winrate: 0.01, lead: 40 }));
    expect(screen.queryByText(/AI 认输/)).toBeNull();
    expect(screen.getByText(/轮到你/)).toBeTruthy();
  });

  it('高档落子失败回退入门时，即使估计极差也不会用原难度自动认输', async () => {
    render(<GoGame />);
    startAs('8');
    await playRounds(16, () => ({ winrate: 0.01, lead: 40 }));
    vi.useFakeTimers();
    vi.spyOn(GoAi, 'chooseGoMove').mockReturnValue({
      move: 64,
      winrate: 0.01,
      blackWinrate: 0.99,
      lead: 40,
      playouts: 1,
    });
    fireEvent.click(pt(16));
    const failed = workers().findLast((w) => w.message?.type === 'move')!;
    act(() => failed.onerror?.({ preventDefault() {} }));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.queryByText(/AI 认输：/)).toBeNull();
    expect(screen.getByText(/轮到你/)).toBeTruthy();
    expect(screen.getByText(/GO · 9 路 · 1 · 刚学规则/)).toBeTruthy();
    expect(localStorage.getItem(GO_RECORDS_KEY)).toBeNull();
  });

  it.each(['write', 'read-and-write'])(
    '存储 %s 失败时设置仍可切换，同页面重新挂载仍保留并影响认输策略',
    async (failure) => {
      localStorage.setItem(GO_AUTO_RESIGN_KEY, '1');
      const read = Storage.prototype.getItem;
      if (failure === 'read-and-write') {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
          function (this: Storage, key) {
            if (key === GO_AUTO_RESIGN_KEY) throw new Error('storage denied');
            return read.call(this, key);
          },
        );
      }
      const write = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
        function (this: Storage, key, value) {
          if (key === GO_AUTO_RESIGN_KEY)
            throw new Error('storage unavailable');
          return write.call(this, key, value);
        },
      );
      render(<GoGame />);
      const box = () => screen.getByLabelText<HTMLInputElement>('AI 自动认输');
      fireEvent.click(box());
      expect(box().checked).toBe(false);
      fireEvent.click(box());
      expect(box().checked).toBe(true);
      fireEvent.click(box());
      cleanup();
      render(<GoGame />);
      expect(box().checked).toBe(false);
      startAs('8');
      await playRounds(18, () => ({ winrate: 0.01, lead: 40 }));
      expect(screen.queryByText(/AI 认输：/)).toBeNull();
      expect(screen.getByText(/轮到你/)).toBeTruthy();
      // An unrelated cross-tab write must not discard the session preference.
      act(() =>
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'unrelated', newValue: '1' }),
        ),
      );
      expect(box().checked).toBe(false);
    },
  );

  it('跨标签页修改或清空设置时同步开关，并取消进行中搜索的自动认输', async () => {
    render(<GoGame />);
    startAs('8');
    await playRounds(16, () => ({ winrate: 0.01, lead: 40 }));
    fireEvent.click(pt(16));
    const active = workers().findLast((w) => w.message?.type === 'move')!;
    localStorage.setItem(GO_AUTO_RESIGN_KEY, '0');
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: GO_AUTO_RESIGN_KEY, newValue: '0' }),
      ),
    );
    expect(screen.getByLabelText<HTMLInputElement>('AI 自动认输').checked).toBe(
      false,
    );
    await reply(active, {
      move: 64,
      winrate: 0.01,
      blackWinrate: 0.99,
      lead: 40,
      playouts: 1,
    });
    expect(screen.queryByText(/AI 认输：/)).toBeNull();
    expect(screen.getByText(/轮到你/)).toBeTruthy();
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(screen.getByLabelText<HTMLInputElement>('AI 自动认输').checked).toBe(
      true,
    );
  });

  it('自动认输设置写入 localStorage，重开页面后保留；坏数据按默认开启', async () => {
    render(<GoGame />);
    const box = () => screen.getByLabelText<HTMLInputElement>('AI 自动认输');
    expect(box().checked).toBe(true);
    fireEvent.click(box());
    expect(box().checked).toBe(false);
    expect(localStorage.getItem(GO_AUTO_RESIGN_KEY)).toBe('0');
    cleanup();
    render(<GoGame />);
    expect(box().checked).toBe(false);
    // Disabled setting survives into a lost game: the AI keeps playing.
    startAs('8');
    await playRounds(18, () => ({ winrate: 0.01, lead: 40 }));
    expect(screen.queryByText(/AI 认输/)).toBeNull();
    cleanup();
    localStorage.setItem(GO_AUTO_RESIGN_KEY, '{garbage');
    render(<GoGame />);
    expect(box().checked).toBe(true);
  });

  it('自动认输设置 SSR 安全：服务端按默认渲染，水合无不一致后再读取保存值', async () => {
    localStorage.setItem(GO_AUTO_RESIGN_KEY, '0');
    const html = renderToString(<GoGame />);
    expect(html).toMatch(/type="checkbox" checked=""/);
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, <GoGame />, {
        onRecoverableError: (e) => console.error(e),
      });
    });
    expect(
      host.querySelector<HTMLInputElement>('.go-check input')!.checked,
    ).toBe(false);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    act(() => root!.unmount());
    host.remove();
  });

  it('胜率走势：AI 每手后记录，悔棋同步回退', async () => {
    render(<GoGame />);
    startAs('2');
    fireEvent.click(screen.getByRole('button', { name: /形势判断/ }));
    await playRounds(3, (i) => ({ winrate: 0.5 - i * 0.1 }));
    expect(screen.getByRole('img', { name: /最近 70%/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(screen.getByRole('img', { name: /最近 60%/ })).toBeTruthy();
  });
});

describe('形势判断任务隔离', () => {
  beforeEach(() => {
    TestWorker.instances = [];
    vi.stubGlobal('Worker', TestWorker);
  });
  const toggle = () =>
    fireEvent.click(screen.getByRole('button', { name: /形势判断/ }));
  const judged = (size = 9) => ({
    blackWinrate: 0.62,
    lead: 4.5,
    ownership: Array.from({ length: size * size }, () => 0.9),
    playouts: 100,
  });

  it('关闭后保留淡出元素，重新落子立即移除旧局面的归属', async () => {
    render(<GoGame />);
    toggle();
    await reply(workers().at(-1)!, judged());
    toggle();
    expect(document.querySelector('.go-board.is-judging')).toBeNull();
    expect(document.querySelectorAll('.go-own')).toHaveLength(81);
    expect(screen.queryByText(/黑胜率 62%/)).toBeNull();
    fireEvent.click(pt(40));
    expect(document.querySelectorAll('.go-own')).toHaveLength(0);
  });

  it('关闭、换棋盘让子、切题和卸载会取消判断并忽略迟到结果', async () => {
    const view = render(<GoGame />);
    toggle();
    const closed = workers().at(-1)!;
    toggle();
    expect(closed.terminated).toBe(true);
    await reply(closed, judged());
    expect(document.querySelectorAll('.go-own')).toHaveLength(0);
    toggle();
    const old = workers().at(-1)!;
    fireEvent.change(screen.getByLabelText('棋盘'), {
      target: { value: '13' },
    });
    fireEvent.change(screen.getByLabelText('让子'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    const current = workers().at(-1)!;
    expect(old.terminated).toBe(true);
    expect(current.message!.type).toBe('judge');
    expect(current.message!.komi).toBe(0.5);
    expect(current.message!.state.board).toHaveLength(169);
    await reply(old, judged());
    expect(document.querySelectorAll('.go-own')).toHaveLength(0);
    openProblem('straight-three-live');
    expect(current.terminated).toBe(true);
    await reply(current, judged(13));
    expect(document.querySelectorAll('.go-own')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('模式'), {
      target: { value: '' },
    });
    const unmounted = workers().at(-1)!;
    expect(unmounted.message!.type).toBe('judge');
    view.unmount();
    expect(unmounted.terminated).toBe(true);
  });

  it('悔棋取消旧判断，重算回退局面且不复用旧归属', async () => {
    render(<GoGame />);
    fireEvent.click(pt(40));
    const firstMove = workers().at(-1)!;
    await reply(firstMove, move(30));
    toggle();
    const old = workers().at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(old.terminated).toBe(true);
    expect(firstMove.terminated).toBe(true);
    const fresh = workers().at(-1)!;
    expect(fresh.message!.state.board.every((p) => p === 0)).toBe(true);
    await reply(old, judged());
    expect(document.querySelectorAll('.go-own')).toHaveLength(0);
    await reply(fresh, judged());
    expect(document.querySelectorAll('.go-own')).toHaveLength(81);
  });

  it('判断超时独立回退，不降档、不释放落子搜索树', async () => {
    vi.useFakeTimers();
    vi.spyOn(GoAi, 'judgeGo').mockReturnValue(judged());
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    fireEvent.click(pt(40));
    const retained = workers().at(-1)!;
    await reply(retained, move(30));
    toggle();
    const stalled = workers().at(-1)!;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8001);
    });
    expect(stalled.terminated).toBe(true);
    expect(retained.terminated).toBe(false);
    expect(screen.getByText(/黑胜率 62%/)).toBeTruthy();
    expect(screen.queryByText(/已切换入门强度兼容计算/)).toBeNull();
    fireEvent.click(pt(50));
    expect(workers().filter((w) => w.message?.type === 'move')).toEqual([
      retained,
    ]);
    expect(retained.message!.level).toBe(8);
  });

  it('判断失败会结束等待，重新开关可以重试', async () => {
    vi.useFakeTimers();
    vi.spyOn(GoAi, 'judgeGo').mockImplementation(() => {
      throw new Error('judgment unavailable');
    });
    render(<GoGame />);
    toggle();
    const failed = workers().at(-1)!;
    act(() => failed.onerror?.({ preventDefault() {} }));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByText(/形势判断暂不可用/)).toBeTruthy();
    expect(screen.queryByText(/形势判断计算中/)).toBeNull();
    expect(screen.queryByText(/已切换入门强度兼容计算/)).toBeNull();
    toggle();
    toggle();
    expect(screen.queryByText(/形势判断暂不可用/)).toBeNull();
    expect(screen.getByText(/形势判断计算中/)).toBeTruthy();
    await reply(workers().at(-1)!, judged());
    expect(screen.getByText(/黑胜率 62%/)).toBeTruthy();
  });

  it('认输后不再显示旧判断，待处理的判断也会中止', async () => {
    render(<GoGame />);
    toggle();
    await reply(workers().at(-1)!, judged());
    fireEvent.click(screen.getByRole('button', { name: '认输' }));
    expect(screen.queryByText(/黑胜率 62%/)).toBeNull();
    expect(screen.getByText(/形势判断只在对局进行中更新/)).toBeTruthy();
    expect(document.querySelectorAll('.go-own')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    const pending = workers().at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: /虚手/ }));
    expect(pending.terminated).toBe(true);
    await reply(workers().at(-1)!, move(-1));
    const dead = workers().at(-1)!;
    expect(dead.message!.type).toBe('dead');
    await reply(pending, judged());
    expect(screen.queryByText(/黑胜率 62%/)).toBeNull();
    await reply(dead, []);
    expect(
      screen.getByRole('button', { name: '确认结算' }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('AI 执黑时按黑方目差认输，只记一次胜局', async () => {
    render(<GoGame />);
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    for (let i = 0; i < 16; i++) {
      await reply(workers().at(-1)!, {
        move: 80 - i,
        winrate: 0.01,
        blackWinrate: 0.01,
        lead: -40,
        playouts: 1,
      });
      fireEvent.click(pt(i));
    }
    const worker = workers().at(-1)!;
    const lost = {
      move: 60,
      winrate: 0.02,
      blackWinrate: 0.02,
      lead: -40,
      playouts: 1,
    };
    await reply(worker, lost);
    await reply(worker, lost);
    expect(
      screen.getAllByText(/AI 认输：估计胜率 2%，落后约 40 目/),
    ).toHaveLength(2);
    expect(
      JSON.parse(localStorage.getItem(GO_RECORDS_KEY)!).games['9-8'],
    ).toEqual({
      played: 1,
      won: 1,
    });
  });
});
