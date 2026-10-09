// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sound = vi.hoisted(() => ({ start: vi.fn(), setMusicEnabled: vi.fn(), setMusicVolume: vi.fn(), setSfxEnabled: vi.fn(), setSfxVolume: vi.fn(), play: vi.fn(), pause: vi.fn(), resume: vi.fn(), suspend: vi.fn(), dispose: vi.fn() }));
vi.mock('./audio', () => ({ createAudio: () => sound }));
import { StudGame } from './StudGame';
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.clearAllMocks(); sound.start.mockResolvedValue(true); sound.resume.mockResolvedValue(true); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('table-side audio controls', () => {
  it('defaults off and exposes music and volume outside the settings dialog', async () => {
    render(<StudGame persist={false} />); expect(screen.getByRole('button', { name: '打开背景音乐' }).getAttribute('aria-pressed')).toBe('false'); expect(screen.getByRole('slider', { name: '桌边音乐音量' })).toBeTruthy(); expect(sound.start).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '打开背景音乐' }))); expect(sound.start).toHaveBeenCalledTimes(1); expect(sound.setMusicEnabled).toHaveBeenLastCalledWith(true); expect(screen.getByRole('button', { name: '关闭背景音乐' })).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: '桌边音乐音量' }), { target: { value: '42' } }); expect(sound.setMusicVolume).toHaveBeenLastCalledWith(.42);
  });
  it('pauses audio for reading a modal, closing resumes, and explicit pause stays paused', async () => {
    render(<StudGame persist={false} />); await act(async () => fireEvent.click(screen.getByRole('button', { name: '打开背景音乐' }))); sound.pause.mockClear(); sound.resume.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '规则' })); expect(sound.pause).toHaveBeenCalledTimes(1); fireEvent.keyDown(document, { key: 'Escape' }); expect(sound.resume).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '暂停' })); sound.resume.mockClear(); fireEvent.click(screen.getByRole('button', { name: '设置' })); fireEvent.keyDown(document, { key: 'Escape' }); expect(sound.resume).not.toHaveBeenCalled();
  });
  it('does not interrupt a game when starting audio rejects or resolves after unmount', async () => {
    sound.start.mockRejectedValueOnce(new Error('blocked')); const component = render(<StudGame persist={false} />); await act(async () => fireEvent.click(screen.getByRole('button', { name: '打开背景音乐' }))); expect(screen.getByText(/声音暂时无法开启/)).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: /入席/ })); expect(screen.queryByRole('button', { name: /入席/ })).toBeNull(); component.unmount();
    let resolve!: (value: boolean) => void; sound.start.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; })); const late = render(<StudGame persist={false} />); fireEvent.click(screen.getByRole('button', { name: '打开背景音乐' })); sound.setMusicEnabled.mockClear(); late.unmount(); await act(async () => resolve(true)); expect(sound.setMusicEnabled).not.toHaveBeenCalled(); expect(sound.dispose).toHaveBeenCalled();
  });
});
