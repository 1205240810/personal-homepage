// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from './audio';

const makeOscillator = () => ({ type: 'sine', frequency: { value: 0 }, onended: null as (() => void) | null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn() });
type FakeOscillator = ReturnType<typeof makeOscillator>;
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = 'suspended'; currentTime = 0; destination = {};
  oscillators: FakeOscillator[] = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() { return { gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
  createOscillator(): FakeOscillator { const node = makeOscillator(); this.oscillators.push(node); return node; }
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}
beforeEach(() => { vi.useFakeTimers(); FakeAudioContext.instances = []; vi.stubGlobal('AudioContext', FakeAudioContext); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Stud audio authorization and resource lifecycle', () => {
  it('allocates no context or score before an explicit gesture', async () => {
    const audio = createAudio('stud'); audio.setMusicEnabled(true); audio.play('card');
    expect(await audio.resume()).toBe(false); expect(FakeAudioContext.instances).toHaveLength(0); expect(vi.getTimerCount()).toBe(0); audio.dispose();
  });
  it('starts a single scheduler, stops it on pause, and resumes without replaying a backlog', async () => {
    const audio = createAudio('stud'); expect(await audio.start()).toBe(true); audio.setMusicEnabled(true);
    const context = FakeAudioContext.instances[0]; expect(context.oscillators.length).toBeGreaterThan(0); expect(vi.getTimerCount()).toBe(1);
    audio.setMusicEnabled(true); expect(vi.getTimerCount()).toBe(1); audio.pause(); expect(vi.getTimerCount()).toBe(0); expect(context.suspend).toHaveBeenCalled();
    context.currentTime = 100; await audio.resume(); expect(vi.getTimerCount()).toBe(1); expect(context.oscillators.length).toBeLessThan(25); audio.dispose();
  });
  it('stops in a hidden tab and preserves explicit pause when returning', async () => {
    const audio = createAudio('stud'); await audio.start(); audio.setMusicEnabled(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(0);
    audio.pause(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(0);
    await audio.resume(); expect(vi.getTimerCount()).toBe(1); audio.dispose();
  });
  it('releases voices/context/listeners once and cannot restart after disposal', async () => {
    const remove = vi.spyOn(document, 'removeEventListener'); const audio = createAudio('stud'); await audio.start(); audio.setMusicEnabled(true); audio.setSfxEnabled(true); audio.play('win');
    const context = FakeAudioContext.instances[0]; audio.dispose(); audio.dispose(); expect(vi.getTimerCount()).toBe(0); expect(context.close).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function)); expect(context.oscillators.every(node => node.onended === null && node.disconnect.mock.calls.length > 0)).toBe(true); expect(await audio.start()).toBe(false); remove.mockRestore();
  });
  it('handles unavailable audio and lost device resume without throwing', async () => {
    vi.stubGlobal('AudioContext', undefined); const unsupported = createAudio('stud'); expect(await unsupported.start()).toBe(false); unsupported.dispose();
    vi.stubGlobal('AudioContext', FakeAudioContext); const audio = createAudio('stud'); await audio.start(); const context = FakeAudioContext.instances[0]; context.resume.mockRejectedValueOnce(new Error('device gone')); expect(await audio.resume()).toBe(false); audio.dispose();
  });
});
