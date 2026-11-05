import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrocadeTable } from '../../../components/games/brocade/table';
import { BrocadeGame } from '../../../components/games/brocade/local';
import { BrocadeOnline } from '../../../components/play/online-brocade';
import * as B from '../../../lib/games/brocade';
import { determinize } from '../../../lib/games/brocade-ai';
import { brocadeOnline } from '../../../lib/multiplayer/brocade-online';

const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: () => 'http://localhost/games/brocade/online',
}));
const fixture = () => B.newGame(() => 0.37);
const selectGems = () => {
  const buttons =
    document.querySelectorAll<HTMLButtonElement>('.bc-bank button');
  [0, 1, 2].forEach((i) => fireEvent.click(buttons[i]));
};
const take = () =>
  fireEvent.click(screen.getByRole('button', { name: /^拿取/ }));
class TestWorker {
  static all: TestWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  message: {
    id: number;
    view: B.BrocadeView;
    side: B.Side;
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
  reply(
    move: B.Move = B.legalMoves(
      determinize(this.message!.view, this.message!.side, () => 0.37),
    )[0],
  ) {
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

describe('锦绣织造交互状态', () => {
  it('keeps a retried request locked while its old error is cleared', () => {
    const state = {
      ...brocadeOnline.create({}, () => 0.37, 0),
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
      view: brocadeOnline.view(state, 0, 0),
      version: 1,
      clock: null,
      error: null as string | null,
    };
    mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
    const ui = render(<BrocadeOnline />);
    selectGems();
    take();
    expect(mocks.act).toHaveBeenCalledTimes(1);
    snap.error = '操作太快了';
    ui.rerender(<BrocadeOnline />);
    selectGems();
    take();
    expect(mocks.act).toHaveBeenCalledTimes(2);
    snap.error = null;
    ui.rerender(<BrocadeOnline />);
    selectGems();
    expect(screen.queryByRole('button', { name: /^拿取/ })).toBeNull();
    snap.error = '操作太快了';
    ui.rerender(<BrocadeOnline />);
    selectGems();
    take();
    expect(mocks.act).toHaveBeenCalledTimes(3);
  });

  it('exposes forced passing only when no ordinary move is available', () => {
    const game = fixture();
    game.market = [
      [70, 71, 72, 73],
      [74, 75, 76, 77],
      [78, 79, 80, 81],
    ];
    game.bank = [0, 0, 0, 0, 0, 5];
    for (const p of game.players) {
      p.tokens = [2, 2, 2, 2, 2, 0];
      p.reserved = [82, 83, 84];
    }
    const onMove = vi.fn();
    const ui = render(
      <BrocadeTable
        v={B.viewFor(game, 0)}
        positionKey={1}
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '无可执行行动：过牌' }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ t: 'pass' });
    ui.rerender(
      <BrocadeTable
        v={B.viewFor(fixture(), 0)}
        positionKey={2}
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    expect(
      screen.queryByRole('button', { name: '无可执行行动：过牌' }),
    ).toBeNull();
  });

  it('clears an unfinished return when a position changes or reconnects', () => {
    const v = B.viewFor(fixture(), 0);
    v.players[0].tokens = [3, 3, 3, 0, 0, 0];
    const onMove = vi.fn();
    const ui = render(
      <BrocadeTable
        v={v}
        positionKey="a"
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    selectGems();
    take();
    expect(screen.getByRole('group', { name: '退还丝线' })).toBeTruthy();
    ui.rerender(
      <BrocadeTable
        v={v}
        positionKey="b"
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    expect(screen.queryByRole('group', { name: '退还丝线' })).toBeNull();
    selectGems();
    take();
    ui.rerender(
      <BrocadeTable
        v={v}
        positionKey="b"
        disabled
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull();
    ui.rerender(
      <BrocadeTable
        v={v}
        positionKey="b"
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    expect(screen.queryByRole('group', { name: '退还丝线' })).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });
  it('submits the exact chosen return once and unlocks for a new position', () => {
    const v = B.viewFor(fixture(), 0);
    v.players[0].tokens = [3, 3, 3, 0, 0, 0];
    const onMove = vi.fn();
    const ui = render(
      <BrocadeTable
        v={v}
        positionKey={1}
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    selectGems();
    take();
    fireEvent.click(screen.getByRole('button', { name: /^退还朱砂/ }));
    fireEvent.click(screen.getByRole('button', { name: /^退还朱砂/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith({
      t: 'take',
      gems: [0, 1, 2],
      ret: [0, 0],
    });
    selectGems();
    expect(screen.queryByRole('button', { name: /^拿取/ })).toBeNull();
    ui.rerender(
      <BrocadeTable
        v={v}
        positionKey={2}
        names={['你', '对方']}
        onMove={onMove}
      />,
    );
    selectGems();
    expect(screen.getByRole('button', { name: /^拿取/ })).toBeTruthy();
  });
  it('names illustrated cards with their colour, points and complete cost', () => {
    const v = B.viewFor(fixture(), 0);
    render(<BrocadeTable v={v} names={['你', '对方']} onMove={() => {}} />);
    const card = B.CARDS[v.market[0][0]!];
    const label = `作坊·${B.GEMS[card.color].name} ${card.points} 分，需 ${card.cost
      .map((n, g) => (n ? `${B.GEMS[g].name}${n}` : ''))
      .filter(Boolean)
      .join(' ')}`;
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  });
  it('disables pending returns offline and clears them before reusing an online revision', () => {
    const game = fixture();
    game.players[0].tokens = [3, 3, 3, 0, 0, 0];
    const state = {
      ...brocadeOnline.create({}, () => 0.37, 0),
      started: true,
      game,
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
      view: brocadeOnline.view(state, 0, 0),
      version: 1,
      clock: null,
      error: null as string | null,
    };
    mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
    const ui = render(<BrocadeOnline />);
    selectGems();
    take();
    snap.status = 'reconnecting';
    ui.rerender(<BrocadeOnline />);
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull();
    snap.status = 'open';
    ui.rerender(<BrocadeOnline />);
    expect(screen.queryByRole('group', { name: '退还丝线' })).toBeNull();
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it('sends only a private view to AI and cancels late work after restarting', async () => {
    vi.useFakeTimers();
    render(<BrocadeGame />);
    fireEvent.click(screen.getAllByRole('button', { name: '开局' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^作坊牌堆/ }));
    fireEvent.click(screen.getByRole('button', { name: '暗订一张作坊' }));
    const old = TestWorker.all.at(-1)!;
    expect(old.message!.view).not.toHaveProperty('decks');
    expect(old.message!.view).not.toHaveProperty('blind');
    expect(old.message!.view.players[0].reserved[0]).toBe(-1);
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }));
    expect(old.terminated).toBe(true);
    await act(async () => {
      old.reply();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/轮到你：取丝线/)).toBeTruthy();
    expect(TestWorker.all).toHaveLength(1);
  });
  it('recovers from malformed AI moves by retrying, with the active difficulty frozen', async () => {
    vi.useFakeTimers();
    render(<BrocadeGame />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } });
    fireEvent.click(screen.getAllByRole('button', { name: '开局' })[0]);
    selectGems();
    take();
    expect(TestWorker.all.at(-1)!.message!.level).toBe(5);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    await act(async () => {
      TestWorker.all.at(-1)!.reply({ t: 'buy', card: 999 });
    });
    fireEvent.click(screen.getByRole('button', { name: '重试 AI' }));
    expect(TestWorker.all.at(-1)!.message!.level).toBe(5);
    await act(async () => {
      TestWorker.all.at(-1)!.reply();
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.queryByRole('button', { name: '重试 AI' })).toBeNull();
    expect(screen.getByText(/轮到你：取丝线/)).toBeTruthy();
  });
});
