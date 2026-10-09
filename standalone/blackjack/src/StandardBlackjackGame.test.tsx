// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StandardBlackjackGame, STANDARD_SAVE_KEY, readStandardSaved } from './StandardBlackjackGame';
import type { Card } from './engine';
import type { StandardEvent, StandardState } from './standardTypes';

const fixture = vi.hoisted(() => ({ ranks: ['10', '6', '7', '10', '5', '2', '10', '9'] }));
vi.mock('./standardGame', async importOriginal => {
  const original = await importOriginal<typeof import('./standardGame')>();
  return { ...original, standardReducer: (state: StandardState, event: StandardEvent) => original.standardReducer(state, event.type === 'START' ? { ...event, deck: fixture.ranks.map((rank, i): Card => ({ rank, id: `fixture-${i}`, suit: 'spades' })) } : event) };
});
vi.mock('./standardSolver', () => ({ analyzeStandardDecision: vi.fn(observation => ({ bestAction: 'stand', values: Object.fromEntries(observation.legalActions.map((action: string) => [action, action === 'stand' ? .15 : -.3])), method: '独立抽牌 DP 近似', explanation: ['停牌保留当前点数，避免自己的爆牌风险。'], warnings: ['非有限牌靴精确解。'] })) }));
const tick = async (ms = 300) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
const start = async () => { fireEvent.click(screen.getByRole('button', { name: /开始对局/ })); for (let i = 0; i < 6; i++) await tick(); };
const settle = async () => { fireEvent.click(screen.getByRole('button', { name: /^停牌/ })); for (let i = 0; i < 12 && !screen.queryByRole('button', { name: /下一局/ }); i++) await tick(600); await tick(); };
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); fixture.ranks = ['10', '6', '7', '10', '5', '2', '10', '9']; Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('standard table controls and local training data', () => {
  it('keeps secondary guidance collapsed while tutorial and play stay directly available', () => {
    render(<StandardBlackjackGame persist={false}/>);
    const summary = screen.getByText('桌规与入门提示');
    const guide = summary.closest('details')!;
    expect(guide.open).toBe(false);
    expect(screen.getByRole('button', { name: /开始对局/ })).toBeTruthy();
    fireEvent.click(summary);
    expect(guide.open).toBe(true);
    expect(guide.textContent).toContain('Blackjack 赔 3:2');
    fireEvent.click(screen.getByRole('button', { name: '新手教程' }));
    expect(screen.getByRole('dialog', { name: '新手教程' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /开始对局/ })).toBeTruthy();
  });
  it('ignores the legacy record and only persists settled bankroll', async () => {
    localStorage.setItem('twenty-one:v2', JSON.stringify({ bankroll: 999999 }));
    const view = render(<StandardBlackjackGame/>);
    expect(screen.getByRole('region', { name: '虚拟筹码' }).textContent).toContain('1,000');
    await start();
    expect(JSON.parse(localStorage.getItem(STANDARD_SAVE_KEY)!).bankroll).toBe(1000);
    view.unmount();
    render(<StandardBlackjackGame/>);
    expect(screen.getByRole('region', { name: '虚拟筹码' }).textContent).toContain('1,000');
    expect(screen.getByRole('button', { name: /开始对局/ })).toBeTruthy();
    await start(); await settle();
    const saved = JSON.parse(localStorage.getItem(STANDARD_SAVE_KEY)!);
    expect(saved.stats.rounds).toBe(1);
    expect(saved.bankroll).toBe(980);
    expect(screen.getByRole('region', { name: '标准规则赛后教练' }).textContent).toContain('独立抽牌 DP 近似');
  });
  it('changes a wager without resetting balance; rebuilding needs confirmation', async () => {
    render(<StandardBlackjackGame/>);
    fireEvent.click(screen.getByRole('button', { name: '筹码设置' }));
    fireEvent.change(screen.getByLabelText(/下一局基础下注/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: '仅应用下一局下注' }));
    expect(readStandardSaved().bankroll).toBe(1000);
    expect(readStandardSaved().settings.bet).toBe(40);
    fireEvent.click(screen.getByRole('button', { name: '筹码设置' }));
    fireEvent.change(screen.getByLabelText(/新练习的初始筹码/), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: '重建练习筹码' }));
    expect(readStandardSaved().bankroll).toBe(1000);
    expect(screen.getByRole('dialog').textContent).toContain('确认将筹码重建为 5,000');
    fireEvent.click(screen.getByRole('button', { name: '确认重建并清空记录' }));
    expect(readStandardSaved().bankroll).toBe(5000);
    expect(readStandardSaved().settings.bet).toBe(40);
    await start();
    expect((screen.getByRole('button', { name: '筹码设置' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('validates settings and completes an interactive tutorial with escape and focus restoration', () => {
    render(<StandardBlackjackGame/>);
    const trigger = screen.getByRole('button', { name: '新手教程' });
    trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole('dialog').textContent).toContain('A + 6 是软 17');
    fireEvent.click(screen.getByRole('button', { name: '16 点，仍可继续' }));
    expect(screen.getByRole('dialog').textContent).toContain('答对了');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: '下一节' }));
    fireEvent.click(screen.getByRole('button', { name: '完成，开始练习' }));
    expect(readStandardSaved().tutorialDone).toBe(true);
    expect(screen.queryByRole('button', { name: /开始教程/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '筹码设置' }));
    fireEvent.change(screen.getByLabelText(/下一局基础下注/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '仅应用下一局下注' }));
    expect(screen.getByRole('alert').textContent).toContain('正偶数');
  });
  it('does not capture external shortcuts; a modal and action lock block rapid operations', async () => {
    render(<StandardBlackjackGame persist={false}/>);
    fireEvent.keyDown(document.body, { key: 'n' }); await tick(2000);
    expect(screen.getByRole('button', { name: /开始对局/ })).toBeTruthy();
    await start();
    const table = screen.getByRole('main', { name: '标准 Blackjack 练习牌桌' });
    fireEvent.click(screen.getByRole('button', { name: '新手教程' }));
    fireEvent.keyDown(table, { key: 'd' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' }); await tick();
    fireEvent.keyDown(table, { key: 's' }); fireEvent.keyDown(table, { key: 'h' });
    for (let i = 0; i < 5; i++) await tick(600);
    expect(screen.getByRole('region', { name: '标准规则赛后教练' }).textContent).toContain('第 1 步 · 停牌');
    expect(screen.queryByText('第 2 步 · 要牌')).toBeNull();
  });
  it('pauses background dealing and restores it explicitly without losing a wager', async () => {
    render(<StandardBlackjackGame/>);
    fireEvent.click(screen.getByRole('button', { name: /开始对局/ }));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange')); await tick(8000);
    expect(screen.getByRole('dialog', { name: '牌桌已暂停' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(readStandardSaved().bankroll).toBe(1000);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.click(screen.getByRole('button', { name: '继续对局' }));
    for (let i = 0; i < 6; i++) await tick();
    expect(screen.getAllByRole('img').length).toBe(4);
  });
  it('shows split hands with a distinct viewing selection and automatic active hand', async () => {
    fixture.ranks = ['8', '6', '8', '10', '2', '3', '5', '7', '9'];
    render(<StandardBlackjackGame/>); await start();
    fireEvent.click(screen.getByRole('button', { name: /^分牌/ })); await tick();
    const handNav = screen.getByRole('navigation', { name: '查看分牌手' });
    expect(within(handNav).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(within(handNav).getByRole('button', { name: '第 2 手 11 点' }));
    expect(within(handNav).getByRole('button', { name: '第 2 手 11 点' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^停牌/ })); await tick();
    expect(within(handNav).getByRole('button', { name: '第 2 手 当前操作' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('survives corrupt or denied storage and rejects malformed statistics', () => {
    localStorage.setItem(STANDARD_SAVE_KEY, '{bad');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    render(<StandardBlackjackGame/>);
    expect(screen.getByText(/浏览器未允许保存/)).toBeTruthy();
  });
  it('rejects missing statistics and isolates unknown saved fields', () => {
    const valid = readStandardSaved();
    localStorage.setItem(STANDARD_SAVE_KEY, JSON.stringify({ ...valid, bankroll: 700, stats: {} }));
    expect(readStandardSaved().bankroll).toBe(1000);
    localStorage.setItem(STANDARD_SAVE_KEY, JSON.stringify({ ...valid, bankroll: 701, settings: { ...valid.settings, injected: 'private' }, stats: { ...valid.stats, injected: 'private' } }));
    const loaded = readStandardSaved();
    expect(loaded.bankroll).toBe(701);
    expect(Object.keys(loaded.settings)).toEqual(['initialBankroll', 'bet', 'sound', 'coach']);
    expect(Object.keys(loaded.stats)).toEqual(['rounds', 'wins', 'losses', 'pushes', 'surrenders']);
  });
  it('restores odd settled balances, wagers above the initial balance, and bankruptcy', () => {
    const valid = readStandardSaved();
    localStorage.setItem(STANDARD_SAVE_KEY, JSON.stringify({ ...valid, bankroll: 1301, settings: { ...valid.settings, bet: 1200 } }));
    const first = render(<StandardBlackjackGame/>);
    expect(screen.getByRole('region', { name: '虚拟筹码' }).textContent).toContain('1,301');
    expect((screen.getByRole('button', { name: /开始对局/ }) as HTMLButtonElement).disabled).toBe(false);
    first.unmount();
    localStorage.setItem(STANDARD_SAVE_KEY, JSON.stringify({ ...valid, bankroll: 0 }));
    render(<StandardBlackjackGame/>);
    expect((screen.getByRole('button', { name: /开始对局/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/可用筹码不足本局下注/)).toBeTruthy();
  });
});
