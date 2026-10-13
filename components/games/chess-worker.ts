import { chooseMove, type ChessLevel } from '../../lib/games/chess-ai';

export type ChessWorkerRequest = { id: number; fen: string; level: ChessLevel };

self.onmessage = (event: MessageEvent<ChessWorkerRequest>) => {
  const { id, fen, level } = event.data;
  try {
    self.postMessage({ id, result: chooseMove(fen, level) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
