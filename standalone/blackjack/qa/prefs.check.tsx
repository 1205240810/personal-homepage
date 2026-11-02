import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChessGame } from '../../../components/games/chess';
import { GoGame } from '../../../components/games/go';

const save = (name: string, value: unknown) =>
  localStorage.setItem(`tscjj-pref:${name}`, JSON.stringify(value));
const select = (label: string) =>
  screen.getByLabelText<HTMLSelectElement>(label);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
      terminate() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('restores a saved chess setting without writing the default during effect replay', () => {
  save('chess-level', 8);
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const view = render(
    <StrictMode>
      <ChessGame />
    </StrictMode>,
  );
  expect(select('难度').value).toBe('8');
  expect(
    writes.mock.calls.filter(([key]) => key === 'tscjj-pref:chess-level'),
  ).not.toContainEqual(['tscjj-pref:chess-level', '2']);
  fireEvent.change(select('难度'), { target: { value: '6' } });
  view.unmount();
  render(<ChessGame />);
  expect(select('难度').value).toBe('6');
});

it('restores Go settings under effect replay but applies them only on a new match', () => {
  save('go-size', 19);
  save('go-level', 6);
  save('go-handicap', 9);
  render(
    <StrictMode>
      <GoGame />
    </StrictMode>,
  );
  expect(select('棋盘').value).toBe('19');
  expect(select('难度（下局生效）').value).toBe('6');
  expect(select('让子').value).toBe('9');
  expect(document.querySelectorAll('.go-pt')).toHaveLength(81);
  fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
  expect(document.querySelectorAll('.go-pt')).toHaveLength(361);
  expect(document.querySelectorAll('.go-stone.is-black')).toHaveLength(9);
  expect(screen.getByText(/19 路 · 6 · 中级进阶 · 执黑/)).toBeTruthy();
});

it('keeps native Go choices made before hydration instead of restoring stale preferences', async () => {
  save('go-size', 19);
  save('go-level', 3);
  save('go-handicap', 2);
  const host = document.createElement('div');
  host.innerHTML = renderToString(<GoGame />);
  document.body.append(host);
  const get = (label: string) =>
    host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  get('棋盘').value = '13';
  get('难度（下局生效）').value = '8';
  get('让子').value = '5';
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(host, <GoGame />, {
        onRecoverableError: (error) => errors.push(error),
      });
    });
    expect(get('棋盘').value).toBe('13');
    expect(get('难度（下局生效）').value).toBe('8');
    expect(get('让子').value).toBe('5');
    expect(localStorage.getItem('tscjj-pref:go-size')).toBe('13');
    expect(errors).toEqual([]);
  } finally {
    act(() => root?.unmount());
    host.remove();
  }
});

it.each([
  [1, 0],
  [1.5, 0],
  [10, 0],
  [-1, 0],
  ['3', 0],
  [9, 5],
])(
  'normalizes unavailable Go handicap %s to %s on a nine-line board',
  (saved, expected) => {
    save('go-size', 9);
    save('go-handicap', saved);
    render(<GoGame />);
    expect(select('让子').value).toBe(String(expected));
    expect(localStorage.getItem('tscjj-pref:go-handicap')).toBe(
      String(expected),
    );
  },
);

it('ignores corrupt or invalid settings without replacing game records', () => {
  localStorage.setItem('tscjj-pref:chess-level', '{');
  save('go-size', 15);
  save('go-level', '8');
  localStorage.setItem('unrelated-game-record', 'preserve');
  const view = render(<ChessGame />);
  expect(select('难度').value).toBe('2');
  view.unmount();
  render(<GoGame />);
  expect(select('棋盘').value).toBe('9');
  expect(select('难度（下局生效）').value).toBe('2');
  expect(localStorage.getItem('unrelated-game-record')).toBe('preserve');
});

it.each(['getItem', 'setItem'] as const)(
  'remains usable when storage %s throws',
  (method) => {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('blocked');
    });
    render(<ChessGame />);
    fireEvent.change(select('难度'), { target: { value: '4' } });
    expect(select('难度').value).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: '执白开局' }));
    expect(document.querySelectorAll('.chess-sq')).toHaveLength(64);
  },
);
