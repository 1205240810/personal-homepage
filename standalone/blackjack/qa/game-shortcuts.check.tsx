import { StrictMode } from 'react';
import { createPortal } from 'react-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameStage } from '../../../components/games/shortcuts';
import { LaserMirrors } from '../../../components/games/laser';
import { ChessGame } from '../../../components/games/chess';
import { GoGame } from '../../../components/games/go';
import { ALL_PUZZLES } from '../../../lib/games/chess';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('game stage keyboard scope', () => {
  it('Z undoes chess moves and their puzzle reply exactly once', () => {
    render(
      <GameStage>
        <ChessGame />
      </GameStage>,
    );
    fireEvent.change(screen.getByLabelText('残局模式'), {
      target: {
        value: String(ALL_PUZZLES.findIndex((p) => p.id === 'back-rank')),
      },
    });
    const square = (name: string) =>
      document.querySelector<HTMLButtonElement>(`[data-sq="${name}"]`)!;
    fireEvent.click(square('d1'));
    fireEvent.click(square('d7'));
    expect(screen.getByLabelText('棋谱').textContent).toContain('Rd7');
    square('d7').focus();
    fireEvent.keyDown(square('d7'), { key: 'z' });
    expect(screen.getByLabelText('棋谱').textContent).toBe('');
    expect(square('d1').getAttribute('aria-label')).toContain('白车');
    expect(screen.getByRole('button', { name: '悔棋' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('Z restores a go puzzle after the player move and the reply', () => {
    render(
      <GameStage>
        <GoGame />
      </GameStage>,
    );
    fireEvent.change(screen.getByLabelText('模式'), { target: { value: '0' } });
    const point = () =>
      document.querySelector<HTMLButtonElement>('[data-pt="1"]')!;
    const initial = point().getAttribute('aria-label');
    fireEvent.click(point());
    expect(screen.getByText(/好棋！白 A9/)).toBeTruthy();
    point().focus();
    fireEvent.keyDown(point(), { key: 'z' });
    expect(point().getAttribute('aria-label')).toBe(initial);
    expect(screen.getByRole('button', { name: '悔棋' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('keeps progress when focus is on the site header or a portaled panel', () => {
    render(
      <>
        <button>站点主题</button>
        <GameStage>
          <LaserMirrors />
          {createPortal(
            <div role="dialog">
              <button>播放列表</button>
            </div>,
            document.body,
          )}
        </GameStage>
      </>,
    );
    const cell = () =>
      screen.getByRole('button', { name: /^第 1 行第 5 列，/ });
    fireEvent.click(cell());
    for (const label of ['站点主题', '播放列表']) {
      const control = screen.getByRole('button', { name: label });
      control.focus();
      expect(fireEvent.keyDown(control, { key: 'r' })).toBe(true);
      expect(cell().getAttribute('aria-label')).toContain('镜子');
    }
    cell().focus();
    expect(fireEvent.keyDown(cell(), { key: 'r' })).toBe(false);
    expect(cell().getAttribute('aria-label')).toContain('空格');
  });

  it('leaves composition, editors, modifier chords, and repeated keys alone', () => {
    const restart = vi.fn();
    render(
      <GameStage>
        <button data-shortcut="r" onClick={restart}>
          重来
        </button>
        <input aria-label="输入" />
        <select aria-label="选择">
          <option>r</option>
        </select>
        <textarea aria-label="编辑" />
        <div contentEditable="plaintext-only" suppressContentEditableWarning>
          <span>纯文本编辑区</span>
        </div>
        <div contentEditable suppressContentEditableWarning>
          <span>富文本编辑区</span>
        </div>
      </GameStage>,
    );
    const button = screen.getByRole('button', { name: '重来' });
    for (const ignored of [
      { isComposing: true },
      { keyCode: 229 },
      { repeat: true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
    ]) {
      expect(fireEvent.keyDown(button, { key: 'r', ...ignored })).toBe(true);
    }
    for (const target of [
      screen.getByLabelText('输入'),
      screen.getByLabelText('选择'),
      screen.getByLabelText('编辑'),
      screen.getByText('纯文本编辑区'),
      screen.getByText('富文本编辑区'),
    ]) {
      expect(fireEvent.keyDown(target, { key: 'r' })).toBe(true);
    }
    expect(restart).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(button, { key: 'R', shiftKey: true })).toBe(false);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('leaves dialog keys to the dialog even when it is inside the stage', () => {
    const restart = vi.fn();
    render(
      <GameStage>
        <button data-shortcut="r" onClick={restart}>
          重来
        </button>
        <div role="dialog">
          <button>继续</button>
        </div>
      </GameStage>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: '继续' }), {
      key: 'r',
    });
    expect(restart).not.toHaveBeenCalled();
  });

  it('respects handled keys and disabled buttons, and mounts only one listener', () => {
    const undo = vi.fn();
    const disabled = vi.fn();
    const view = render(
      <StrictMode>
        <GameStage>
          <button data-shortcut="z" disabled onClick={disabled}>
            禁用悔棋
          </button>
          <button data-shortcut="z" onClick={undo}>
            悔棋
          </button>
          <button onKeyDown={(e) => e.preventDefault()}>已有快捷键</button>
        </GameStage>
      </StrictMode>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: '已有快捷键' }), {
      key: 'z',
    });
    expect(undo).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: '悔棋', exact: true });
    fireEvent.keyDown(button, { key: 'z' });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(disabled).not.toHaveBeenCalled();
    button.disabled = true;
    expect(fireEvent.keyDown(button, { key: 'z' })).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(fireEvent.keyDown(document.body, { key: 'z' })).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
