import {
  chooseBrocadeMove,
  type BrocadeLevel,
} from '../../lib/games/brocade-ai';
import type { BrocadeView, Side } from '../../lib/games/brocade';

self.onmessage = (
  e: MessageEvent<{
    id: number;
    view: BrocadeView;
    side: Side;
    level: BrocadeLevel;
  }>,
) => {
  const { id, view, side, level } = e.data;
  try {
    self.postMessage({ id, result: chooseBrocadeMove(view, side, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
