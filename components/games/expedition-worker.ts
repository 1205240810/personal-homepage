import {
  chooseExpeditionMove,
  type ExpeditionLevel,
} from '../../lib/games/expedition-ai';
import type { ExpeditionView, Side } from '../../lib/games/expedition';

// The worker only receives the AI's own view; hidden cards never leave the page state.
self.onmessage = (
  e: MessageEvent<{
    id: number;
    view: ExpeditionView;
    side: Side;
    level: ExpeditionLevel;
  }>,
) => {
  const { id, view, side, level } = e.data;
  try {
    self.postMessage({ id, result: chooseExpeditionMove(view, side, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
