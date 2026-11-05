import { chooseBazaarMove, type BazaarLevel } from '../../lib/games/bazaar-ai';
import type { BazaarView, Side } from '../../lib/games/bazaar';

// The worker only receives the AI's own view.
self.onmessage = (
  e: MessageEvent<{
    id: number;
    view: BazaarView;
    side: Side;
    level: BazaarLevel;
  }>,
) => {
  const { id, view, side, level } = e.data;
  try {
    self.postMessage({ id, result: chooseBazaarMove(view, side, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
