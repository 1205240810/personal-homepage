import { chooseGoMove, guessDead, type GoLevel } from '../../lib/games/go-ai';
import type { GoState } from '../../lib/games/go';

type Wire = Omit<GoState, 'board'> & { board: number[] };
export type GoWorkerRequest =
  | { id: number; type: 'move'; state: Wire; komi: number; level: GoLevel }
  | { id: number; type: 'dead'; state: Wire };

const revive = (w: Wire): GoState => ({
  ...w,
  board: Uint8Array.from(w.board),
});

self.onmessage = (event: MessageEvent<GoWorkerRequest>) => {
  const req = event.data;
  try {
    const s = revive(req.state);
    const result =
      req.type === 'move'
        ? chooseGoMove(s, req.komi, req.level)
        : guessDead(s, s.size <= 9 ? 300 : 120);
    self.postMessage({ id: req.id, result });
  } catch (error) {
    self.postMessage({ id: req.id, error: String(error) });
  }
};
