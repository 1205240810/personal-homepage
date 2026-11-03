import { chooseGlazeMove, type GlazeLevel } from '../../lib/games/glaze-ai';
import type { GlazeView, Side } from '../../lib/games/glaze';

self.onmessage = (
  e: MessageEvent<{
    id: number;
    view: GlazeView;
    side: Side;
    level: GlazeLevel;
  }>,
) => {
  const { id, view, side, level } = e.data;
  try {
    self.postMessage({ id, result: chooseGlazeMove(view, side, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
