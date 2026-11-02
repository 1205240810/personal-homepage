import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HanamiPage from '../../../app/games/hanami/online/page';
import { HanamiOnline } from '../../../components/play/online-hanami';
import { apply, newGame, type HanamiState } from '../../../lib/games/hanami';
import {
  hanamiOnline,
  type HanamiOnlineView,
} from '../../../lib/multiplayer/hanami-online';
import type { PlaySnapshot } from '../../../lib/multiplayer/client';

const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: (code: string) =>
    `http://localhost/games/hanami/online?room=${code}`,
}));

let snap: PlaySnapshot<HanamiOnlineView>;
const project = (game: HanamiState, revision = 7) =>
  hanamiOnline.view(
    {
      ...hanamiOnline.create({}, () => 0.3, 0),
      started: true,
      game,
      positionRevision: revision,
    },
    0,
    0,
  ) as HanamiOnlineView;
beforeEach(() => {
  mocks.act.mockClear();
  mocks.useRoom.mockReset();
  snap = {
    status: 'open',
    code: 'ABCDEF',
    seat: 0,
    seats: [
      { name: '甲', online: true, taken: true },
      { name: '乙', online: true, taken: true },
    ],
    view: project(newGame(() => 0.3)),
    version: 10,
    clock: null,
    error: null,
  };
  mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('花街七席联机状态与导航', () => {
  it('binds the room to Hanami and sends the displayed revision with chosen cards', () => {
    render(<HanamiOnline />);
    expect(mocks.useRoom).toHaveBeenCalledWith('hanami');
    fireEvent.click(screen.getByRole('button', { name: /^藏/ }));
    fireEvent.click(
      within(screen.getByLabelText('你的手牌')).getAllByRole('button')[0],
    );
    fireEvent.click(screen.getByRole('button', { name: /确认藏/ }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      move: { type: 'secret', cards: [snap.view!.hand[0]] },
      positionRevision: 7,
    });
  });

  it('discards selected card indices after an authoritative revision or reconnect', () => {
    const ui = render(<HanamiOnline />);
    const select = () => {
      fireEvent.click(screen.getByRole('button', { name: /^藏/ }));
      fireEvent.click(
        within(screen.getByLabelText('你的手牌')).getAllByRole('button')[0],
      );
      expect(screen.getByRole('button', { name: /确认藏/ })).toHaveProperty(
        'disabled',
        false,
      );
    };
    select();
    snap.view = { ...snap.view!, positionRevision: 8 };
    ui.rerender(<HanamiOnline />);
    expect(screen.queryByRole('button', { name: /确认藏/ })).toBeNull();
    select();
    snap.status = 'reconnecting';
    ui.rerender(<HanamiOnline />);
    expect(screen.queryByRole('button', { name: /确认藏/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^藏/ })).toHaveProperty(
      'disabled',
      true,
    );
    snap.status = 'open';
    ui.rerender(<HanamiOnline />);
    expect(screen.queryByRole('button', { name: /确认藏/ })).toBeNull();
    expect(mocks.act).not.toHaveBeenCalled();
  });

  it('allows only the connected responder to pick an offered card', () => {
    let game = newGame(() => 0.3, 1);
    game = apply(game, 1, {
      type: 'gift',
      cards: game.hands[1].slice(0, 3),
    } as never);
    snap.view = project(game);
    snap.status = 'reconnecting';
    const ui = render(<HanamiOnline />);
    const pick = () =>
      within(screen.getByLabelText('对方的出牌')).getAllByRole('button')[1];
    fireEvent.click(pick());
    expect(mocks.act).not.toHaveBeenCalled();
    snap.status = 'open';
    ui.rerender(<HanamiOnline />);
    fireEvent.click(pick());
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      move: { type: 'pick', index: 1 },
      positionRevision: 7,
    });
  });

  it('ties next-round and rematch consent to the current result, and blocks offline consent', () => {
    snap.view = { ...snap.view!, phase: 'round-end', decider: null };
    const ui = render(<HanamiOnline />);
    fireEvent.click(screen.getByRole('button', { name: /下一轮/ }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'next',
      positionRevision: 7,
    });
    snap.status = 'reconnecting';
    ui.rerender(<HanamiOnline />);
    expect(screen.getByRole('button', { name: /下一轮/ })).toHaveProperty(
      'disabled',
      true,
    );
    snap.view = {
      ...snap.view!,
      phase: 'over',
      positionRevision: 19,
      result: { winner: 0, reason: 'points', points: [11, 3], patrons: [3, 1] },
    };
    ui.rerender(<HanamiOnline />);
    expect(screen.queryByRole('button', { name: '再来一局' })).toBeNull();
    snap.status = 'open';
    ui.rerender(<HanamiOnline />);
    fireEvent.click(screen.getByRole('button', { name: '再来一局' }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'rematch',
      positionRevision: 19,
    });
    snap.view = { ...snap.view!, ready: [true, false] };
    ui.rerender(<HanamiOnline />);
    expect(screen.queryByRole('button', { name: '再来一局' })).toBeNull();
    expect(screen.getByText(/已准备，等待对方/)).toBeTruthy();
  });

  for (const fromExplore of [false, true]) {
    it(`preserves ${fromExplore ? 'explore origin' : 'a direct visit'} throughout the online route`, async () => {
      render(
        await HanamiPage({
          searchParams: Promise.resolve({
            from: fromExplore ? 'explore' : undefined,
          }),
        }),
      );
      expect(
        screen.getByRole('link', { name: '返回单机' }).getAttribute('href'),
      ).toBe(`/games/hanami${fromExplore ? '?from=explore' : ''}`);
      expect(
        screen.getByRole('link', { name: '返回游戏室' }).getAttribute('href'),
      ).toBe(`/games${fromExplore ? '?from=explore' : ''}`);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        '花街七席联机',
      );
    });
  }
});
