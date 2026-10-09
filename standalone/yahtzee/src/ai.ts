import {
  bestScore,
  type Card,
  chooseHoldAsync,
  type Difficulty,
  options,
} from './logic';
import { workerSource } from './worker-source';
export type HoldDecision = {
  held: boolean[];
  value: number;
  emergency?: boolean;
};
const isDecision = (value: unknown): value is HoldDecision => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HoldDecision>;
  return (
    Array.isArray(candidate.held) &&
    candidate.held.length === 5 &&
    candidate.held.every((held) => typeof held === 'boolean') &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value)
  );
};
export function requestHold(
  dice: number[],
  card: Card,
  difficulty: Difficulty,
  done: (decision: HoldDecision) => void,
) {
  // The fallback runs later: snapshot the public inputs just as postMessage's
  // structured clone does, rather than consulting mutable caller arrays.
  const currentDice = [...dice];
  const currentCard = { ...card };
  if (
    !Object.keys(options(currentDice, currentCard)).length ||
    !['easy', 'normal'].includes(difficulty)
  )
    throw new Error('AI 需要有效骰子、难度和未填分栏');
  let canceled = false,
    settled = false,
    fallbackStarted = false,
    worker: Worker | undefined,
    url: string | undefined,
    timeout: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    worker?.terminate();
    worker = undefined;
    if (url) {
      URL.revokeObjectURL(url);
      url = undefined;
    }
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };
  const deliver = (result: HoldDecision) => {
    if (canceled || settled) return;
    settled = true;
    cleanup();
    done({ ...result, held: [...result.held] });
  };
  const fallback = () => {
    if (canceled || settled || fallbackStarted) return;
    fallbackStarted = true;
    cleanup();
    void chooseHoldAsync(currentDice, currentCard, difficulty, () => canceled)
      .then((result) => {
        if (result) deliver(result);
      })
      .catch(() =>
        deliver({
          held: Array(5).fill(true),
          value: bestScore(currentDice, currentCard, difficulty).value,
          emergency: true,
        }),
      );
  };
  try {
    url = URL.createObjectURL(
      new Blob([workerSource], { type: 'text/javascript' }),
    );
    worker = new Worker(url);
    worker.onmessage = (e) => {
      if (canceled || settled || fallbackStarted) return;
      if (!isDecision(e.data)) {
        fallback();
        return;
      }
      deliver({ held: e.data.held, value: e.data.value });
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      fallback();
    };
    worker.onmessageerror = fallback;
    timeout = setTimeout(fallback, 4000);
    worker.postMessage({ dice: currentDice, card: currentCard, difficulty });
  } catch {
    fallback();
  }
  return () => {
    canceled = true;
    cleanup();
  };
}
