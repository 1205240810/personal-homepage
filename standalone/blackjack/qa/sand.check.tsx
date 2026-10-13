import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallingSand } from '../../../components/games/sand';
import { SAND_SAVE_KEY } from '../../../lib/games/sand';

const canvas = () => screen.getByLabelText(/落沙画布/);
const key = (k: string, o: Record<string, unknown> = {}) =>
  fireEvent.keyDown(canvas(), { key: k, ...o });
const total = () => Number(screen.getByTestId('sand-total').textContent);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('落沙模拟', () => {
  it('清空和读取存档后，实际动画帧也使用新的场景', () => {
    const ctx = {
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([20, 40, 60, 255]) }),
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: vi.fn(),
    };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.set(++next, cb);
      return next;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const advance = () =>
      act(() => {
        for (let i = 0; i < 15; i++) {
          const [id, callback] = [...frames][0];
          frames.delete(id);
          callback(i * 16);
        }
      });
    render(<FallingSand />);
    key(' ');
    advance();
    expect(total()).toBeGreaterThan(0);
    key('c');
    advance();
    expect(total()).toBe(0);
    key('3');
    key('Enter');
    const savedCount = total();
    expect(savedCount).toBeGreaterThan(0);
    key('s');
    key('c');
    advance();
    expect(total()).toBe(0);
    key('l');
    advance();
    expect(total()).toBe(savedCount);
    expect(ctx.drawImage).toHaveBeenCalledTimes(60);
  });

  it('松开笔刷前的快速拖动也补全最后一段', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 240,
      height: 160,
      right: 240,
      bottom: 160,
      toJSON: () => ({}),
    });
    render(<FallingSand />);
    key(' ');
    key('c');
    key('3');
    fireEvent.change(screen.getByRole('slider', { name: /^笔刷/ }), {
      target: { value: '0' },
    });
    fireEvent.pointerDown(canvas(), { clientX: 20, clientY: 20, button: 0 });
    fireEvent.pointerMove(canvas(), { clientX: 70, clientY: 20 });
    fireEvent.pointerUp(canvas(), { clientX: 70, clientY: 20 });
    expect(total()).toBe(51);
  });

  it('数字键选元素，[ ] 调笔刷，回车在键盘画笔处放下', () => {
    render(<FallingSand />);
    key('3');
    expect(
      screen.getByRole('button', { name: /墙/, pressed: true }),
    ).toBeTruthy();
    key('c');
    expect(total()).toBe(0);
    key(']');
    expect(screen.getByText('11px')).toBeTruthy();
    key('ArrowDown', { shiftKey: true });
    key('Enter');
    expect(total()).toBeGreaterThan(50);
    expect(screen.getByText(/放下墙/)).toBeTruthy();
    key('0');
    key('Enter');
    expect(total()).toBe(0);
  });

  it('存档与读档；空格暂停', () => {
    render(<FallingSand />);
    const load = screen.getByRole('button', { name: /读取存档/ });
    expect(load).toHaveProperty('disabled', true);
    key('3');
    key('Enter');
    const before = total();
    key('s');
    expect(JSON.parse(localStorage.getItem(SAND_SAVE_KEY)!).width).toBe(240);
    key('c');
    expect(total()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /读取存档/ }));
    expect(total()).toBeGreaterThanOrEqual(before);
    key(' ');
    expect(screen.getByRole('button', { name: /继续/ })).toBeTruthy();
  });
});
