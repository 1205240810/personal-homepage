import {
  decideBot,
  reviewHand,
  REVIEW_SAMPLES,
  type AiDifficulty,
  type BotStyle,
} from '../../lib/games/holdem-strategy';
import type { HoldemState, Seat } from '../../lib/games/holdem-engine';

export type HoldemWorkerRequest = { id: number } & (
  | {
      type: 'bot';
      state: HoldemState;
      seat: Seat;
      style: BotStyle;
      difficulty: AiDifficulty;
      styles?: BotStyle[];
    }
  | {
      type: 'review';
      state: HoldemState;
      difficulty?: AiDifficulty;
      styles?: BotStyle[];
    }
);

self.onmessage = (event: MessageEvent<HoldemWorkerRequest>) => {
  const request = event.data;
  try {
    const result =
      request.type === 'bot'
        ? decideBot(
            request.state,
            request.seat,
            request.style,
            request.difficulty,
            request.styles,
          )
        : reviewHand(
            request.state,
            REVIEW_SAMPLES[request.difficulty ?? 'standard'],
            undefined,
            request.styles,
          );
    self.postMessage({ id: request.id, result });
  } catch {
    self.postMessage({ id: request.id, error: '策略计算暂时不可用' });
  }
};
