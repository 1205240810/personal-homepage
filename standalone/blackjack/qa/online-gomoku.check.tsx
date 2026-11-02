import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GomokuOnline } from '../../../components/play/online-gomoku';
import { BLACK, WHITE } from '../../../lib/games/gomoku';
import {
  gomokuOnline,
  type GomokuOnlineView,
} from '../../../lib/multiplayer/gomoku-online';
import type { PlaySnapshot } from '../../../lib/multiplayer/client';

const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: (code: string) =>
    `http://localhost/games/gomoku/online?room=${code}`,
}));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

let snap: PlaySnapshot<GomokuOnlineView>;
beforeEach(() => {
  mocks.act.mockClear();
  mocks.useRoom.mockReset();
  const state = gomokuOnline.presence!(
    gomokuOnline.create(
      gomokuOnline.options({ creator: 'black' }),
      () => 0.1,
      0,
    ),
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
      ...(gomokuOnline.view(state, 0, 0) as GomokuOnlineView),
      positionRevision: 7,
      undoRevision: 3,
    },
    version: 10,
    clock: null,
    error: null,
  };
  mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('五子棋联机动作', () => {
  it('binds invitations to Gomoku and sends the displayed board revision with moves', () => {
    render(<GomokuOnline />);
    expect(mocks.useRoom).toHaveBeenCalledWith('gomoku');
    fireEvent.click(screen.getByRole('button', { name: 'H8' }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      p: 112,
      positionRevision: 7,
      undoRevision: 3,
    });
    fireEvent.click(screen.getByRole('button', { name: '认输' }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'resign',
      positionRevision: 7,
      undoRevision: 3,
    });
  });

  it('sends the current request revision when accepting or rejecting undo', () => {
    snap.view = { ...snap.view!, moves: [112, 0] };
    const ui = render(<GomokuOnline />);
    fireEvent.click(screen.getByRole('button', { name: '请求悔棋' }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'undo-request',
      positionRevision: 7,
      undoRevision: 3,
    });
    snap.view = { ...snap.view!, undoFrom: 1, undoRevision: 4 };
    ui.rerender(<GomokuOnline />);
    fireEvent.click(screen.getByRole('button', { name: '同意' }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'undo-answer',
      accept: true,
      positionRevision: 7,
      undoRevision: 4,
    });
    snap.view = { ...snap.view!, undoRevision: 5 };
    ui.rerender(<GomokuOnline />);
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'undo-answer',
      accept: false,
      positionRevision: 7,
      undoRevision: 5,
    });
  });

  it('requires white to have made a move before requesting undo', () => {
    snap.seat = 1;
    snap.view = { ...snap.view!, you: WHITE, toPlay: WHITE, moves: [112] };
    const ui = render(<GomokuOnline />);
    const button = screen.getByRole('button', { name: '请求悔棋' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(mocks.act).not.toHaveBeenCalled();
    snap.view = { ...snap.view!, toPlay: BLACK, moves: [112, 0] };
    ui.rerender(<GomokuOnline />);
    expect(button).toHaveProperty('disabled', false);
  });

  it('prevents every consequential action while reconnecting', () => {
    snap.status = 'reconnecting';
    snap.view = { ...snap.view!, moves: [0, 1], undoFrom: 1 };
    const ui = render(<GomokuOnline />);
    expect(screen.getByText('连接恢复后可继续操作…')).toBeTruthy();
    for (const name of ['H8', '请求悔棋', '认输', '同意', '拒绝'])
      fireEvent.click(screen.getByRole('button', { name }));
    expect(mocks.act).not.toHaveBeenCalled();
    snap.view = {
      ...snap.view!,
      winner: WHITE,
      reason: 'resign',
      undoFrom: null,
    };
    ui.rerender(<GomokuOnline />);
    fireEvent.click(screen.getByRole('button', { name: /再来一局/ }));
    expect(mocks.act).not.toHaveBeenCalled();
  });

  it('names the resigning side correctly and ties a rematch to the displayed result', () => {
    snap.view = {
      ...snap.view!,
      winner: WHITE,
      reason: 'resign',
      positionRevision: 8,
    };
    const ui = render(<GomokuOnline />);
    expect(screen.getByText('你已认输')).toBeTruthy();
    expect(screen.queryByText('对方认输')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /再来一局/ }));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'rematch',
      positionRevision: 8,
      undoRevision: 3,
    });
    snap.view = { ...snap.view!, you: WHITE };
    ui.rerender(<GomokuOnline />);
    expect(screen.getByText('对方认输')).toBeTruthy();
  });
});
