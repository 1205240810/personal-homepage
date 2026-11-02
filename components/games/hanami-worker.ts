import { chooseHanamiMove, type HanamiLevel } from '../../lib/games/hanami-ai';
import type { HanamiState, HanamiView, Side } from '../../lib/games/hanami';

// The worker receives only the AI's own view plus turn structure; hidden cards
// in `shape` are blanked by the page before posting.
self.onmessage = (
  e: MessageEvent<{
    id: number;
    shape: HanamiState;
    view: HanamiView;
    side: Side;
    level: HanamiLevel;
  }>,
) => {
  const { id, shape, view, side, level } = e.data;
  try {
    self.postMessage({
      id,
      result: chooseHanamiMove(shape, view, side, level),
    });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
