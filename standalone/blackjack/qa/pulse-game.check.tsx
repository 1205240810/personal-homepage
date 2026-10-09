import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PulseGame } from '../../../components/home/pulse-game';
import { PulseDaily } from '../../../components/home/pulse-daily';
import {
  PULSE_DAILY_KEY,
  dailyPuzzle,
  solveDaily,
} from '../../../lib/pulse-daily';
import { PULSE_LEVELS, pressPulse } from '../../../lib/pulse-puzzle';
import {
  createPulseProgress,
  PULSE_PROGRESS_KEY,
} from '../../../lib/pulse-progress';

function boardButtons() {
  return within(screen.getByRole('group', { name: /灯阵$/ })).getAllByRole(
    'button',
  );
}
function boardValue() {
  return boardButtons().reduce(
    (board, cell, i) =>
      cell.getAttribute('aria-pressed') === 'true' ? board | (1 << i) : board,
    0,
  );
}
function readSaved() {
  return JSON.parse(localStorage.getItem(PULSE_PROGRESS_KEY)!);
}
function mountGame(entrance: 'home' | 'room' = 'home') {
  return render(
    <StrictMode>
      <div
        id={entrance === 'home' ? 'workbench' : undefined}
        className={entrance === 'room' ? 'signal-stage' : undefined}
      >
        <PulseGame />
      </div>
    </StrictMode>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Signal Pulse browser-local sessions', () => {
  it('restores a real remounted board, undo history and active hint without charging it twice', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const first = mountGame();
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /第 2 关/ }));
    fireEvent.click(boardButtons()[3]);
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    const saved = readSaved();
    const board = boardValue();
    expect(saved.levelId).toBe(2);
    expect(saved.history).toHaveLength(2);
    expect(saved.hintsUsed).toBe(1);
    first.unmount();

    const writesBeforeRemount = writes.mock.calls.length;
    mountGame('room');
    expect(writes.mock.calls.length).toBe(writesBeforeRemount);
    expect(boardValue()).toBe(board);
    expect(screen.getByText(/已恢复第 2 关/)).toBeTruthy();
    expect(boardButtons()[saved.hint].className).toContain('is-hint');
    fireEvent.click(screen.getByRole('button', { name: '继续游戏' }));
    expect(document.activeElement).toBe(boardButtons()[0]);
    expect(screen.queryByRole('button', { name: '继续游戏' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    expect(readSaved().hintsUsed).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '撤回灯阵上一步' }));
    expect(boardValue()).toBe(PULSE_LEVELS[1].board);
    expect(readSaved().history).toEqual([PULSE_LEVELS[1].board]);
  });

  it('keeps completed levels and the best result through replay, remount and Restart', () => {
    const first = mountGame();
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    fireEvent.click(boardButtons()[readSaved().hint]);
    expect(readSaved().results[1]).toEqual({ moves: 1, hints: 1 });
    fireEvent.click(screen.getByRole('button', { name: /重置当前灯阵/ }));
    fireEvent.click(boardButtons()[5]);
    expect(readSaved().results[1]).toEqual({ moves: 1, hints: 0 });
    fireEvent.click(screen.getByRole('button', { name: /重置当前灯阵/ }));
    fireEvent.click(screen.getByRole('button', { name: '提示' }));
    fireEvent.click(boardButtons()[readSaved().hint]);
    expect(readSaved().results[1]).toEqual({ moves: 1, hints: 0 });
    fireEvent.click(screen.getByRole('button', { name: '下一关' }));
    fireEvent.click(boardButtons()[3]);
    first.unmount();

    mountGame();
    expect(screen.getByText(/已完成 1 \/ 12/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /第 1 关：一点微光，已完成/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重新开始当前灯阵/ }));
    expect(document.activeElement).toBe(boardButtons()[0]);
    expect(boardValue()).toBe(PULSE_LEVELS[1].board);
    expect(readSaved().levelId).toBe(2);
    expect(readSaved().history).toEqual([PULSE_LEVELS[1].board]);
    expect(readSaved().results[1]).toEqual({ moves: 1, hints: 0 });
  });

  it('restores a completed board and Continue focuses the next-level control', () => {
    const first = mountGame('room');
    fireEvent.click(boardButtons()[5]);
    expect(boardValue()).toBe(0);
    first.unmount();
    mountGame('home');
    expect(screen.getByText(/已恢复第 1 关的通关记录/)).toBeTruthy();
    expect(
      boardButtons().every((cell) => (cell as HTMLButtonElement).disabled),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '继续游戏' }));
    const next = screen.getByRole('button', { name: '下一关' });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(boardValue()).toBe(PULSE_LEVELS[1].board);
    expect(readSaved().results[1]).toEqual({ moves: 1, hints: 0 });
  });

  it('handles a throwing localStorage getter without blocking gameplay', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    mountGame();
    expect(screen.getByText(/浏览器暂时无法保存进度/)).toBeTruthy();
    fireEvent.click(boardButtons()[0]);
    expect(boardValue()).toBe(pressPulse(PULSE_LEVELS[0].board, 0));
  });

  it('ignores malformed data and remains playable when storage is blocked', () => {
    localStorage.setItem(PULSE_PROGRESS_KEY, '{bad');
    const first = mountGame();
    expect(screen.getByText(/旧存档无法读取/)).toBeTruthy();
    expect(boardValue()).toBe(PULSE_LEVELS[0].board);
    fireEvent.click(boardButtons()[0]);
    expect(readSaved().history).toHaveLength(2);
    first.unmount();

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    mountGame();
    expect(screen.getByText(/浏览器暂时无法保存进度/)).toBeTruthy();
    fireEvent.click(boardButtons()[0]);
    expect(boardValue()).toBe(pressPulse(PULSE_LEVELS[0].board, 0));
    fireEvent.click(screen.getByRole('button', { name: '撤回灯阵上一步' }));
    expect(boardValue()).toBe(PULSE_LEVELS[0].board);
  });

  it('hydrates server markup without overwriting a saved session or a mismatch', async () => {
    const progress = createPulseProgress(9);
    progress.history.push(pressPulse(PULSE_LEVELS[8].board, 4, 5));
    progress.results[1] = { moves: 1, hints: 0 };
    const serialized = JSON.stringify(progress);
    localStorage.setItem(PULSE_PROGRESS_KEY, serialized);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    const errors = vi.spyOn(console, 'error');
    const container = document.createElement('div');
    const element = (
      <StrictMode>
        <PulseGame />
      </StrictMode>
    );
    container.innerHTML = renderToString(element);
    expect(reads).not.toHaveBeenCalled();
    expect(container.textContent).toContain('正在读取本地进度');
    document.body.appendChild(container);
    const root = hydrateRoot(container, element);
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText(/已恢复第 9 关/)).toBeTruthy();
      expect(boardValue()).toBe(progress.history[1]);
      expect(writes).not.toHaveBeenCalled();
      expect(localStorage.getItem(PULSE_PROGRESS_KEY)).toBe(serialized);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

describe('Signal Pulse daily challenge', () => {
  const mountDaily = () =>
    render(
      <StrictMode>
        <div className="signal-stage">
          <PulseDaily />
        </div>
      </StrictMode>,
    );
  const dailyCells = () =>
    within(
      screen.getByRole('group', { name: /^今日 \d × \d 灯阵$/ }),
    ).getAllByRole('button');
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 9, 12));
  });
  afterEach(() => vi.useRealTimers());

  it("solves today's 6 × 6 at par for three stars and keeps it after remount", () => {
    const first = mountDaily();
    fireEvent.click(screen.getByRole('button', { name: /^6 × 6/ }));
    expect(dailyCells()).toHaveLength(36);
    const puzzle = dailyPuzzle('2026-10-09', 6);
    expect(
      screen.getByText(`最短 ${puzzle.par} 步`, { exact: false }),
    ).toBeTruthy();
    for (const cell of solveDaily(puzzle.board, 6)!)
      fireEvent.click(dailyCells()[cell]);
    expect(screen.getByText(/获得 3 星/)).toBeTruthy();
    expect(dailyCells().every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    );
    const saved = JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!);
    expect(saved.records['2026-10-09:6']).toEqual({
      moves: puzzle.par,
      hints: 0,
      stars: 3,
    });
    first.unmount();
    mountDaily();
    expect(screen.getByLabelText('今日已获 3 / 9 星')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '6 × 6，已获 3 星' }),
    ).toBeTruthy();
  });

  it('keeps each size in progress separately, counts a hint once and rates extra moves lower', () => {
    mountDaily();
    fireEvent.click(screen.getByRole('button', { name: /^4 × 4/ }));
    fireEvent.click(dailyCells()[0]);
    fireEvent.click(dailyCells()[0]);
    fireEvent.click(screen.getByRole('button', { name: /^5 × 5/ }));
    fireEvent.click(screen.getByRole('button', { name: /^4 × 4/ }));
    expect(screen.getByText('02')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '今日灯阵提示' }));
    fireEvent.click(screen.getByRole('button', { name: '今日灯阵提示' }));
    expect(
      dailyCells().filter((b) =>
        /建议按这里/.test(b.getAttribute('aria-label')!),
      ),
    ).toHaveLength(1);
    const puzzle = dailyPuzzle('2026-10-09', 4);
    for (const cell of solveDaily(puzzle.board, 4)!)
      fireEvent.click(dailyCells()[cell]);
    const record = JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!).records[
      '2026-10-09:4'
    ];
    expect(record).toEqual({ moves: puzzle.par + 2, hints: 1, stars: 2 });
    expect(screen.getByText(/获得 2 星.*用了 1 次提示/)).toBeTruthy();
  });

  it("keeps newer-day progress and both days' records when an overnight tab resumes", () => {
    vi.setSystemTime(new Date(2026, 9, 9, 23, 59));
    const oldTab = mountDaily();
    const oldView = within(oldTab.container);
    const oldCells = oldView.getAllByRole('button', {
      name: /^第 \d 行第 \d 列/,
    });
    fireEvent.click(oldCells[0]);

    vi.setSystemTime(new Date(2026, 9, 10, 12));
    const newTab = mountDaily();
    const newView = within(newTab.container);
    const newCells = newView.getAllByRole('button', {
      name: /^第 \d 行第 \d 列/,
    });
    const newPuzzle = dailyPuzzle('2026-10-10', 5);
    for (const cell of solveDaily(newPuzzle.board, 5)!)
      fireEvent.click(newCells[cell]);
    fireEvent.click(newView.getByRole('button', { name: /^6 × 6/ }));
    const newSix = newView.getAllByRole('button', {
      name: /^第 \d 行第 \d 列/,
    });
    fireEvent.click(newSix[7]);
    const before = JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!);
    expect(before.records['2026-10-10:5']).toBeTruthy();

    // The older session remains on its own puzzle, but must not erase today.
    fireEvent.click(oldCells[0]);
    const after = JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!);
    expect(after).toEqual(before);
    expect(oldView.getByText('DAILY · 2026-10-09')).toBeTruthy();
    const oldPuzzle = dailyPuzzle('2026-10-09', 5);
    for (const cell of solveDaily(oldPuzzle.board, 5)!)
      fireEvent.click(oldCells[cell]);
    const completed = JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!);
    expect(completed.date).toBe('2026-10-10');
    expect(completed.boards).toEqual(before.boards);
    expect(completed.records['2026-10-10:5']).toEqual(
      before.records['2026-10-10:5'],
    );
    expect(completed.records['2026-10-09:5'].moves).toBe(oldPuzzle.par + 2);

    // The newer tab also reconciles the older tab's subsequently earned record.
    fireEvent.click(newSix[8]);
    expect(JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!).records).toEqual(
      completed.records,
    );
  });

  it("preserves other sizes' progress when two same-day tabs save", () => {
    const first = mountDaily();
    const second = mountDaily();
    const firstView = within(first.container);
    const secondView = within(second.container);
    fireEvent.click(firstView.getByRole('button', { name: /^4 × 4/ }));
    fireEvent.click(
      firstView.getAllByRole('button', { name: /^第 \d 行第 \d 列/ })[0],
    );
    fireEvent.click(secondView.getByRole('button', { name: /^6 × 6/ }));
    fireEvent.click(
      secondView.getAllByRole('button', { name: /^第 \d 行第 \d 列/ })[7],
    );
    let saved = JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!);
    expect(saved.boards[4].presses).toEqual([0]);
    expect(saved.boards[6].presses).toEqual([7]);

    fireEvent.click(firstView.getByRole('button', { name: /^5 × 5/ }));
    fireEvent.click(
      firstView.getAllByRole('button', { name: /^第 \d 行第 \d 列/ })[1],
    );
    saved = JSON.parse(localStorage.getItem(PULSE_DAILY_KEY)!);
    expect(saved.boards[4].presses).toEqual([0]);
    expect(saved.boards[5].presses).toEqual([1]);
    expect(saved.boards[6].presses).toEqual([7]);
    fireEvent.click(firstView.getByRole('button', { name: /^6 × 6/ }));
    expect(firstView.getByText('01')).toBeTruthy();
  });

  it('ignores a tampered save and starts today fresh', () => {
    localStorage.setItem(
      PULSE_DAILY_KEY,
      JSON.stringify({
        version: 1,
        date: '2026-10-09',
        size: 6,
        boards: { 4: { presses: [99], hints: 0 } },
        records: {},
      }),
    );
    mountDaily();
    expect(screen.getByText(/旧存档无法读取/)).toBeTruthy();
    expect(screen.getByText('00')).toBeTruthy();
  });
});
