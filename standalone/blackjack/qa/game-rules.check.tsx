import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameRules } from '../../../components/games/game-rules';
import { GameStage } from '../../../components/games/shortcuts';

let narrow = false;
const dialogMethods = ['showModal', 'close'] as const;
const originalDialogMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
let mediaListeners: Set<() => void>;
const resize = (mobile: boolean) => {
  narrow = mobile;
  act(() => mediaListeners.forEach((listener) => listener()));
};
const trigger = () => screen.getByRole('button', { name: /规则与玩法/ });

beforeEach(() => {
  narrow = false;
  mediaListeners = new Set();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return narrow;
    },
    addEventListener: (_: string, listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      mediaListeners.delete(listener),
  }));
  // jsdom does not implement the browser's top-layer dialog API. Actual focus
  // containment and backdrop interaction are also checked in a real browser.
  for (const name of dialogMethods)
    Object.defineProperty(HTMLDialogElement.prototype, name, {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = name === 'showModal';
      },
    });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dialogMethods.forEach((name, i) => {
    const original = originalDialogMethods[i];
    if (original)
      Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
  document.body.style.overflow = '';
});

describe('game rules interaction', () => {
  it('opens inline on desktop, blocks game shortcuts while reading, and restores focus', () => {
    const restart = vi.fn();
    render(
      <GameStage>
        <GameRules gameId="gomoku" />
        <button data-shortcut="r" onClick={restart}>
          重开游戏
        </button>
      </GameStage>,
    );
    expect(screen.queryByRole('region')).toBeNull();
    fireEvent.click(trigger());
    const panel = screen.getByRole('region', { name: '规则与玩法' });
    expect(document.activeElement).toBe(panel);
    fireEvent.keyDown(panel, { key: 'r' });
    expect(restart).not.toHaveBeenCalled();
    fireEvent.keyDown(panel, { key: '?' });
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    fireEvent.keyDown(trigger(), { key: '?' });
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('does not intercept typing, composition, held keys, or another dialog', () => {
    render(
      <>
        <GameRules gameId="go" />
        <input aria-label="房间码" />
        <div contentEditable suppressContentEditableWarning>
          编辑内容
        </div>
        <div role="dialog" aria-label="其他弹窗" tabIndex={-1} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('房间码'), { key: '?' });
    fireEvent.keyDown(screen.getByText('编辑内容'), { key: '?' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '?' });
    for (const extra of [
      { repeat: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ]) {
      fireEvent.keyDown(document.body, { key: '?', ...extra });
    }
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('uses a native modal on mobile, restores body scrolling and focus on cancel', () => {
    narrow = true;
    document.body.style.overflow = 'auto';
    render(<GameRules gameId="hanami" online />);
    fireEvent.click(trigger());
    const dialog = screen.getByRole('dialog', {
      name: '联机规则与玩法',
    }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByText(/藏牌在轮末才向双方公开/)).toBeTruthy();
    fireEvent(
      dialog,
      new Event('cancel', { bubbles: false, cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes only for backdrop clicks and keeps the panel open across viewport changes', () => {
    narrow = true;
    render(<GameRules gameId="flow" />);
    fireEvent.click(trigger());
    const dialog = screen.getByRole('dialog');
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 390,
      top: 300,
      bottom: 800,
      width: 390,
      height: 500,
      x: 0,
      y: 300,
      toJSON: () => ({}),
    });
    fireEvent.click(dialog, { clientX: 100, clientY: 500 });
    expect(screen.getByRole('dialog')).toBeTruthy();
    resize(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region')).toBeTruthy();
    expect(document.body.style.overflow).toBe('');
    resize(true);
    const reopened = screen.getByRole('dialog');
    vi.spyOn(reopened, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 390,
      top: 300,
      bottom: 800,
      width: 390,
      height: 500,
      x: 0,
      y: 300,
      toJSON: () => ({}),
    });
    fireEvent.click(reopened, { clientX: 100, clientY: 100 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('cleans up modal state on unmount and shows the online rules only when requested', () => {
    narrow = true;
    const view = render(<GameRules gameId="blackjack" online />);
    fireEvent.click(trigger());
    expect(screen.getByText(/轮流坐庄/)).toBeTruthy();
    view.unmount();
    expect(document.body.style.overflow).toBe('');
    render(<GameRules gameId="blackjack" />);
    fireEvent.click(trigger());
    expect(screen.getByText(/顶部切换三种玩法/)).toBeTruthy();
    expect(screen.queryByText(/轮流坐庄/)).toBeNull();
  });
});
