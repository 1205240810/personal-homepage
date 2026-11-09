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
      {
        type: 'deploy',
        layout: PRESETS[0].layout,
        positionRevision: s.positionRevision,
      },
      rng,
      0,
    ).state!;
    s = junqiOnline.act(
      s,
      1,
      {
        type: 'deploy',
        layout: PRESETS[2].layout,
        positionRevision: s.positionRevision,
      },
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

  it('keeps deployment pending across presence and the opponent submitting, and retries only after a new rejection', () => {
    const rendered = render(<JunqiOnline />);
    const send = () => fireEvent.click(button(/布阵完成/));
    send();
    send();
    expect(mocks.act).toHaveBeenCalledTimes(1);
    expect(button(/布阵完成/).disabled).toBe(true);
    // Presence replaces the JSON view but does not acknowledge our layout.
    snap = { ...snap, version: 11, view: structuredClone(snap.view!) };
    rendered.rerender(<JunqiOnline />);
    send();
    expect(mocks.act).toHaveBeenCalledTimes(1);
    snap = {
      ...snap,
      version: 12,
      view: {
        ...snap.view!,
        positionRevision: 8,
        game: { ...snap.view!.game, ready: [false, true] },
      },
    };
    rendered.rerender(<JunqiOnline />);
    send();
    expect(mocks.act).toHaveBeenCalledTimes(1);
    snap = { ...snap, error: '请重新操作' };
    rendered.rerender(<JunqiOnline />);
    expect(button(/布阵完成/).disabled).toBe(false);
    send();
    expect(mocks.act).toHaveBeenCalledTimes(2);
    expect(mocks.act).toHaveBeenLastCalledWith(
      expect.objectContaining({ positionRevision: 8 }),
    );
    // PlayClient clears an old error before this retry receives its response.
    snap = { ...snap, error: null };
    rendered.rerender(<JunqiOnline />);
    send();
    expect(mocks.act).toHaveBeenCalledTimes(2);
    snap = { ...snap, error: '请重新操作' };
    rendered.rerender(<JunqiOnline />);
    send();
    expect(mocks.act).toHaveBeenCalledTimes(3);
  });

  it('preserves selected moves on presence, clears them on disconnect, and prevents duplicate commands', () => {
    let state = fresh();
    for (const seat of [0, 1])
      state = junqiOnline.act(
        state,
        seat,
        {
          type: 'deploy',
          layout: PRESETS[0].layout,
          positionRevision: 0,
        },
        () => 0.3,
        0,
      ).state!;
    setState(state);
    const rendered = render(<JunqiOnline />);
    const piece = button(/我方D1 铁路 我方军长/);
    fireEvent.click(piece);
    expect(button(/我方D2 行营 空 可走/)).toBeTruthy();
    snap = { ...snap, version: 11, view: structuredClone(snap.view!) };
    rendered.rerender(<JunqiOnline />);
    expect(button(/我方D2 行营 空 可走/)).toBeTruthy();
    expect(button(/我方D1 铁路 我方军长/)).toBe(piece);
    snap = { ...snap, status: 'reconnecting' };
    rendered.rerender(<JunqiOnline />);
    expect(
      screen.queryByRole('button', { name: /我方D2 行营 空 可走/ }),
    ).toBeNull();
    snap = { ...snap, status: 'open' };
    rendered.rerender(<JunqiOnline />);
    fireEvent.click(button(/我方D2 行营 空/));
    expect(mocks.act).not.toHaveBeenCalled();
    fireEvent.click(piece);
    fireEvent.click(button(/我方D2 行营 空 可走/));
    fireEvent.click(piece);
    fireEvent.click(button(/我方D2 行营 空/));
    expect(mocks.act).toHaveBeenCalledTimes(1);
  });

  it('rejects delayed layouts and rematch consent from earlier rounds while allowing simultaneous deployment', () => {
    let state = fresh();
    const action = (seat: number, a: Record<string, unknown>) =>
      junqiOnline.act(state, seat, a, () => 0.3, 0);
    state = action(0, {
      type: 'deploy',
      layout: PRESETS[0].layout,
      positionRevision: 0,
    }).state!;
    expect(
      action(1, {
        type: 'deploy',
        layout: PRESETS[0].layout,
        positionRevision: -1,
      }).error,
    ).toMatch(/已更新/);
    state = action(1, {
      type: 'deploy',
      layout: PRESETS[0].layout,
      positionRevision: 0,
    }).state!;
    expect(state.game.phase).toBe('play');
    state = action(1, {
      type: 'resign',
      positionRevision: state.positionRevision,
    }).state!;
    const firstResult = state.positionRevision;
    state = action(0, {
      type: 'rematch',
      positionRevision: firstResult,
    }).state!;
    state = action(1, {
      type: 'rematch',
      positionRevision: firstResult,
    }).state!;
    expect(state.sides).toEqual([1, 0]);
    const secondRound = state.positionRevision;
    expect(
      action(0, {
        type: 'deploy',
        layout: PRESETS[0].layout,
        positionRevision: 0,
      }).error,
    ).toMatch(/已更新/);
    state = action(1, {
      type: 'deploy',
      layout: PRESETS[0].layout,
      positionRevision: secondRound,
    }).state!;
    expect(
      action(0, {
        type: 'deploy',
        layout: PRESETS[0].layout,
        positionRevision: firstResult,
      }).error,
    ).toMatch(/已更新/);
    state = action(0, {
      type: 'deploy',
      layout: PRESETS[0].layout,
      positionRevision: secondRound,
    }).state!;
    state = action(1, {
      type: 'resign',
      positionRevision: state.positionRevision,
    }).state!;
    expect(
      action(0, { type: 'rematch', positionRevision: firstResult }).error,
    ).toMatch(/已更新/);
    expect(state.rematch).toEqual([false, false]);
    expect(state.score).toEqual([2, 0]);
  });
});
