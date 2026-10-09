import { act, cleanup, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameRoom, GamePageFrame } from '../../../components/games/game-room';
import { RecentGames } from '../../../components/games/recent-games';
import { getGame } from '../../../lib/games/catalog';
import { RECENT_GAMES_KEY } from '../../../lib/games/recent';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('game room shortcuts', () => {
  it('lists the date-seeded games under 今日挑战 and keeps the explore return path', () => {
    render(<GameRoom fromExplore />);
    const daily = screen.getByRole('region', { name: '今日挑战' });
    const links = within(daily).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/games/signal-pulse?from=explore',
      '/games/circuit-repair?from=explore',
      '/games/mech-sweeper?from=explore',
      '/games/fault-finder?from=explore',
    ]);
  });

  it('renders no recent list on the server or for a first visit', () => {
    expect(renderToString(<RecentGames />)).toBe('');
    render(<RecentGames />);
    expect(screen.queryByRole('region', { name: '最近玩过' })).toBeNull();
  });

  it('a game page records the visit and the room shows it newest first', () => {
    const a = render(
      <GamePageFrame game={getGame('mech-sweeper')}>
        <p>board</p>
      </GamePageFrame>,
    );
    a.unmount();
    const b = render(
      <GamePageFrame game={getGame('signal-pulse')}>
        <p>board</p>
      </GamePageFrame>,
    );
    b.unmount();
    render(<GameRoom />);
    const recent = screen.getByRole('region', { name: '最近玩过' });
    const links = within(recent).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      '信号接力今天',
      '机甲扫雷今天',
    ]);
    expect(links[0].getAttribute('href')).toBe('/games/signal-pulse');
  });

  it('ignores tampered storage and refreshes on a storage event', () => {
    localStorage.setItem(RECENT_GAMES_KEY, '[{"id":"evil","at":1}]');
    render(<RecentGames />);
    expect(screen.queryByRole('region', { name: '最近玩过' })).toBeNull();
    act(() => {
      localStorage.setItem(
        RECENT_GAMES_KEY,
        JSON.stringify([{ id: 'sudoku', at: Date.now() }]),
      );
      window.dispatchEvent(
        new StorageEvent('storage', { key: RECENT_GAMES_KEY }),
      );
    });
    expect(
      within(screen.getByRole('region', { name: '最近玩过' })).getByRole('link')
        .textContent,
    ).toBe('九间数独今天');
  });
});
