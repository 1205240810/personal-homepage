import { chooseMove, type ChessLevel } from '../../lib/games/chess-ai';

export type ChessWorkerRequest = {
  id: number;
  fen: string;
  level: ChessLevel;
  /** Earlier positions of the game, so the engine can avoid or claim repetitions. */
  history?: string[];
};

self.onmessage = (event: MessageEvent<ChessWorkerRequest>) => {
  const { id, fen, level, history } = event.data;
  try {
    self.postMessage({
      id,
      result: chooseMove(fen, level, Math.random, Date.now, history ?? []),
    });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
