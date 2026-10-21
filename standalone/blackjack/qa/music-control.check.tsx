import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MusicControl } from '../../../components/world/music-control';

// Playback is not implemented by jsdom. Exercise native event ordering and
// delayed play promises here; the real browser audit covers decoding/network.
vi.mock('../../../components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: () => null,
  PopoverTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));
let hidden = false;
const media = () => document.querySelector('audio')!;
const toggle = () => screen.getByRole('button', { name: /背景音乐：/ });
const next = () => fireEvent.click(screen.getByRole('button', { name: '下一首' }));
const flush = () => act(async () => { await Promise.resolve(); });
function metadata(player: HTMLAudioElement, duration: number) {
  Object.defineProperty(player, 'duration', { configurable: true, value: duration });
  Object.defineProperty(player, 'readyState', { configurable: true, value: 1 });
  fireEvent.loadedMetadata(player);
}
function deferred() {
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((_resolve, fail) => { reject = fail; });
  return { promise, reject };
}
beforeEach(() => {
  hidden = false;
  localStorage.clear();
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('restores track, volume and near-end progress without fetching or autoplay', () => {
  localStorage.setItem('mecha-music-volume', '0.6');
  localStorage.setItem('mecha-music-state', JSON.stringify({ id: 'evening', time: 185 }));
  render(<MusicControl reading={false} />);
  expect(media().getAttribute('src')).toBe('/audio/evening.mp3');
  expect(media().preload).toBe('none');
  expect(media().volume).toBe(0.6);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  fireEvent.timeUpdate(media());
  expect(JSON.parse(localStorage.getItem('mecha-music-state')!).time).toBe(185);
  metadata(media(), 186.28);
  expect(media().currentTime).toBe(185);
});

it.each([-4, 1e200, 'Infinity', 'wrong'])('rejects invalid saved progress %s', (time) => {
  localStorage.setItem('mecha-music-state', JSON.stringify({ id: 'dreamer', time }));
  render(<MusicControl reading={false} />);
  expect(screen.getByRole('slider', { name: '播放进度' }).getAttribute('aria-valuetext')).toBe('0:00 / 3:24');
  metadata(media(), 204);
  expect(media().currentTime).toBe(0);
});

it('ignores a rejected play request after pause and a newer successful play', async () => {
  const old = deferred();
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => old.promise);
  render(<MusicControl reading={false} />);
  fireEvent.click(toggle());
  fireEvent.click(toggle());
  fireEvent.click(toggle());
  await flush();
  await act(async () => { old.reject(new Error('AbortError')); });
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByRole('status')).toBeNull();
  next();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3);
});

it('isolates pending play promises and media elements when switching tracks', async () => {
  const old = deferred();
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => old.promise);
  render(<MusicControl reading={false} />);
  const first = media();
  fireEvent.click(toggle());
  next();
  expect(media()).not.toBe(first);
  expect(media().getAttribute('src')).toBe('/audio/evening.mp3');
  await act(async () => { old.reject(new Error('Interrupted by new load')); });
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByRole('status')).toBeNull();
  next();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3);
});

it('resumes a requested track after hiding interrupted its initial play', async () => {
  const old = deferred();
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => old.promise);
  render(<MusicControl reading={false} />);
  fireEvent.click(toggle());
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => { old.reject(new Error('Pause interrupted play')); });
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  await flush();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(toggle());
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});

it('applies reading volume to every newly selected audio element', () => {
  const view = render(<MusicControl reading />);
  expect(media().volume).toBeCloseTo(0.084);
  next();
  expect(media().volume).toBeCloseTo(0.084);
  view.rerender(<MusicControl reading={false} />);
  expect(media().volume).toBeCloseTo(0.2);
});

it('keeps seek requests until metadata arrives and starts a selected track', async () => {
  render(<MusicControl reading={false} />);
  fireEvent.change(screen.getByRole('slider', { name: '播放进度' }), { target: { value: '45' } });
  fireEvent.timeUpdate(media());
  metadata(media(), 153.3);
  expect(media().currentTime).toBe(45);
  fireEvent.click(screen.getByRole('button', { name: 'Dreamer 3:24' }));
  await flush();
  expect(media().getAttribute('src')).toBe('/audio/dreamer.mp3');
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  expect(JSON.parse(localStorage.getItem('mecha-music-state')!)).toEqual({ id: 'dreamer', time: 0 });
});

it('reloads a failed source before retry and keeps storage exceptions nonfatal', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  render(<MusicControl reading={false} />);
  Object.defineProperty(media(), 'error', { configurable: true, value: { code: 2 } });
  fireEvent.error(media());
  fireEvent.click(toggle());
  await flush();
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(toggle());
  expect(toggle().getAttribute('aria-pressed')).toBe('false');
});

it('advances when an intended track ends but does not restart after pause', async () => {
  render(<MusicControl reading={false} />);
  fireEvent.click(toggle());
  await flush();
  fireEvent.ended(media());
  expect(media().getAttribute('src')).toBe('/audio/evening.mp3');
  await flush();
  fireEvent.click(toggle());
  fireEvent.ended(media());
  expect(media().getAttribute('src')).toBe('/audio/evening.mp3');
});

it('preserves a pending restored seek when paused before metadata arrives', () => {
  localStorage.setItem('mecha-music-state', JSON.stringify({ id: 'dreamer', time: 60 }));
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(new Promise(() => {}));
  render(<MusicControl reading={false} />);
  fireEvent.click(toggle());
  fireEvent.click(toggle());
  expect(JSON.parse(localStorage.getItem('mecha-music-state')!).time).toBe(60);
});
