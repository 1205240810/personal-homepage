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
import {
  PULSE_CHAPTERS,
  PULSE_LEVELS,
  pressPulse,
  solvePulse,
} from '../../../lib/pulse-puzzle';
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
function solvedProgress(levelId: number) {
  const level = PULSE_LEVELS.find((item) => item.id === levelId)!;
  const progress = createPulseProgress(levelId);
  const solution = solvePulse(level.board, level.size)!;
  for (let cell = 0; cell < level.size * level.size; cell++) {
    if (solution & (1 << cell))
      progress.history.push(
        pressPulse(progress.history.at(-1)!, cell, level.size),
      );
  }
  progress.results[levelId] = { moves: level.par, hints: 0 };
  return progress;
}

function finishBoard() {
  const saved = readSaved();
  const level = PULSE_LEVELS.find((item) => item.id === saved.levelId)!;
  const solution = solvePulse(boardValue(), level.size)!;
  const cells = boardButtons();
  for (let cell = 0; cell < level.size * level.size; cell++) {
    if (solution & (1 << cell)) fireEvent.click(cells[cell]);
  }
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
    expect(screen.getByText(/已完成 1 \/ 30/)).toBeTruthy();
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

  it('renders all six data-driven chapters and lets the new six-level chapters select, hint and undo', () => {
    mountGame('room');
    const chapters = screen.getByRole('group', { name: '选择灯阵阶段' });
    expect(within(chapters).getAllByRole('button')).toHaveLength(6);
    for (const chapter of PULSE_CHAPTERS.slice(3)) {
      const levels = PULSE_LEVELS.filter(
        (level) => level.chapter === chapter.id,
      );
      const chapterButton = within(chapters).getByRole('button', {
        name: new RegExp(`^${chapter.name}，`),
      });
      expect(chapterButton.textContent).toContain(chapter.label);
      expect(chapterButton.textContent).toContain(
        `${levels[0].id}–${levels.at(-1)!.id}`,
      );
      fireEvent.click(chapterButton);
      expect(readSaved().levelId).toBe(levels[0].id);
      const choices = screen.getByRole('group', { name: '选择灯阵关卡' });
      expect(within(choices).getAllByRole('button')).toHaveLength(6);
      expect(choices.getAttribute('data-count')).toBe('6');
      fireEvent.click(
        within(choices).getByRole('button', {
          name: new RegExp(`第 ${levels.at(-1)!.id} 关：`),
        }),
      );
      const initial = boardValue();
      fireEvent.click(boardButtons()[0]);
      fireEvent.click(screen.getByRole('button', { name: '提示' }));
      expect(boardButtons()[readSaved().hint].className).toContain('is-hint');
      fireEvent.click(screen.getByRole('button', { name: '撤回灯阵上一步' }));
      expect(boardValue()).toBe(initial);
      expect(readSaved().history).toEqual([initial]);
      expect(readSaved().hintsUsed).toBe(1);
    }
  });

  it('continues the original twelve-level completion save directly into level thirteen', () => {
    const legacy = solvedProgress(12);
    legacy.results = Object.fromEntries(
      PULSE_LEVELS.slice(0, 12).map((level) => [
        level.id,
        { moves: level.par, hints: 0 },
      ]),
    );
    const raw = JSON.stringify(legacy);
    localStorage.setItem(PULSE_PROGRESS_KEY, raw);
    mountGame('home');
    expect(localStorage.getItem(PULSE_PROGRESS_KEY)).toBe(raw);
    expect(screen.getByText(/已完成 12 \/ 30/)).toBeTruthy();
    expect(screen.queryByText(/30 关完成/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '继续游戏' }));
    const next = screen.getByRole('button', { name: '进入下一阶段' });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(readSaved().levelId).toBe(13);
    expect(readSaved().results).toEqual(legacy.results);
    expect(boardValue()).toBe(PULSE_LEVELS[12].board);
    expect(document.activeElement).toBe(boardButtons()[0]);
  });

  it.each(PULSE_LEVELS)(
    'plays level $id to its exact par and continues to a playable next board',
    (level) => {
      localStorage.setItem(
        PULSE_PROGRESS_KEY,
        JSON.stringify(createPulseProgress(level.id)),
      );
      mountGame('room');
      expect(boardValue()).toBe(level.board);
      expect(boardButtons()).toHaveLength(level.size * level.size);
      fireEvent.click(screen.getByRole('button', { name: '提示' }));
      expect(boardButtons()[readSaved().hint].className).toContain('is-hint');
      finishBoard();
      expect(boardValue()).toBe(0);
      expect(readSaved().results[level.id]).toEqual({
        moves: level.par,
        hints: 1,
      });
      expect(
        boardButtons().every((cell) => (cell as HTMLButtonElement).disabled),
      ).toBe(true);
      const next = screen.getByRole('button', {
        name: /^(下一关|进入下一阶段|去试试未完成的关卡)$/,
      });
      expect(document.activeElement).toBe(next);
      fireEvent.click(next);
      const nextLevel = PULSE_LEVELS[level.id === 30 ? 0 : level.id];
      expect(readSaved().levelId).toBe(nextLevel.id);
      expect(boardValue()).toBe(nextLevel.board);
      expect(document.activeElement).toBe(boardButtons()[0]);
      expect(readSaved().results[level.id]).toEqual({
        moves: level.par,
        hints: 1,
      });
    },
  );

  it('finishes all thirty levels without an invalid next entrance and preserves the final result after remount', () => {
    const progress = createPulseProgress(30);
    progress.results = Object.fromEntries(
      PULSE_LEVELS.slice(0, -1).map((level) => [
        level.id,
        { moves: level.par, hints: 0 },
      ]),
    );
    localStorage.setItem(PULSE_PROGRESS_KEY, JSON.stringify(progress));
    const first = mountGame();
    finishBoard();
    expect(screen.getByText('30 关完成，所有脉冲都归零了。')).toBeTruthy();
    expect(screen.getByText(/已完成 30 \/ 30/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /下一关|下一阶段|未完成的关卡/ }),
    ).toBeNull();
    expect(Object.keys(readSaved().results)).toHaveLength(30);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /重置当前灯阵/ }),
    );
    first.unmount();
    mountGame('room');
    expect(screen.getByText(/已恢复第 30 关的通关记录/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续游戏' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /重置当前灯阵/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: /重置当前灯阵/ }));
    expect(boardValue()).toBe(PULSE_LEVELS.at(-1)!.board);
    expect(Object.keys(readSaved().results)).toHaveLength(30);
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
