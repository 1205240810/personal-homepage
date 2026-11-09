import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JunqiGame } from '../../../components/games/junqi';
import { JunqiBoard } from '../../../components/games/junqi-board';
import {
  FLAG,
  deploy,
  maskFor,
  movesFor,
  newGame,
  type JunqiView,
  type Move,
} from '../../../lib/games/junqi';
import { PRESETS } from '../../../lib/games/junqi-layouts';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  message: { id: number; level: number; view: JunqiView } | null = null;
  constructor() {
    TestWorker.instances.push(this);
  }
  postMessage(message: TestWorker['message']) {
    this.message = message;
  }
  terminate() {
    this.terminated = true;
  }
  reply(move: Move) {
    this.onmessage?.({
      data: { id: 1, result: { move, score: 0, samples: 1 } },
    });
  }
}
const latest = () => TestWorker.instances.at(-1)!;
const button = (name: string | RegExp) =>
  screen.getAllByRole('button', { name }).at(0) as HTMLButtonElement;
const reply = async (worker: TestWorker, move: Move) =>
  act(async () => {
    worker.reply(move);
    await vi.advanceTimersByTimeAsync(650);
  });
/** 第一枚能走的己方棋子及它的一个目标。 */
const firstMove = (view: JunqiView) => movesFor(view.board, view.toPlay)[0];

beforeEach(() => {
  localStorage.clear();
  TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('军棋客户端', () => {
  it('swaps pieces by tapping during deployment and blocks an illegal layout', () => {
    render(<JunqiGame />);
    const start = button(/开战/);
    expect(start.disabled).toBe(false);
    // 把军旗（底排 B6 大本营）和底排 A6 的地雷互换：军旗离开大本营。
    fireEvent.click(button(/我方B6 大本营 我方军旗/));
    fireEvent.click(button(/我方A6 兵站 我方地雷/));
    expect(button(/我方A6 兵站 我方军旗/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      '军旗必须放在大本营',
    );
    expect(button(/开战/).disabled).toBe(true);
    // 换回来就合法了。
    fireEvent.click(button(/我方A6 兵站 我方军旗/));
    fireEvent.click(button(/我方B6 大本营 我方地雷/));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button(/开战/).disabled).toBe(false);
  });

  it('applies presets and random layouts that are always legal', () => {
    render(<JunqiGame />);
    fireEvent.change(screen.getByLabelText('预设阵型'), {
      target: { value: 'left' },
    });
    expect(button(/我方A1 铁路 我方司令/)).toBeTruthy();
    for (let n = 0; n < 5; n++) {
      fireEvent.click(button(/随机布阵/));
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });

  it('sends the AI only its own masked view, then plays its legal reply', async () => {
    localStorage.setItem(
      'tscjj:junqi-settings:v1',
      JSON.stringify({ level: 4, side: 1, open: false }),
    );
    render(<JunqiGame />);
    fireEvent.click(button(/开战/));
    const w = latest();
    expect(w.message!.level).toBe(4);
    const view = w.message!.view;
    expect(view.you).toBe(0);
    // AI 是红方：它看到的蓝方（你）全是背面。
    const yours = view.board.filter((p) => p?.s === 1);
    expect(yours).toHaveLength(25);
    expect(yours.every((p) => p!.k === -1)).toBe(true);
    await reply(w, firstMove(view));
    expect(screen.getByText('第 1 步')).toBeTruthy();
    expect(screen.getByText(/轮到你/)).toBeTruthy();
  });

  it('rejects an illegal AI reply and lets the player retry', async () => {
    localStorage.setItem(
      'tscjj:junqi-settings:v1',
      JSON.stringify({ level: 2, side: 1, open: false }),
    );
    render(<JunqiGame />);
    fireEvent.click(button(/开战/));
    await reply(latest(), { from: 0, to: 59 });
    expect(screen.getByText('AI 计算失败，请重试')).toBeTruthy();
    fireEvent.click(button('重试 AI'));
    await reply(latest(), firstMove(latest().message!.view));
    expect(screen.getByText('第 1 步')).toBeTruthy();
  });

  it('moves by selecting a piece and a highlighted target, and records a resignation once', async () => {
    render(<JunqiGame />);
    fireEvent.click(button(/开战/));
    // 你执红先走：前排 D1 的军长进入行营。
    fireEvent.click(button(/我方D1 铁路 我方军长/));
    fireEvent.click(button(/我方D2 行营 空 可走/));
    expect(screen.getByText('第 1 步')).toBeTruthy();
    const ai = latest();
    expect(ai.message!.view.you).toBe(1);
    await reply(ai, firstMove(ai.message!.view));
    fireEvent.click(button(/认输/));
    expect(screen.getByText('本档 0 胜 / 1 局')).toBeTruthy();
    expect(screen.getByText(/你认输/)).toBeTruthy();
    fireEvent.click(button('再来一局'));
    expect(button(/开战/)).toBeTruthy();
  });

  it('flips the board for the blue side and keeps hidden enemy pieces as backs', () => {
    const s = deploy(
      deploy(newGame(), 0, PRESETS[0].layout),
      1,
      PRESETS[1].layout,
    );
    render(<JunqiBoard view={maskFor(s, 1)} viewer={1} live={false} />);
    // 蓝方视角：自己的前排 A1 是「左路强攻」的司令。
    expect(button(/我方A1 铁路 我方司令/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /对方暗子/ })).toHaveLength(
      25,
    );
    expect(document.querySelectorAll('.jq-piece.is-back')).toHaveLength(25);
    expect(document.querySelectorAll(`.jq-piece.k${FLAG}`)).toHaveLength(1);
  });

  it('cancels hints when the position changes and clears failed hints on a new deployment', async () => {
    render(<JunqiGame />);
    fireEvent.click(button(/开战/));
    fireEvent.click(button('提示'));
    const hintWorker = latest();
    fireEvent.click(button(/我方D1 铁路 我方军长/));
    fireEvent.click(button(/我方D2 行营 空 可走/));
    const ai = latest();
    expect(ai).not.toBe(hintWorker);
    expect(hintWorker.terminated).toBe(true);
    await reply(hintWorker, firstMove(hintWorker.message!.view));
    expect(document.querySelectorAll('.is-hint')).toHaveLength(0);
    expect(screen.getByText('第 1 步')).toBeTruthy();
    await reply(ai, firstMove(ai.message!.view));
    fireEvent.click(button('提示'));
    await reply(latest(), { from: -1, to: 99 });
    expect(screen.getByText('提示计算失败，请重试')).toBeTruthy();
    fireEvent.click(button('重新布阵'));
    expect(screen.queryByText('提示计算失败，请重试')).toBeNull();
    fireEvent.click(button(/开战/));
    expect(screen.queryByText('提示计算失败，请重试')).toBeNull();
  });

  it('only completes a deployment drag in the same connected layout generation', () => {
    const onSwap = vi.fn();
    const v = maskFor(newGame(), 0);
    const layout = PRESETS[0].layout.slice();
    const props = {
      view: v,
      viewer: 0 as const,
      live: true,
      positionKey: '0:open',
      deploy: { layout, bad: [], onSwap },
    };
    const rendered = render(<JunqiBoard {...props} />);
    const source = button(/我方B6 大本营 我方军旗/);
    const target = button(/我方A6 兵站 我方地雷/);
    const originalHit = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint',
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    });
    const begin = () => {
      fireEvent.pointerDown(source, {
        pointerId: 1,
        button: 0,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(source, { pointerId: 1, clientX: 60, clientY: 60 });
    };
    const end = () =>
      fireEvent.pointerUp(source, { pointerId: 1, clientX: 60, clientY: 60 });
    begin();
    end();
    expect(onSwap).toHaveBeenCalledTimes(1);
    onSwap.mockClear();
    begin();
    rendered.rerender(
      <JunqiBoard {...props} live={false} positionKey="0:offline" />,
    );
    expect(document.querySelector('.is-floating')).toBeNull();
    rendered.rerender(<JunqiBoard {...props} />);
    end();
    expect(onSwap).not.toHaveBeenCalled();
    begin();
    rendered.rerender(
      <JunqiBoard
        {...props}
        deploy={{ ...props.deploy, layout: PRESETS[1].layout.slice() }}
      />,
    );
    end();
    expect(onSwap).not.toHaveBeenCalled();
    if (originalHit)
      Object.defineProperty(document, 'elementFromPoint', originalHit);
    else Reflect.deleteProperty(document, 'elementFromPoint');
  });
});
