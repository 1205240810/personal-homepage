import {
  chooseGoMove,
  estimateScore,
  guessDead,
  judgeGo,
  type GoLevel,
} from '../../lib/games/go-ai';
import type { GoState } from '../../lib/games/go';

type Wire = Omit<GoState, 'board'> & { board: number[] };
export type GoWorkerRequest =
  | { id: number; type: 'move'; state: Wire; komi: number; level: GoLevel }
  | { id: number; type: 'dead'; state: Wire }
  | { id: number; type: 'judge'; state: Wire; komi: number };

const revive = (w: Wire): GoState => ({
  ...w,
  board: Uint8Array.from(w.board),
});

self.onmessage = (event: MessageEvent<GoWorkerRequest>) => {
  const req = event.data;
  try {
    const s = revive(req.state);
    let result: unknown;
    if (req.type === 'move') {
      const r = chooseGoMove(s, req.komi, req.level);
      // Only pay for a score estimate when the AI might be lost (resign check).
      const lead =
        r.winrate < 0.15 ? estimateScore(s, req.komi, 80).lead : undefined;
      result = { ...r, lead };
    } else if (req.type === 'judge') result = judgeGo(s, req.komi);
    else result = guessDead(s, s.size <= 9 ? 300 : 120);
    self.postMessage({ id: req.id, result });
  } catch (error) {
    self.postMessage({ id: req.id, error: String(error) });
  }
};
