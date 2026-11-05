import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BazaarGame } from '../../../components/games/bazaar/local';
import { BazaarTable } from '../../../components/games/bazaar/table';
import { BazaarOnline } from '../../../components/play/online-bazaar';
import * as B from '../../../lib/games/bazaar';
import {
  bazaarOnline,
  type BazaarOnlineView,
} from '../../../lib/multiplayer/bazaar-online';
import type { PlaySnapshot } from '../../../lib/multiplayer/client';
const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: () => 'http://localhost/games/bazaar/online',
}));
const originalNewGame = B.newGame;
const fixture = () => originalNewGame(() => 0.37, 0);
class WorkerStub {
  static all: WorkerStub[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  message: {
    id: number;
    view: B.BazaarView;
    side: B.Side;
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
let snap: PlaySnapshot<BazaarOnlineView>;
const project = () =>
  bazaarOnline.view(
    {
      ...bazaarOnline.create({}, Math.random, 0),
      started: true,
      game: fixture(),
      positionRevision: 7,
    },
    0,
    0,
  ) as BazaarOnlineView;
const hand = () =>
  within(screen.getByRole('group', { name: '你的货' })).getAllByRole('button');
const market = () =>
  within(screen.getByRole('group', { name: '市集' })).getAllByRole('button');
const start = () =>
  fireEvent.click(screen.getAllByText('开局', { selector: 'button' })[0]);
const camels = () => screen.getByRole('button', { name: /^牵走骆驼/ });
beforeEach(() => {
  localStorage.clear();
  WorkerStub.all = [];
  vi.stubGlobal('Worker', WorkerStub);
  vi.spyOn(B, 'newGame').mockImplementation(fixture);
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
describe('刺桐市集交互', () => {
  it('gives illustrated cards distinct names and sends the visible revision', () => {
    render(<BazaarOnline />);
    const view = snap.view as B.BazaarView;
    expect(hand()[0].getAttribute('aria-label')).toBe(
      `手牌第 1 件：${B.cardLabel(view.hand[0])}`,
    );
    expect(market()[3].getAttribute('aria-label')).toBe(
      `市集第 4 件：${B.cardLabel(view.market[3])}`,
    );
    fireEvent.click(camels());
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      move: { t: 'camels' },
      positionRevision: 7,
    });
  });
  it('clears hand/market choices on revisions and a same-revision reconnect while keeping the table mounted', () => {
    const ui = render(<BazaarOnline />);
    const node = document.querySelector('.bz-table');
    fireEvent.click(hand()[0]);
    snap.view = { ...snap.view!, positionRevision: 8 };
    ui.rerender(<BazaarOnline />);
    expect(document.querySelector('.bz-table')).toBe(node);
    expect(hand()[0].getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(hand()[0]);
    snap.status = 'reconnecting';
    ui.rerender(<BazaarOnline />);
    expect(hand()[0]).toHaveProperty('disabled', true);
    snap.status = 'open';
    ui.rerender(<BazaarOnline />);
    expect(hand()[0].getAttribute('aria-pressed')).toBe('false');
    expect(mocks.act).not.toHaveBeenCalled();
    fireEvent.click(camels());
    expect(mocks.act).toHaveBeenCalledTimes(1);
  });
  it('guards a rapid local double submission and keeps a server-rejected action usable', () => {
    const move = vi.fn();
    const v = B.viewFor(fixture(), 0);
    const ui = render(<BazaarTable v={v} names={['你', 'AI']} onMove={move} />);
    const button = camels();
    act(() => {
      button.click();
      button.click();
    });
    expect(move).toHaveBeenCalledTimes(1);
    ui.unmount();
    const rejected = vi.fn(() => false);
    render(<BazaarTable v={v} names={['你', 'AI']} onMove={rejected} />);
    fireEvent.click(camels());
    fireEvent.click(camels());
    expect(rejected).toHaveBeenCalledTimes(2);
  });
  it('locks online camel actions until a position response or new rejection, including after clearing an old error', () => {
    const ui = render(<BazaarOnline />);
    act(() => {
      camels().click();
      camels().click();
    });
    expect(mocks.act).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^牵走骆驼/ })).toBeNull();
    expect(hand()[0]).toHaveProperty('disabled', true);
    // A seat-presence broadcast must not acknowledge the pending move.
    snap = { ...snap, version: snap.version + 1 };
    ui.rerender(<BazaarOnline />);
    expect(screen.queryByRole('button', { name: /^牵走骆驼/ })).toBeNull();
    snap = { ...snap, error: '操作被拒绝，请重试' };
    ui.rerender(<BazaarOnline />);
    expect(camels()).toHaveProperty('disabled', false);
    fireEvent.click(camels());
    expect(mocks.act).toHaveBeenCalledTimes(2);
    // PlayClient.act clears this old error before sending the new request.
    snap = { ...snap, error: null };
    ui.rerender(<BazaarOnline />);
    screen.queryByRole<HTMLButtonElement>('button', { name: /^牵走骆驼/ })?.click();
    expect(mocks.act).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /^牵走骆驼/ })).toBeNull();
    snap = { ...snap, error: '操作被拒绝，请重试' };
    ui.rerender(<BazaarOnline />);
    fireEvent.click(camels());
    expect(mocks.act).toHaveBeenCalledTimes(3);
    snap = { ...snap, view: { ...snap.view!, positionRevision: 8 } };
    ui.rerender(<BazaarOnline />);
    expect(camels()).toHaveProperty('disabled', false);
    fireEvent.click(camels());
    expect(mocks.act).toHaveBeenCalledTimes(4);
    snap = { ...snap, status: 'reconnecting' };
    ui.rerender(<BazaarOnline />);
    expect(screen.queryByRole('button', { name: /^牵走骆驼/ })).toBeNull();
    snap = { ...snap, status: 'open', error: null };
    ui.rerender(<BazaarOnline />);
    expect(camels()).toHaveProperty('disabled', false);
  });
  it('does not reuse selected hand indices after an identical restart', () => {
    render(<BazaarGame />);
    start();
    fireEvent.click(hand()[0]);
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));
    expect(hand()[0].getAttribute('aria-pressed')).toBe('false');
  });
  it('sends a private view to AI and discards its old response after restart', async () => {
    vi.useFakeTimers();
    render(<BazaarGame />);
    start();
    fireEvent.click(camels());
    const worker = WorkerStub.all.at(-1)!;
    expect(worker.message!.view.you).toBe(1);
    expect(worker.message!.view).not.toHaveProperty('deck');
    expect(worker.message!.view).not.toHaveProperty('hands');
    expect(worker.message!.view).not.toHaveProperty('bonus');
    expect(typeof worker.message!.view.bonusWon[0]).toBe('number');
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));
    expect(worker.terminated).toBe(true);
    await act(async () => {
      worker.onmessage?.({
        data: { id: 1, result: { move: { t: 'camels' } } },
      });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(camels()).toHaveProperty('disabled', false);
    expect(market()).toHaveLength(5);
  });
  it('recovers from Worker failure with an explicit retry', () => {
    render(<BazaarGame />);
    start();
    fireEvent.click(camels());
    const worker = WorkerStub.all.at(-1)!;
    act(() => worker.onerror?.({ preventDefault() {} }));
    expect(worker.terminated).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重试 AI' }));
    expect(WorkerStub.all).toHaveLength(2);
  });
});
