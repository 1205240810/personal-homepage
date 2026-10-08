// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlackjackGame } from './BlackjackGame';
import { emptySaved } from './storage';
import { PlayingCard } from './PlayingCard';

const mock = vi.hoisted(() => ({ workers: [] as Array<{
  onmessage: ((event: unknown) => void) | null;
  onerror: unknown;
  postMessage: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> }));
vi.mock('./coachWorkerClient', () => ({ createCoachWorker: () => {
  const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), dispose: vi.fn() };
  mock.workers.push(worker);
  return { worker, dispose: worker.dispose };
} }));

async function tick(ms = 300) { await act(async () => { vi.advanceTimersByTime(ms); }); }
function phase() { return screen.getByRole('main').getAttribute('data-phase'); }
async function start() {
  fireEvent.click(screen.getByRole('button', { name: /开始对局|再来一局/ }));
  for (let i = 0; i < 15 && phase() === 'dealing'; i++) await tick();
  await tick(600);
  expect(phase()).toBe('player');
}
async function finish() {
  fireEvent.click(screen.getByRole('button', { name: /^停牌/ }));
  for (let i = 0; i < 20 && phase() !== 'settled'; i++) await tick(600);
  expect(phase()).toBe('settled');
}
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { cleanup(); mock.workers.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('independent interaction quality', () => {
  it('keeps hidden card identity out of the rendered face and accessible name until reveal', () => {
    const card = { id: 'spades-K', suit: 'spades' as const, rank: 'K' as const };
    const view = render(<PlayingCard card={card} hidden />);
    expect(screen.getByRole('img', { name: '暗牌' })).toBeTruthy();
    expect(view.container.querySelector('.bj-card-face')).toBeNull();
    expect(screen.queryByText('KING')).toBeNull();
    view.rerender(<PlayingCard card={card} />);
    expect(screen.getByRole('img', { name: '黑桃 K' })).toBeTruthy();
    expect(view.container.querySelector('.bj-card-face')).toBeTruthy();
  });

  it('keeps reset keyboard focus inside dialog and restores its trigger on cancel', () => {
    const saved = emptySaved();
    saved.stats.classic.wins = 2;
    localStorage.setItem('twenty-one:v2', JSON.stringify({ version: 2, ...saved }));
    render(<BlackjackGame globalKeyboard />);
    const trigger = screen.getByRole('button', { name: '重置记录' });
    trigger.focus();
    fireEvent.click(trigger);
    const cancel = screen.getByRole('button', { name: '保留记录' });
    const confirm = screen.getByRole('button', { name: '清空记录' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'n' });
    expect(phase()).toBe('ready');
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByText('共 2 局')).toBeTruthy();
  });

  it('rules dialog blocks game shortcuts and restores focus after Escape', () => {
    render(<BlackjackGame globalKeyboard persist={false} />);
    const trigger = screen.getByRole('button', { name: /玩法说明/ });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: /关闭 ×/ });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'n' });
    expect(phase()).toBe('ready');
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('switching from rules to background pause leaves focus inside the surviving dialog', async () => {
    render(<BlackjackGame persist={false} />);
    await start();
    fireEvent.click(screen.getByRole('button', { name: /玩法说明/ }));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getAllByRole('dialog').length).toBe(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '继续对局' }));
  });

  it('default scoped keyboard flow retains root focus after Start and accepts Stand', async () => {
    const end = vi.fn();
    render(<BlackjackGame persist={false} onRoundEnd={end} />);
    const begin = screen.getByRole('button', { name: /开始对局/ });
    begin.focus();
    await start();
    const root = screen.getByRole('main');
    expect(document.activeElement).toBe(root);
    fireEvent.keyDown(root, { key: 's' });
    expect(phase()).toBe('dealer');
    expect(document.activeElement).toBe(root);
    for (let i = 0; i < 20 && phase() !== 'settled'; i++) await tick(600);
    expect(end).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(root, { key: 'n' });
    expect(phase()).toBe('dealing');
    expect(document.activeElement).toBe(root);
  });

  it('pauses a pending dealer turn, ignores hotkeys and resumes exactly once', async () => {
    const end = vi.fn();
    render(<BlackjackGame globalKeyboard persist={false} onRoundEnd={end} />);
    await start();
    fireEvent.click(screen.getByRole('button', { name: /^停牌/ }));
    expect(phase()).toBe('dealer');
    const cards = screen.getAllByRole('img').length;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.body, { key: 'h' });
    await tick(30000);
    expect(phase()).toBe('dealer');
    expect(screen.getAllByRole('img').length).toBe(cards);
    expect(end).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续对局' }));
    for (let i = 0; i < 20 && phase() !== 'settled'; i++) await tick(600);
    await tick(20000);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it.each(['replay', 'toggle', 'mode'] as const)('cancels postgame computation on %s and rejects its late result', async (action) => {
    render(<BlackjackGame persist={false} />);
    fireEvent.click(screen.getByRole('switch', { name: '赛后教练' }));
    await start();
    expect(screen.queryByRole('region', { name: '赛后教练复盘' })).toBeNull();
    await finish();
    fireEvent.click(screen.getByRole('button', { name: /复盘本局/ }));
    const worker = mock.workers[0];
    expect(worker).toBeTruthy();
    if (action === 'replay') fireEvent.click(screen.getByRole('button', { name: /再来一局/ }));
    if (action === 'toggle') fireEvent.click(screen.getByRole('switch', { name: '赛后教练' }));
    if (action === 'mode') fireEvent.click(within(screen.getByRole('navigation', { name: '对局模式' })).getByRole('button', { name: /策略庄家/ }));
    expect(worker.dispose).toHaveBeenCalled();
    act(() => worker.onmessage?.({ data: { result: { recommendation: 'stand', hitEV: -1, standEV: 1, bustProbability: .5, gap: 2, method: 'exact-finite', nodes: 2 } } }));
    expect(screen.queryByRole('region', { name: '赛后教练复盘' })).toBeNull();
    expect(screen.queryByText('精确计算 · 有限单副牌')).toBeNull();
  });

  it('repeated new-round keys start just one new deal and preserve the previous result count', async () => {
    const end = vi.fn();
    render(<BlackjackGame globalKeyboard persist={false} onRoundEnd={end} />);
    await start();
    await finish();
    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.body, { key: 'n', repeat: true });
    expect(phase()).toBe('dealing');
    expect(screen.getByText('ROUND 02')).toBeTruthy();
    expect(end).toHaveBeenCalledTimes(1);
    expect(screen.getByText('共 1 局')).toBeTruthy();
  });

  it('closing review cancels its computation and reopening starts a fresh request', async () => {
    render(<BlackjackGame persist={false} />);
    fireEvent.click(screen.getByRole('switch', { name: '赛后教练' }));
    await start();
    await finish();
    fireEvent.click(screen.getByRole('button', { name: /复盘本局/ }));
    const first = mock.workers[0];
    fireEvent.click(screen.getByRole('button', { name: /收起复盘/ }));
    expect(first.dispose).toHaveBeenCalled();
    act(() => first.onmessage?.({ data: { error: 'late error' } }));
    expect(screen.queryByText(/这一步暂时无法完成分析/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /复盘本局/ }));
    expect(mock.workers.length).toBe(2);
    expect(mock.workers[1].postMessage.mock.calls[0]).toEqual(first.postMessage.mock.calls[0]);
  });
});
