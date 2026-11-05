import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoridorGame } from '../../../components/games/quoridor';
import { QuoridorBoard } from '../../../components/games/quoridor-board';
import { newGame, type Move } from '../../../lib/games/quoridor';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  message: {
    id: number;
    level: number;
    state: ReturnType<typeof newGame>;
  } | null = null;
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
    this.onmessage?.({ data: { id: 1, result: { move, score: 0, depth: 1 } } });
  }
}
const latest = () => TestWorker.instances.at(-1)!;
const button = (name: string) =>
  screen.queryByLabelText<HTMLButtonElement>(name) ??
  screen.getByText<HTMLButtonElement>(name, {
    selector: 'button',
    exact: true,
  });
const reply = async (worker: TestWorker, move: Move) =>
  act(async () => {
    worker.reply(move);
    await vi.advanceTimersByTimeAsync(450);
  });
// jsdom does not provide PointerEvent, so retain its pointerType for React.
const pointerDown = (node: HTMLElement, pointerType: string) => {
  const event = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(node, event);
};
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

describe('步步为营客户端', () => {
  it('uses the displayed initial settings and locks a started match', async () => {
    localStorage.setItem(
      'tscjj:quoridor-settings:v1',
      JSON.stringify({ mode: 'ai', level: 6 }),
    );
    render(<QuoridorGame />);
    fireEvent.click(button('e2 可走'));
    expect(latest().message!.level).toBe(6);
    fireEvent.change(screen.getByLabelText('难度（下局生效）'), {
      target: { value: '1' },
    });
    await reply(latest(), { t: 'm', to: 13 });
    fireEvent.click(button('e3 可走'));
    expect(latest().message!.level).toBe(6);
    fireEvent.click(button('后手开局'));
    expect(latest().message!.level).toBe(1);
  });

  it('cancels a hint when moving and ignores a late reply on the new position', async () => {
    render(<QuoridorGame />);
    fireEvent.click(button('提示'));
    const hint = latest();
    fireEvent.click(button('e2 可走'));
    expect(hint.terminated).toBe(true);
    await reply(hint, { t: 'm', to: 75 });
    expect(screen.queryByText(/提示：/)).toBeNull();
    await reply(latest(), { t: 'm', to: 13 });
    expect(button('提示').disabled).toBe(false);
  });

  it('new games and unmount cancel hint workers', async () => {
    const view = render(<QuoridorGame />);
    fireEvent.click(button('提示'));
    const old = latest();
    fireEvent.click(button('先手开局'));
    expect(old.terminated).toBe(true);
    await reply(old, { t: 'm', to: 67 });
    expect(screen.queryByText(/提示：/)).toBeNull();
    fireEvent.click(button('提示'));
    const current = latest();
    view.unmount();
    expect(current.terminated).toBe(true);
  });

  it('rejects invalid hint output and lets the player retry', async () => {
    render(<QuoridorGame />);
    fireEvent.click(button('提示'));
    await reply(latest(), { t: 'm', to: 0 });
    expect(screen.getByText('提示计算失败，请重试')).toBeTruthy();
    expect(screen.queryByText(/提示：/)).toBeNull();
    fireEvent.click(button('提示'));
    await reply(latest(), { t: 'm', to: 67 });
    expect(screen.getByText(/提示：可以考虑 e2/)).toBeTruthy();
  });

  it('ignores obsolete AI replies and recovers from failure', async () => {
    render(<QuoridorGame />);
    fireEvent.click(button('后手开局'));
    const old = latest();
    fireEvent.click(button('先手开局'));
    expect(old.terminated).toBe(true);
    await reply(old, { t: 'm', to: 67 });
    expect(screen.getByText('第 0 手')).toBeTruthy();
    fireEvent.click(button('e2 可走'));
    await reply(latest(), { t: 'm', to: 80 });
    expect(screen.getByText('AI 计算失败，请重试')).toBeTruthy();
    fireEvent.click(button('重试 AI'));
    await reply(latest(), { t: 'm', to: 13 });
    expect(screen.getByText('第 2 手')).toBeTruthy();
  });

  it('records a finished match once even after undoing and resigning again', async () => {
    render(<QuoridorGame />);
    fireEvent.click(button('e2 可走'));
    await reply(latest(), { t: 'm', to: 13 });
    fireEvent.click(button('认输'));
    expect(screen.getByText(/你已认输/)).toBeTruthy();
    expect(screen.getByText('本档 0 胜 / 1 局')).toBeTruthy();
    fireEvent.click(button('悔棋'));
    fireEvent.click(button('e2 可走'));
    await reply(latest(), { t: 'm', to: 13 });
    fireEvent.click(button('认输'));
    expect(screen.getByText('本档 0 胜 / 1 局')).toBeTruthy();
    fireEvent.click(button('先手开局'));
    fireEvent.click(button('e2 可走'));
    await reply(latest(), { t: 'm', to: 13 });
    fireEvent.click(button('认输'));
    expect(screen.getByText('本档 0 胜 / 2 局')).toBeTruthy();
  });

  it('requires two touch taps despite focus, while keyboard focus previews a wall', () => {
    const onMove = vi.fn();
    const view = render(
      <QuoridorBoard state={newGame()} mode="h" onMove={onMove} />,
    );
    const wall = button('横墙 d5');
    pointerDown(wall, 'touch');
    fireEvent.focus(wall);
    fireEvent.click(wall);
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(wall);
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenLastCalledWith({ t: 'w', o: 'h', x: 3, y: 3 });
    view.unmount();
    onMove.mockClear();
    render(<QuoridorBoard state={newGame()} mode="h" onMove={onMove} />);
    fireEvent.focus(button('横墙 d5'));
    fireEvent.click(button('横墙 d5'), { detail: 0 });
    expect(onMove).toHaveBeenCalledOnce();
  });

  it('clears wall previews across mode, position and disconnect/reconnect transitions', () => {
    const onMove = vi.fn();
    const state = newGame();
    const props = { state, mode: 'h' as const, onMove };
    const view = render(<QuoridorBoard {...props} />);
    fireEvent.click(button('横墙 d5'));
    expect(document.querySelector('.is-ghost')).toBeTruthy();
    view.rerender(<QuoridorBoard {...props} disabled />);
    view.rerender(<QuoridorBoard {...props} />);
    fireEvent.click(button('横墙 d5'));
    expect(onMove).not.toHaveBeenCalled();
    view.rerender(<QuoridorBoard {...props} mode="v" />);
    fireEvent.click(button('竖墙 d5'));
    expect(onMove).not.toHaveBeenCalled();
    view.rerender(<QuoridorBoard {...props} mode="v" state={newGame()} />);
    expect(document.querySelector('.is-ghost')).toBeNull();
    expect(button('e1 朱方棋子')).toBeTruthy();
    expect(button('e9 黛方棋子')).toBeTruthy();
  });
});
