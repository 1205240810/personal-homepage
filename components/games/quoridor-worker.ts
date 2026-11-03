import {
  chooseQuoridorMove,
  type QuoridorLevel,
} from '../../lib/games/quoridor-ai';
import type { QuoridorState } from '../../lib/games/quoridor';

self.onmessage = (
  e: MessageEvent<{ id: number; state: QuoridorState; level: QuoridorLevel }>,
) => {
  const { id, state, level } = e.data;
  try {
    self.postMessage({ id, result: chooseQuoridorMove(state, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
