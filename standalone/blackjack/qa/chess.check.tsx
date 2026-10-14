import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChessGame } from '../../../components/games/chess';
import { ALL_PUZZLES, CHESS_RECORDS_KEY } from '../../../lib/games/chess';

const sq = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[data-sq="${name}"]`)!;
const move = (from: string, to: string) => {
  fireEvent.click(sq(from));
  fireEvent.click(sq(to));
};
const openPuzzle = (id: string) =>
  fireEvent.change(screen.getByLabelText('残局模式'), {
    target: { value: String(ALL_PUZZLES.findIndex((p) => p.id === id)) },
  });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockWorkers() {
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: (event: { preventDefault: () => void }) => void;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      workers.push(this);
    }
    reply(san: string) {
      this.onmessage?.({ data: { result: { san } } });
    }
  }
  vi.stubGlobal('Worker', FakeWorker);
  return workers;
}

describe('国际象棋', () => {
  it('残局：列加尔杀两步杀，对方按主线应着，解出后记录', () => {
    render(<ChessGame />);
    openPuzzle('legal');
    expect(screen.getByText(/白先，2 步杀/)).toBeTruthy();
    move('c4', 'f7');
    expect(screen.getByText(/对方应 Ke7/)).toBeTruthy();
    move('c3', 'd5');
    expect(screen.getAllByText(/将死/).length).toBeGreaterThan(0);
    expect(
      JSON.parse(localStorage.getItem(CHESS_RECORDS_KEY)!).puzzles,
    ).toContain('legal');
  });

  it('残局：走错会摆出对方的反击并解释原因，悔棋后提示选中正确的子', () => {
    render(<ChessGame />);
    openPuzzle('back-rank');
    const p = ALL_PUZZLES.find((x) => x.id === 'back-rank')!;
    const w = p.wrong.find((x) => x.san === 'Rd7')!;
    move('d1', 'd7');
    expect(screen.getByText(/为什么不行/).parentElement!.textContent).toContain(
      w.why,
    );
    expect(screen.getByLabelText('棋谱').textContent).toContain(w.reply);
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(screen.queryByText(/为什么不行/)).toBeNull();
    expect(sq('d1').getAttribute('aria-label')).toMatch(/白车/);
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(sq('d1').getAttribute('aria-pressed')).toBe('true');
  });

  it('残局：解析按需展开；得子题走出正解后显示主线', () => {
    render(<ChessGame />);
    openPuzzle('petrov');
    fireEvent.click(screen.getByRole('button', { name: /解析/ }));
    expect(screen.getByText(/闪击/)).toBeTruthy();
    move('e5', 'c6');
    expect(screen.getByText(/正解！主线：Nc6\+/)).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem(CHESS_RECORDS_KEY)!).puzzles,
    ).toContain('petrov');
  });

  it('解出后悔棋可以重新作答，错着反击后须先悔棋', () => {
    render(<ChessGame />);
    openPuzzle('back-rank');
    move('d1', 'd8');
    expect(screen.getAllByText(/将死/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(screen.getByRole('button', { name: /提示/ })).toBeTruthy();
    move('d1', 'd8');
    expect(screen.getAllByText(/将死/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /重来/ }));
    move('d1', 'd7');
    const before = screen.getByLabelText('棋谱').textContent;
    move('d7', 'd8');
    expect(screen.getByLabelText('棋谱').textContent).toBe(before);
  });

  it('未预存的错着搜索可以取消，失败能悔棋恢复', async () => {
    const workers = mockWorkers();
    const view = render(<ChessGame />);
    openPuzzle('back-rank');
    move('f2', 'f3');
    expect(workers).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /重来/ }));
    expect(workers[0].terminate).toHaveBeenCalled();
    await act(async () => workers[0].reply('h6'));
    expect(screen.getByLabelText('棋谱').textContent).toBe('');
    move('f2', 'f3');
    await act(async () => workers[1].onerror?.({ preventDefault: vi.fn() }));
    expect(screen.getByText(/暂时无法展示反击/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(sq('f2').getAttribute('aria-label')).toMatch(/白兵/);
    move('f2', 'f3');
    view.unmount();
    expect(workers[2].terminate).toHaveBeenCalled();
  });

  it('对局：走 e4 后 AI 应着，悔棋回到开局；翻转棋盘', async () => {
    render(<ChessGame />);
    move('e2', 'e4');
    await waitFor(
      () =>
        expect(screen.getByLabelText('棋谱').textContent).toMatch(/1\. e4 \S+/),
      {
        timeout: 4000,
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    expect(sq('e2').getAttribute('aria-label')).toMatch(/白兵/);
    fireEvent.click(screen.getByRole('button', { name: /翻转/ }));
    expect(screen.getByLabelText(/^棋盘，黑方在下/)).toBeTruthy();
  });

  it('键盘：方向键移动焦点，回车选子', () => {
    render(<ChessGame />);
    sq('e2').focus();
    fireEvent.keyDown(sq('e2'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(sq('d2'));
    fireEvent.click(sq('d2'));
    expect(sq('d4').getAttribute('aria-label')).toMatch(/可走/);
  });
  it('同色重新开局取消旧搜索并重新开始，相同 FEN 也能等到 AI 回应', async () => {
    const workers = mockWorkers();
    render(<ChessGame />);
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    expect(workers).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '执黑开局' }));
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(workers).toHaveLength(2);
    await act(async () => workers[0].reply('d4'));
    expect(screen.getByLabelText('棋谱').textContent).toBe('');
    await act(async () => workers[1].reply('e4'));
    expect(screen.getByLabelText('棋谱').textContent).toContain('e4');
    expect(screen.getByText('黑方走')).toBeTruthy();
  });

  it('Worker 失败可重试，离开棋局会结束后台搜索', async () => {
    const workers = mockWorkers();
    const view = render(<ChessGame />);
    move('e2', 'e4');
    await act(async () => workers[0].onerror?.({ preventDefault: vi.fn() }));
    expect(screen.getByText(/对手暂时无法应着/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试 AI' }));
    expect(workers).toHaveLength(2);
    openPuzzle('back-rank');
    expect(workers[1].terminate).toHaveBeenCalled();
    await act(async () => workers[1].reply('e5'));
    expect(screen.getByLabelText('棋谱').textContent).toBe('');
    fireEvent.change(screen.getByLabelText('残局模式'), {
      target: { value: '' },
    });
    move('e2', 'e4');
    view.unmount();
    expect(workers[2].terminate).toHaveBeenCalled();
  });

  it('终局悔棋继续玩不会把同一局重复计入战绩', async () => {
    const workers = mockWorkers();
    render(<ChessGame />);
    move('e2', 'e4');
    await act(async () => workers[0].reply('e5'));
    fireEvent.click(screen.getByRole('button', { name: /认输/ }));
    fireEvent.click(screen.getByRole('button', { name: /悔棋/ }));
    move('e2', 'e4');
    await act(async () => workers[1].reply('e5'));
    fireEvent.click(screen.getByRole('button', { name: /认输/ }));
    expect(
      JSON.parse(localStorage.getItem(CHESS_RECORDS_KEY)!).games[2].played,
    ).toBe(1);
  });

  it('双车楼梯接受另一条杀法且提示依据当前局面', () => {
    render(<ChessGame />);
    openPuzzle('ladder');
    move('b1', 'b7');
    fireEvent.click(screen.getByRole('button', { name: /提示/ }));
    expect(sq('a2').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sq('a8'));
    expect(
      JSON.parse(localStorage.getItem(CHESS_RECORDS_KEY)!).puzzles,
    ).toContain('ladder');
  });

  it('修饰方向键保留浏览器快捷键', () => {
    render(<ChessGame />);
    sq('e2').focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    sq('e2').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(sq('e2'));
  });
  it('升变可取消和选择马，子力不足时结束对局', () => {
    const index = ALL_PUZZLES.length;
    ALL_PUZZLES.push({
      id: 'test-promotion',
      name: '升变测试',
      fen: '7k/P7/8/8/8/8/8/7K w - - 0 1',
      kind: 'play',
      n: 0,
      minGain: 0,
      line: [],
      keys: [],
      note: '',
      explain: '',
      wrong: [],
    });
    try {
      render(<ChessGame />);
      fireEvent.change(screen.getByLabelText('残局模式'), {
        target: { value: String(index) },
      });
      move('a7', 'a8');
      expect(screen.getByRole('group', { name: '升变为' })).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: '取消', exact: true }),
      );
      expect(sq('a7').getAttribute('aria-label')).toMatch(/白兵/);
      fireEvent.click(sq('a8'));
      fireEvent.click(screen.getByRole('button', { name: '马', exact: true }));
      expect(sq('a8').getAttribute('aria-label')).toMatch(/白马/);
      expect(screen.getByText(/和棋：子力不足/)).toBeTruthy();
    } finally {
      ALL_PUZZLES.splice(index, 1);
    }
  });
});
