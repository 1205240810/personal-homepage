import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlazeTable } from '../../../components/games/glaze/table';
import { GlazeGame } from '../../../components/games/glaze/local';
import { GlazeOnline } from '../../../components/play/online-glaze';
import * as G from '../../../lib/games/glaze';
import { fromView } from '../../../lib/games/glaze-ai';
import { glazeOnline } from '../../../lib/multiplayer/glaze-online';

const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: () => 'http://localhost/games/glaze/online',
}));
const fixture = () => G.newGame(() => 0.37);
const pick = () =>
  fireEvent.click(screen.getAllByRole('button', { name: /^第 \d 窑的/ })[0]);
const place = () =>
  screen.getAllByRole('button', { name: /^料架第 .*：放这里/ })[0];
class TestWorker {
  static all: TestWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  message: {
    id: number;
    view: G.GlazeView;
    side: G.Side;
    level: number;
  } | null = null;
  terminated = false;
  constructor() {
    TestWorker.all.push(this);
  }
  postMessage(m: TestWorker['message']) {
    this.message = m;
  }
  terminate() {
    this.terminated = true;
  }
  reply(move: G.Move = G.legalMoves(fromView(this.message!.view))[0]) {
    this.onmessage?.({ data: { id: 1, result: { move, score: 0 } } });
  }
}
beforeEach(() => {
  localStorage.clear();
  mocks.act.mockReset();
  mocks.useRoom.mockReset();
  TestWorker.all = [];
  vi.stubGlobal('Worker', TestWorker);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('琉璃坊交互状态', () => {
  it('clears selected tiles on a new position and on disconnect/reconnect to the same position', () => {
    const v = G.viewFor(fixture(), 0);
    const onMove = vi.fn();
    const ui = render(
      <GlazeTable
        v={v}
        positionKey="a"
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    pick();
    expect(place().disabled).toBe(false);
    ui.rerender(
      <GlazeTable
        v={v}
        positionKey="b"
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    expect(screen.queryByRole('button', { name: /：放这里/ })).toBeNull();
    pick();
    ui.rerender(
      <GlazeTable
        v={v}
        positionKey="b"
        disabled
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    ui.rerender(
      <GlazeTable
        v={v}
        positionKey="b"
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    expect(screen.queryByRole('button', { name: /：放这里/ })).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });
  it('sends only one move until the authoritative position advances', () => {
    const v = G.viewFor(fixture(), 0);
    const onMove = vi.fn();
    const ui = render(
      <GlazeTable
        v={v}
        positionKey={1}
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    pick();
    fireEvent.click(place());
    pick();
    expect(screen.queryByRole('button', { name: /：放这里/ })).toBeNull();
    expect(onMove).toHaveBeenCalledTimes(1);
    ui.rerender(
      <GlazeTable
        v={v}
        positionKey={2}
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    pick();
    fireEvent.click(place());
    expect(onMove).toHaveBeenCalledTimes(2);
  });
  it('keeps a starting marker visible after all seven penalty spaces are full', () => {
    const v = G.viewFor(fixture(), 0);
    v.boards[0].floor = [0, 1, 2, 3, 4, 0, 1, 'first'];
    render(<GlazeTable v={v} names={['你', '对方']} onMove={() => {}} />);
    expect(screen.getByText(/下轮先手（碎瓷扣分已封顶）/)).toBeTruthy();
  });
  it('binds online choices to the current revision and requires fresh selection after reconnect', () => {
    const state = {
      ...glazeOnline.create({}, () => 0.37, 0),
      started: true,
      game: fixture(),
      positionRevision: 7,
    };
    const snap = {
      status: 'open',
      code: 'ABCDEF',
      seat: 0,
      seats: [
        { name: '甲', online: true, taken: true },
        { name: '乙', online: true, taken: true },
      ],
      view: glazeOnline.view(state, 0, 0),
      version: 1,
      clock: null,
      error: null as string | null,
    };
    mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
    const ui = render(<GlazeOnline />);
    pick();
    snap.status = 'reconnecting';
    ui.rerender(<GlazeOnline />);
    snap.status = 'open';
    ui.rerender(<GlazeOnline />);
    expect(screen.queryByRole('button', { name: /：放这里/ })).toBeNull();
    pick();
    fireEvent.click(place());
    expect(mocks.act).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'move', positionRevision: 7 }),
    );
    snap.error = '操作太快了';
    ui.rerender(<GlazeOnline />);
    pick();
    fireEvent.click(place());
    expect(mocks.act).toHaveBeenCalledTimes(2);
    snap.error = null;
    ui.rerender(<GlazeOnline />);
    pick();
    expect(screen.queryByRole('button', { name: /：放这里/ })).toBeNull();
    snap.error = '操作太快了';
    ui.rerender(<GlazeOnline />);
    pick();
    fireEvent.click(place());
    expect(mocks.act).toHaveBeenCalledTimes(3);
  });
  it('cancels AI on a new game and ignores late replies', async () => {
    vi.useFakeTimers();
    render(<GlazeGame />);
    fireEvent.click(screen.getAllByRole('button', { name: '开局' })[0]);
    pick();
    fireEvent.click(place());
    const old = TestWorker.all.at(-1)!;
    expect(old.message!.view).not.toHaveProperty('bag');
    expect(old.message!.view).not.toHaveProperty('lid');
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));
    expect(old.terminated).toBe(true);
    await act(async () => {
      old.reply();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/轮到你：点一块釉砖/)).toBeTruthy();
    expect(TestWorker.all).toHaveLength(1);
  });
  it('offers a retry for malformed AI moves and recovers with a legal response', async () => {
    vi.useFakeTimers();
    render(<GlazeGame />);
    fireEvent.click(screen.getAllByRole('button', { name: '开局' })[0]);
    pick();
    fireEvent.click(place());
    await act(async () => {
      TestWorker.all.at(-1)!.reply({ src: 999, color: 0, line: 0 });
    });
    fireEvent.click(screen.getByRole('button', { name: '重试 AI' }));
    await act(async () => {
      TestWorker.all.at(-1)!.reply();
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.queryByRole('button', { name: '重试 AI' })).toBeNull();
    expect(screen.getByText(/轮到你：点一块釉砖/)).toBeTruthy();
  });
});
