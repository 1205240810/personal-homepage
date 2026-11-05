import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoridorOnline } from '../../../components/play/online-quoridor';
import {
  quoridorOnline,
  type QuoridorOnlineView,
} from '../../../lib/multiplayer/quoridor-online';
import type { PlaySnapshot } from '../../../lib/multiplayer/client';
const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: (code: string) =>
    `http://localhost/games/quoridor/online?room=${code}`,
}));
let snap: PlaySnapshot<QuoridorOnlineView>;
beforeEach(() => {
  mocks.act.mockClear();
  const state = quoridorOnline.presence!(
    quoridorOnline.create({ creator: 'first' }, () => 0.1, 0),
    [true, true],
    0,
  );
  snap = {
    status: 'open',
    code: 'ABCDEF',
    seat: 0,
    seats: [
      { name: '甲', online: true, taken: true },
      { name: '乙', online: true, taken: true },
    ],
    view: {
      ...(quoridorOnline.view(state, 0, 0) as QuoridorOnlineView),
      positionRevision: 7,
    },
    version: 10,
    clock: null,
    error: null,
  };
  mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('步步为营联机客户端', () => {
  it('sends the displayed revision and preserves the explore return path', () => {
    render(<QuoridorOnline fromExplore />);
    expect(mocks.useRoom).toHaveBeenCalledWith('quoridor');
    expect(
      screen.getByText('返回单机', { selector: 'a' }).getAttribute('href'),
    ).toBe('/games/quoridor?from=explore');
    fireEvent.click(screen.getByLabelText('e2 可走'));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      move: { t: 'm', to: 67 },
      positionRevision: 7,
    });
    fireEvent.click(screen.getByText('认输', { selector: 'button' }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'resign',
      positionRevision: 7,
    });
  });
  it('blocks actions during reconnect and clears the old wall preview on recovery', () => {
    const view = render(<QuoridorOnline />);
    fireEvent.click(
      screen.getByText('横墙', { selector: 'button', exact: true }),
    );
    fireEvent.click(screen.getByLabelText('横墙 d5'));
    snap = { ...snap, status: 'reconnecting' };
    view.rerender(<QuoridorOnline />);
    fireEvent.click(screen.getByText('认输', { selector: 'button' }));
    expect(mocks.act).not.toHaveBeenCalled();
    snap = { ...snap, status: 'open' };
    view.rerender(<QuoridorOnline />);
    fireEvent.click(screen.getByLabelText('横墙 d5'));
    expect(mocks.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('横墙 d5'));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      move: { t: 'w', o: 'h', x: 3, y: 3 },
      positionRevision: 7,
    });
  });
  it('blocks disconnected rematches and sends the current result revision after recovery', () => {
    snap = {
      ...snap,
      status: 'reconnecting',
      view: {
        ...snap.view!,
        game: { ...snap.view!.game, winner: 1, reason: 'resign' },
        positionRevision: 8,
      },
    };
    const view = render(<QuoridorOnline />);
    expect(screen.queryByRole('button', { name: /再来一局/ })).toBeNull();
    snap = { ...snap, status: 'open' };
    view.rerender(<QuoridorOnline />);
    fireEvent.click(screen.getByRole('button', { name: /再来一局/ }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'rematch',
      positionRevision: 8,
    });
  });
});
