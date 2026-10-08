import { estimateEquity } from '../../lib/games/holdem-cards';
import { reviewHand } from '../../lib/games/holdem-strategy';
import type { HoldemState } from '../../lib/games/holdem-engine';

type WorkerRequest = { id: number } & (
  | { type: 'equity'; hole: number[]; board: number[] }
  | { type: 'review'; state: HoldemState }
);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result =
      request.type === 'equity'
        ? estimateEquity(request.hole, request.board, 280)
        : reviewHand(request.state, 360);
    self.postMessage({ id: request.id, result });
  } catch {
    self.postMessage({ id: request.id, error: '策略计算暂时不可用' });
  }
};
