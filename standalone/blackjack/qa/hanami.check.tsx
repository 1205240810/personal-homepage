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
  it('keeps guests and delivered gifts mounted while clearing only position-bound choices', () => {
    let s = fixture();
    s = H.apply(s, 0, {
      type: 'gift',
      cards: s.hands[0].slice(0, 3) as [number, number, number],
    });
    s = H.apply(s, 1, { type: 'pick', index: 0 });
    const onMove = vi.fn();
    const ui = render(
      <HanamiTable v={H.viewFor(s, 0)} names={['你', 'AI']} onMove={onMove} />,
    );
    const guest = document.querySelector('.hn-patron');
    const ribbon = document.querySelector('.hn-marker');
    const delivered = document.querySelector('.hn-pips i');
    expect(delivered).not.toBeNull();
    s = H.apply(s, 1, { type: 'secret', cards: [s.hands[1][0]] });
    const v = H.viewFor(s, 0);
    ui.rerender(<HanamiTable v={v} names={['你', 'AI']} onMove={onMove} />);
    expect(document.querySelector('.hn-patron')).toBe(guest);
    expect(document.querySelector('.hn-pips i')).toBe(delivered);
    select('secret', [0]);
    ui.rerender(
      <HanamiTable
        v={v}
        positionKey={2}
        names={['你', 'AI']}
        onMove={onMove}
      />,
    );
    expect(document.querySelector('.hn-confirm')).toBeNull();
    expect(document.querySelector('.hn-patron')).toBe(guest);
    const nextRound = {
      ...v,
      round: v.round + 1,
      played: [Array(7).fill(0), Array(7).fill(0)] as [number[], number[]],
      favour: [0, ...v.favour.slice(1)] as H.HanamiView['favour'],
    };
    ui.rerender(
      <HanamiTable v={nextRound} names={['你', 'AI']} onMove={onMove} />,
    );
    expect(document.querySelector('.hn-marker')).toBe(ribbon);
    expect(ribbon!.classList.contains('to-me')).toBe(true);
    expect(delivered!.isConnected).toBe(false);
  });

  it('names every hand card by its visible gift, preferred guest and value', () => {
    const v = { ...H.viewFor(fixture(), 0), hand: H.GIFTS.map((_, i) => i) };
    render(<HanamiTable v={v} names={['你', 'AI']} onMove={vi.fn()} />);
    H.GIFTS.forEach((gift, i) => {
      const label = `${gift}（${H.PATRON_TITLES[i]}偏爱，${H.VALUES[i]} 分）`;
      expect(
        screen.getByRole('button', { name: `${label}，第 ${i + 1} 份` }),
      ).toBe(card(i));
      expect(screen.getByRole('img', { name: label })).toBeTruthy();
    });
    document.querySelectorAll('.hn-table svg').forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    });
  });

  it.each(['gift', 'contest'] as const)(
    'names %s offers by the gifts that are actually selected',
    (kind) => {
      const s = fixture(1);
      const cards = s.hands[1].slice(0, H.ACTION_SIZE[kind]);
      const offered = H.apply(s, 1, { type: kind, cards } as H.Move);
      const onMove = vi.fn();
      render(
        <HanamiTable
          v={H.viewFor(offered, 0)}
          names={['你', 'AI']}
          onMove={onMove}
        />,
      );
      const label = (c: number) =>
        `${H.GIFTS[c]}（${H.PATRON_TITLES[c]}偏爱，${H.VALUES[c]} 分）`;
      const name =
        kind === 'gift'
          ? `选择${label(cards[1])}，第 2 份`
          : `选择第 2 盘：${cards.slice(2).map(label).join(' / ')}`;
      fireEvent.click(screen.getByRole('button', { name }));
      expect(onMove).toHaveBeenCalledWith({ type: 'pick', index: 1 });
    },
  );

  it('keeps selection order for contest pairs and prevents duplicate confirmation', () => {
    const s = fixture();
    const onMove = vi.fn();
    render(
      <HanamiTable v={H.viewFor(s, 0)} names={['你', 'AI']} onMove={onMove} />,
    );
    select('contest', [3, 0, 4, 1]);
    expect(card(3).getAttribute('aria-label')).toContain('甲盘');
    expect(card(0).getAttribute('aria-label')).toContain('甲盘');
    expect(card(4).getAttribute('aria-label')).toContain('乙盘');
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
        v={H.viewFor(offered, 0)}
        names={['你', 'AI']}
        onMove={onMove}
        disabled
      />,
    );
    view.rerender(
      <HanamiTable
        v={H.viewFor(offered, 0)}
        names={['你', 'AI']}
        onMove={onMove}
      />,
    );
    fireEvent.click(picks()[1]);
    expect(onMove).toHaveBeenCalledTimes(2);
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
