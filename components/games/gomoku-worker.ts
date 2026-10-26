import { chooseGomokuMove, type GomokuLevel } from '../../lib/games/gomoku-ai';
import type { GomokuState } from '../../lib/games/gomoku';

self.onmessage = (
  e: MessageEvent<{ id: number; state: GomokuState; level: GomokuLevel }>,
) => {
  const { id, state, level } = e.data;
  try {
    self.postMessage({ id, result: chooseGomokuMove(state, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
