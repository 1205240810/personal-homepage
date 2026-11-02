import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HanamiGame } from '../../../components/games/hanami/local';
import { HanamiTable } from '../../../components/games/hanami/table';
import * as H from '../../../lib/games/hanami';

const originalNewGame = H.newGame;
const fixture = (starter: H.Side = 0) => originalNewGame(() => 0.37, starter);
const textButton = (name: string) =>
  screen.getByText<HTMLButtonElement>(name, { selector: 'button' });
const start = () =>
  fireEvent.click(screen.getAllByText('开局', { selector: 'button' })[0]);
const token = (kind: H.ActionKind) =>
  document.querySelectorAll<HTMLButtonElement>('.is-me .hn-token')[
    H.ACTIONS.indexOf(kind)
  ];
const card = (index: number) =>
  document.querySelectorAll<HTMLButtonElement>('.is-me .hn-slot')[index];
const confirm = () =>
  document.querySelector<HTMLButtonElement>('.hn-confirm .kit-primary')!;
const select = (kind: H.ActionKind, indices: number[]) => {
  fireEvent.click(token(kind));
  indices.forEach((i) => fireEvent.click(card(i)));
};
const firstMove = (s: H.HanamiState): H.Move => {
  if (s.phase === 'respond') return { type: 'pick', index: 0 };
  const side = H.decider(s)!;
  const type = H.ACTIONS.find((a) => !s.used[side].includes(a))!;
  return { type, cards: s.hands[side].slice(0, H.ACTION_SIZE[type]) } as H.Move;
};
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  message: {
    id: number;
    level: number;
    shape: H.HanamiState;
    view: H.HanamiView;
  } | null = null;
  constructor() {
    TestWorker.instances.push(this);
  }
  postMessage(message: TestWorker['message']) {
    this.message = message;
  }
  terminate() {
    this.terminated = true;
  }
  reply(move: H.Move = firstMove(this.message!.shape)) {
    this.onmessage?.({
      data: { id: 1, result: { move, worlds: 0, reason: 'test' } },
    });
  }
}
const latest = () => TestWorker.instances.at(-1)!;
const reply = async (worker: TestWorker, move?: H.Move) =>
  act(async () => {
    worker.reply(move);
    await vi.advanceTimersByTimeAsync(600);
  });
beforeEach(() => {
  localStorage.clear();
  TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
  vi.spyOn(H, 'newGame').mockImplementation(() => fixture());
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('花街七席本机', () => {
  it('honors the visible start difficulty, then keeps it fixed while settings change', async () => {
    render(<HanamiGame fromExplore />);
    expect(
      screen.getByRole('link', { name: '和朋友联机 →' }).getAttribute('href'),
    ).toBe('/games/hanami/online?from=explore');
    screen.getByLabelText<HTMLSelectElement>('AI 难度（下局生效）').value = '5';
    start();
    select('secret', [0]);
    fireEvent.click(confirm());
    const worker = latest();
    expect(worker.message!.level).toBe(5);
    fireEvent.change(screen.getByLabelText('AI 难度（下局生效）'), {
      target: { value: '2' },
    });
    expect(TestWorker.instances).toHaveLength(1);
    expect(worker.terminated).toBe(false);
    await reply(worker);
    expect(document.querySelector('.hn-status')!.textContent).toContain(
      '轮到你',
    );
    expect(document.querySelector('.kit-kicker')!.textContent).toContain(
      '5 · 全力',
    );
    fireEvent.click(textButton('重新开局'));
    expect(document.querySelector('.kit-kicker')!.textContent).toContain(
      '2 · 入门',
    );
    expect(
      JSON.parse(localStorage.getItem('tscjj:hanami-settings:v1')!),
    ).toEqual({ level: 2 });
  });

  it('sends only AI-visible cards to its worker and cancels stale computation on restart', async () => {
    render(<HanamiGame />);
    start();
    select('secret', [0]);
    fireEvent.click(confirm());
    const old = latest();
    expect(old.message!.shape.hands[0].every((c) => c === 0)).toBe(true);
    expect(old.message!.shape.deck.every((c) => c === 0)).toBe(true);
    expect(old.message!.shape.secret[0]).toBeNull();
    expect(old.message!.shape.discarded[0]).toEqual([]);
    expect(old.message!.shape.removed).toBeNull();
    expect(old.message!.view.you).toBe(1);
    fireEvent.click(textButton('重新开局'));
    expect(old.terminated).toBe(true);
    await reply(old);
    expect(document.querySelector('.hn-status')!.textContent).toContain(
      '轮到你',
    );
    expect(token('secret').disabled).toBe(false);
    expect(document.querySelector('.hn-mine-hidden')).toBeNull();
  });

  it('cancels a completed worker reply during its display delay and terminates on unmount', async () => {
    const view = render(<HanamiGame />);
    start();
    select('secret', [0]);
    fireEvent.click(confirm());
    act(() => latest().reply());
    fireEvent.click(textButton('重新开局'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(token('secret').disabled).toBe(false);
    select('secret', [0]);
    fireEvent.click(confirm());
    const pending = latest();
    view.unmount();
    expect(pending.terminated).toBe(true);
  });

  it.each(['error', 'messageerror', 'timeout', 'invalid'] as const)(
    'recovers from worker %s without committing bad state',
    async (failure) => {
      render(<HanamiGame />);
      start();
      select('secret', [0]);
      fireEvent.click(confirm());
      const failed = latest();
      await act(async () => {
        if (failure === 'error') failed.onerror?.({ preventDefault() {} });
        if (failure === 'messageerror') failed.onmessageerror?.();
        if (failure === 'timeout') await vi.advanceTimersByTimeAsync(8000);
        if (failure === 'invalid')
          failed.reply({ type: 'secret', cards: [99] });
      });
      expect(textButton('重试 AI')).toBeTruthy();
      expect(failed.terminated).toBe(true);
      fireEvent.click(textButton('重试 AI'));
      await reply(latest());
      expect(document.querySelector('.hn-status')!.textContent).toContain(
        '轮到你',
      );
      expect(screen.queryByText('AI 计算失败，请重试或重新开局。')).toBeNull();
    },
  );

  it('resets selected indices even when a new deal happens to have the same cards', () => {
    render(<HanamiGame />);
    start();
    select('contest', [0, 1, 2, 3]);
    expect(document.querySelectorAll('.hn-slot.is-sel')).toHaveLength(4);
    fireEvent.click(textButton('重新开局'));
    expect(document.querySelector('.hn-confirm')).toBeNull();
    expect(document.querySelectorAll('.hn-slot.is-sel')).toHaveLength(0);
  });

  it('ignores impossible saved records and keeps difficulty usable if storage writes fail', () => {
    localStorage.setItem(
      'tscjj:hanami-records:v1',
      JSON.stringify({ 3: { won: -5, played: -1 } }),
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<HanamiGame />);
    expect(document.querySelector('.kit-kicker')!.textContent).not.toContain(
      '本档',
    );
    fireEvent.change(screen.getByLabelText('AI 难度（下局生效）'), {
      target: { value: '4' },
    });
    expect(
      screen.getByLabelText<HTMLSelectElement>('AI 难度（下局生效）').value,
    ).toBe('4');
    start();
    expect(document.querySelector('.kit-kicker')!.textContent).toContain(
      '4 · 挑战',
    );
  });

  it('records a completed match exactly once, including duplicated late worker replies', async () => {
    let state = { ...fixture(1), round: 3 };
    let finalMove: H.Move | undefined;
    for (let i = 0; i < 200; i++) {
      if (state.phase === 'round-end') {
        state = H.nextRound(state, () => 0.37);
        continue;
      }
      const move = firstMove(state);
      const next = H.apply(state, H.decider(state)!, move);
      if (next.phase === 'over' && H.decider(state) === 1) {
        finalMove = move;
        break;
      }
      state = next;
      if (state.phase === 'over')
        throw new Error('fixture should finish on AI decision');
    }
    expect(finalMove).toBeDefined();
    vi.mocked(H.newGame).mockReturnValue(state);
    render(<HanamiGame />);
    start();
    const worker = latest();
    await reply(worker, finalMove);
    const records = () =>
      JSON.parse(localStorage.getItem('tscjj:hanami-records:v1')!);
    expect(records()[3].played).toBe(1);
    await reply(worker, finalMove);
    expect(records()[3].played).toBe(1);
  });
});

describe('花街七席选牌与提交', () => {
  it('keeps selection order for contest pairs and prevents duplicate confirmation', () => {
    const s = fixture();
    const onMove = vi.fn();
    render(
      <HanamiTable v={H.viewFor(s, 0)} names={['你', 'AI']} onMove={onMove} />,
    );
    select('contest', [3, 0, 4, 1]);
    expect(card(3).getAttribute('aria-label')).toContain('甲组');
    expect(card(0).getAttribute('aria-label')).toContain('甲组');
    expect(card(4).getAttribute('aria-label')).toContain('乙组');
    const button = confirm();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({
      type: 'contest',
      cards: [3, 0, 4, 1].map((i) => s.hands[0][i]),
    });
  });

  it('preserves rejected selection for correction and clears it on a new visible position', () => {
    const s = fixture();
    const onMove = vi.fn(() => false);
    const view = render(
      <HanamiTable v={H.viewFor(s, 0)} names={['你', 'AI']} onMove={onMove} />,
    );
    select('gift', [0, 1, 2]);
    fireEvent.click(confirm());
    expect(confirm().disabled).toBe(false);
    expect(document.querySelectorAll('.is-me .is-sel')).toHaveLength(3);
    const next = H.apply(s, 0, { type: 'secret', cards: [s.hands[0][0]] });
    view.rerender(
      <HanamiTable
        v={H.viewFor(next, 0)}
        names={['你', 'AI']}
        onMove={onMove}
      />,
    );
    expect(document.querySelector('.hn-confirm')).toBeNull();
    expect(document.querySelectorAll('.is-me .is-sel')).toHaveLength(0);
  });

  it('blocks double picks, disconnected controls and spectator responses', () => {
    const s = fixture(1);
    const offered = H.apply(s, 1, {
      type: 'gift',
      cards: s.hands[1].slice(0, 3) as [number, number, number],
    });
    const onMove = vi.fn();
    const view = render(
      <HanamiTable
        v={H.viewFor(offered, 0)}
        names={['你', 'AI']}
        onMove={onMove}
        disabled
      />,
    );
    const picks = () =>
      document.querySelectorAll<HTMLButtonElement>('.hn-pick');
    expect(picks()[0].disabled).toBe(true);
    view.rerender(
      <HanamiTable
        v={H.viewFor(offered, 0)}
        names={['你', 'AI']}
        onMove={onMove}
      />,
    );
    const button = picks()[1];
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({ type: 'pick', index: 1 });
    view.rerender(
      <HanamiTable
        v={H.viewFor(offered, null)}
        names={['你', 'AI']}
        onMove={onMove}
      />,
    );
    expect(picks()[0].disabled).toBe(true);
  });
});
