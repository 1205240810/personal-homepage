import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JunqiOnline } from '../../../components/play/online-junqi';
import {
  junqiOnline,
  type JunqiOnlineState,
  type JunqiOnlineView,
} from '../../../lib/multiplayer/junqi-online';
import { PRESETS } from '../../../lib/games/junqi-layouts';
import type { PlaySnapshot } from '../../../lib/multiplayer/client';
const mocks = vi.hoisted(() => ({ useRoom: vi.fn(), act: vi.fn() }));
vi.mock('../../../components/play/use-room', () => ({
  useRoom: mocks.useRoom,
  roomFromUrl: () => null,
  inviteLink: (code: string) =>
    `http://localhost/games/junqi/online?room=${code}`,
}));
let snap: PlaySnapshot<JunqiOnlineView>;
const setState = (state: JunqiOnlineState, seat = 0) => {
  snap = {
    status: 'open',
    code: 'ABCDEF',
    seat,
    seats: [
      { name: '甲', online: true, taken: true },
      { name: '乙', online: true, taken: true },
    ],
    view: {
      ...(junqiOnline.view(state, seat, 0) as JunqiOnlineView),
      positionRevision: 7,
    },
    version: 10,
    clock: null,
    error: null,
  };
};
const fresh = () =>
  junqiOnline.presence!(
    junqiOnline.create({ creator: 'first', open: false }, () => 0.1, 0),
    [true, true],
    0,
  );
beforeEach(() => {
  mocks.act.mockClear();
  setState(fresh());
  mocks.useRoom.mockImplementation(() => [snap, { act: mocks.act }]);
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const button = (name: RegExp) =>
  screen.getAllByRole('button', { name }).at(0) as HTMLButtonElement;

describe('军棋联机客户端', () => {
  it('submits the arranged layout and preserves the explore return path', () => {
    render(<JunqiOnline fromExplore />);
    expect(mocks.useRoom).toHaveBeenCalledWith('junqi');
    expect(
      screen.getByText('返回单机', { selector: 'a' }).getAttribute('href'),
    ).toBe('/games/junqi?from=explore');
    fireEvent.click(button(/布阵完成/));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'deploy',
      layout: PRESETS[0].layout,
      positionRevision: 7,
    });
  });

  it('moves with the displayed revision once both sides are deployed', () => {
    const rng = () => 0.3;
    let s = fresh();
    s = junqiOnline.act(
      s,
      0,
      { type: 'deploy', layout: PRESETS[0].layout },
      rng,
      0,
    ).state!;
    s = junqiOnline.act(
      s,
      1,
      { type: 'deploy', layout: PRESETS[2].layout },
      rng,
      0,
    ).state!;
    setState(s);
    render(<JunqiOnline />);
    expect(screen.getByText(/轮到你/)).toBeTruthy();
    fireEvent.click(button(/我方D1 铁路 我方军长/));
    fireEvent.click(button(/我方D2 行营 空 可走/));
    expect(mocks.act).toHaveBeenLastCalledWith({
      type: 'move',
      move: { from: 33, to: 38 },
      positionRevision: 7,
    });
    // 对方棋子都是背面。
    expect(screen.getAllByRole('button', { name: /对方暗子/ })).toHaveLength(
      25,
    );
  });
});
