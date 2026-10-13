import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeSwitcher } from '../../../components/theme/theme-switcher';
import { THEME_STORAGE_KEY } from '../../../lib/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute('data-theme', 'default');
  document.documentElement.style.colorScheme = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps a local theme choice when storage is readable but writes fail', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  const first = render(<ThemeSwitcher />);
  fireEvent.click(screen.getByRole('button', { name: '科技主题：已关闭' }));
  expect(document.documentElement.getAttribute('data-theme')).toBe('tech');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  first.unmount();
  render(<ThemeSwitcher />);
  fireEvent.click(screen.getByRole('button', { name: '科技主题：已开启' }));
  expect(document.documentElement.getAttribute('data-theme')).toBe('default');
});

it('follows the boot script without reading storage during render', () => {
  document.documentElement.setAttribute('data-theme', 'tech');
  const read = vi.spyOn(Storage.prototype, 'getItem');
  render(<ThemeSwitcher />);
  expect(screen.getByRole('button', { name: '科技主题：已开启' })).toBeTruthy();
  expect(read).not.toHaveBeenCalled();
});

it('syncs theme changes and clears from other tabs, ignoring unrelated storage', () => {
  render(<ThemeSwitcher />);
  const change = (
    storageArea: Storage,
    key: string | null,
    newValue: string | null,
  ) =>
    act(() => {
      if (key === null) storageArea.clear();
      else if (newValue === null) storageArea.removeItem(key);
      else storageArea.setItem(key, newValue);
      window.dispatchEvent(
        new StorageEvent('storage', { storageArea, key, newValue }),
      );
    });
  change(sessionStorage, THEME_STORAGE_KEY, 'tech');
  change(localStorage, 'game-save', 'tech');
  expect(document.documentElement.getAttribute('data-theme')).toBe('default');
  change(localStorage, THEME_STORAGE_KEY, 'tech');
  expect(screen.getByRole('button', { name: '科技主题：已开启' })).toBeTruthy();
  change(localStorage, null, null);
  expect(screen.getByRole('button', { name: '科技主题：已关闭' })).toBeTruthy();
});

it('ignores a queued storage value after a newer local choice was saved', () => {
  render(<ThemeSwitcher />);
  localStorage.setItem(THEME_STORAGE_KEY, 'tech');
  const queuedEvent = new StorageEvent('storage', {
    storageArea: localStorage,
    key: THEME_STORAGE_KEY,
    newValue: 'tech',
  });
  fireEvent.click(screen.getByRole('button', { name: '科技主题：已关闭' }));
  fireEvent.click(screen.getByRole('button', { name: '科技主题：已开启' }));
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('default');
  act(() => window.dispatchEvent(queuedEvent));
  expect(screen.getByRole('button', { name: '科技主题：已关闭' })).toBeTruthy();
  expect(document.documentElement.getAttribute('data-theme')).toBe('default');
});

it('persists successful changes and notifies every mounted switcher', () => {
  render(
    <>
      <ThemeSwitcher />
      <ThemeSwitcher />
    </>,
  );
  fireEvent.click(screen.getAllByRole('button')[0]);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('tech');
  expect(
    screen.getAllByRole('button', { name: '科技主题：已开启' }),
  ).toHaveLength(2);
});
