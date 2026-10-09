/** The worker and fallback consume the same steps, preserving samples and rules. */
export function finishComputation<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Yield between small model steps so fallback work can be paused or cancelled. */
export function runCooperative<T>(
  steps: Generator<void, T>,
  signal: AbortSignal,
  sliceMs = 8,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new Error('计算已取消'));
    };
    const advance = () => {
      if (signal.aborted) return cancel();
      const deadline = performance.now() + sliceMs;
      try {
        do {
          const step = steps.next();
          if (step.done) {
            signal.removeEventListener('abort', cancel);
            resolve(step.value);
            return;
          }
        } while (!signal.aborted && performance.now() < deadline);
        if (signal.aborted) cancel();
        else timer = setTimeout(advance, 0);
      } catch (error) {
        signal.removeEventListener('abort', cancel);
        reject(error);
      }
    };
    if (signal.aborted) return cancel();
    signal.addEventListener('abort', cancel, { once: true });
    // Even the first slice yields so status text can paint before computation.
    timer = setTimeout(advance, 0);
  });
}
