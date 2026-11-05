import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpeditionGame } from '../../../components/games/expedition/local';
import { ExpeditionTable } from '../../../components/games/expedition/table';
import { ExpeditionOnline } from '../../../components/play/online-expedition';
import * as E from '../../../lib/games/expedition';
import {
  expeditionOnline,
  type ExpeditionOnlineView,
} from '../../../lib/multiplayer/expedition-online';
import type { PlaySnapshot } from '../../../lib/multiplayer/client';
const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: () => 'http://localhost/games/expedition/online',
}));
const originalNewGame = E.newGame;
const fixture = () => originalNewGame(() => 0.37, 0, 1);
class WorkerStub {
  static all: WorkerStub[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  message: {
    id: number;
    view: E.ExpeditionView;
    side: E.Side;
    level: number;
  } | null = null;
  constructor() {
    WorkerStub.all.push(this);
  }
  postMessage(message: WorkerStub['message']) {
    this.message = message;
  }
  terminate() {
    this.terminated = true;
  }
}
let snap: PlaySnapshot<ExpeditionOnlineView>;
const project = () =>
  expeditionOnline.view(
    {
      ...expeditionOnline.create({ rounds: 1 }, Math.random, 0),
      started: true,
      game: fixture(),
      positionRevision: 7,
    },
    0,
    0,
  ) as ExpeditionOnlineView;
const hand = () =>
  within(screen.getByRole('group', { name: '你的手牌' })).getAllByRole(
    'button',
  );
const start = () =>
  fireEvent.click(screen.getAllByText('开局', { selector: 'button' })[0]);
const passTurn = () => {
  fireEvent.click(hand()[0]);
  fireEvent.click(screen.getByRole('button', { name: /^弃到/ }));
  fireEvent.click(screen.getByRole('button', { name: /^牌堆剩/ }));
};
beforeEach(() => {
  localStorage.clear();
  WorkerStub.all = [];
  vi.stubGlobal('Worker', WorkerStub);
  vi.spyOn(E, 'newGame').mockImplementation(fixture);
  mocks.act.mockReset();
  mocks.useRoom.mockReset();
  snap = {
    status: 'open',
    code: 'ABCDEF',
    seat: 0,
    seats: [
      { name: '甲', online: true, taken: true },
      { name: '乙', online: true, taken: true },
    ],
    view: project(),
    version: 10,
    clock: null,
    error: null,
  };
  mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('丝路远行交互', () => {
  it('names each hand card and binds actions to the displayed online revision', () => {
    render(<ExpeditionOnline />);
    const card = (snap.view as E.ExpeditionView).hand[0];
    expect(hand()[0].getAttribute('aria-label')).toBe(E.cardName(card));
    fireEvent.click(hand()[0]);
    fireEvent.click(screen.getByRole('button', { name: /^弃到/ }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      move: { t: 'discard', card },
      positionRevision: 7,
    });
  });
  it('clears selection on new revisions and a same-revision reconnect without remounting the table', () => {
    const ui = render(<ExpeditionOnline />);
    const node = document.querySelector('.ex-table');
    fireEvent.click(hand()[0]);
    snap.view = { ...snap.view!, positionRevision: 8 };
    ui.rerender(<ExpeditionOnline />);
    expect(document.querySelector('.ex-table')).toBe(node);
    expect(screen.queryByRole('button', { name: /^弃到/ })).toBeNull();
    fireEvent.click(hand()[0]);
    snap.status = 'reconnecting';
    ui.rerender(<ExpeditionOnline />);
    expect(hand()[0]).toHaveProperty('disabled', true);
    snap.status = 'open';
    ui.rerender(<ExpeditionOnline />);
    expect(screen.queryByRole('button', { name: /^弃到/ })).toBeNull();
    expect(mocks.act).not.toHaveBeenCalled();
    fireEvent.click(hand()[0]);
    fireEvent.click(screen.getByRole('button', { name: /^弃到/ }));
    expect(mocks.act).toHaveBeenCalledTimes(1);
  });
  it('guards synchronous duplicate submissions and leaves rejected choices retryable', () => {
    const move = vi.fn();
    const v = E.viewFor(fixture(), 0);
    const ui = render(
      <ExpeditionTable v={v} names={['你', 'AI']} onMove={move} />,
    );
    fireEvent.click(hand()[0]);
    const button = screen.getByRole('button', { name: /^弃到/ });
    act(() => {
      button.click();
      button.click();
    });
    expect(move).toHaveBeenCalledTimes(1);
    ui.unmount();
    const rejected = vi.fn(() => false);
    render(<ExpeditionTable v={v} names={['你', 'AI']} onMove={rejected} />);
    fireEvent.click(hand()[0]);
    fireEvent.click(screen.getByRole('button', { name: /^弃到/ }));
    fireEvent.click(screen.getByRole('button', { name: /^弃到/ }));
    expect(rejected).toHaveBeenCalledTimes(2);
  });
  it('clears an old choice when restarting into an identical opening hand', () => {
    render(<ExpeditionGame />);
    start();
    fireEvent.click(hand()[0]);
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));
    expect(screen.queryByRole('button', { name: /^弃到/ })).toBeNull();
  });
  it('sends only the private view to the Worker and ignores its result after restart', async () => {
    vi.useFakeTimers();
    render(<ExpeditionGame />);
    start();
    passTurn();
    const worker = WorkerStub.all.at(-1)!;
    expect(worker.message!.view.you).toBe(1);
    expect(worker.message!.view).not.toHaveProperty('hands');
    expect(worker.message!.view).not.toHaveProperty('deck');
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));
    expect(worker.terminated).toBe(true);
    await act(async () => {
      worker.onmessage?.({
        data: {
          id: 1,
          result: {
            move: { t: 'discard', card: worker.message!.view.hand[0] },
          },
        },
      });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(hand()[0]).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: '牌堆剩 44 张' })).toBeTruthy();
  });
  it('offers a retry after Worker failure without advancing the game', () => {
    render(<ExpeditionGame />);
    start();
    passTurn();
    const worker = WorkerStub.all.at(-1)!;
    act(() => worker.onerror?.({ preventDefault() {} }));
    expect(worker.terminated).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重试 AI' }));
    expect(WorkerStub.all).toHaveLength(2);
  });
});
