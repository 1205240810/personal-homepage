import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GoPage from '../../../app/games/go/online/page';
import BlackjackPage from '../../../app/games/blackjack/online/page';
import HoldemPage from '../../../app/games/holdem-lab/online/page';
import GomokuPage from '../../../app/games/gomoku/online/page';
import QuoridorPage from '../../../app/games/quoridor/online/page';
import ExpeditionPage from '../../../app/games/expedition/online/page';
import BazaarPage from '../../../app/games/bazaar/online/page';
import GlazePage from '../../../app/games/glaze/online/page';
import BrocadePage from '../../../app/games/brocade/online/page';
import JunqiPage from '../../../app/games/junqi/online/page';

vi.mock('../../../components/play/use-room', () => ({
  useRoom: () => [
    {
      status: 'idle',
      code: null,
      seat: null,
      seats: [],
      view: null,
      version: 0,
      clock: null,
      error: null,
    },
    { act: vi.fn(), create: vi.fn(), join: vi.fn() },
  ],
  roomFromUrl: () => null,
  inviteLink: () => '',
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('online game return navigation', () => {
  for (const [game, Page] of [
    ['go', GoPage],
    ['blackjack', BlackjackPage],
    ['holdem-lab', HoldemPage],
    ['gomoku', GomokuPage],
    ['quoridor', QuoridorPage],
    ['expedition', ExpeditionPage],
    ['bazaar', BazaarPage],
    ['glaze', GlazePage],
    ['brocade', BrocadePage],
    ['junqi', JunqiPage],
  ] as const) {
    for (const fromExplore of [false, true]) {
      it(`${game} ${fromExplore ? 'preserves the explore return path' : 'keeps direct visits untagged'}`, async () => {
        const page = await Page({
          searchParams: Promise.resolve({
            from: fromExplore ? 'explore' : undefined,
          }),
        });
        render(page);
        const query = fromExplore ? '?from=explore' : '';
        expect(
          screen.getByRole('link', { name: '返回单机' }).getAttribute('href'),
        ).toBe(`/games/${game}${query}`);
        expect(
          screen.getByRole('link', { name: '返回游戏室' }).getAttribute('href'),
        ).toBe(`/games${query}`);
        expect(
          screen
            .getByRole('link', { name: fromExplore ? '返回机甲' : '进入机甲' })
            .getAttribute('href'),
        ).toBe('/explore');
      });
    }
  }
});
