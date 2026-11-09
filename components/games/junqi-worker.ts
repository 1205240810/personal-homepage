import { chooseJunqiMove, type JunqiLevel } from '../../lib/games/junqi-ai';
import type { JunqiView } from '../../lib/games/junqi';

self.onmessage = (
  e: MessageEvent<{ id: number; view: JunqiView; level: JunqiLevel }>,
) => {
  const { id, view, level } = e.data;
  try {
    self.postMessage({ id, result: chooseJunqiMove(view, level) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
