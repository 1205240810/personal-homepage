export const HOLDEM_WORKER_DEADLINES = { bot: 15_000, review: 45_000 } as const;

type WorkerReply = { id: number; result?: unknown; error?: string };
export type StrategyWorker = {
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
  terminate: () => void;
};
type JobKind = { type: keyof typeof HOLDEM_WORKER_DEADLINES };
type Task = {
  finish: (error?: Error, result?: unknown) => void;
  fallback: () => void;
  usingFallback: boolean;
};

/** Owns worker generations, finite deadlines, cancellation and fallback cleanup. */
export class HoldemWorkerClient<Job extends JobKind> {
  private worker: StrategyWorker | null = null;
  private serial = 0;
  private disposed = false;
  private pending = new Map<number, Task>();
  private readonly createWorker: () => StrategyWorker;
  private readonly computeFallback: (
    job: Job,
    signal: AbortSignal,
  ) => Promise<unknown>;
  private readonly onModeChange: (mode: 'worker' | 'fallback') => void;
  private readonly deadlineMs: (job: Job) => number;

  constructor(options: {
    createWorker: () => StrategyWorker;
    computeFallback: (job: Job, signal: AbortSignal) => Promise<unknown>;
    onModeChange?: (mode: 'worker' | 'fallback') => void;
    deadlineMs?: (job: Job) => number;
  }) {
    this.createWorker = options.createWorker;
    this.computeFallback = options.computeFallback;
    this.onModeChange = options.onModeChange ?? (() => {});
    this.deadlineMs =
      options.deadlineMs ?? ((job) => HOLDEM_WORKER_DEADLINES[job.type]);
  }

  private stopWorker() {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    let instance: StrategyWorker;
    try {
      instance = this.createWorker();
    } catch {
      return null;
    }
    this.worker = instance;
    this.onModeChange('worker');
    instance.onmessage = ({ data }) => {
      if (this.worker !== instance || !data) return;
      const task = this.pending.get(data.id);
      if (!task || task.usingFallback) return;
      if (data.error) task.finish(new Error(data.error));
      else task.finish(undefined, data.result);
    };
    const unavailable = () => {
      if (this.worker !== instance) return;
      this.stopWorker();
      for (const task of this.pending.values()) task.fallback();
    };
    instance.onerror = unavailable;
    instance.onmessageerror = unavailable;
    return instance;
  }

  request<T>(job: Job, signal?: AbortSignal): Promise<T> {
    if (this.disposed || signal?.aborted)
      return Promise.reject(new Error('计算已取消'));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.serial;
      const controller = new AbortController();
      const cancel = () => {
        task.finish(new Error('计算已取消'));
        // Cancel the actual computation, not just its eventual state update.
        if (!this.pending.size) this.stopWorker();
      };
      const deadline = setTimeout(() => {
        if (!this.pending.has(id)) return;
        const error = new Error(
          job.type === 'bot'
            ? 'AI 计算超时，本次行动未执行。请重试。'
            : '复盘计算超时，完整行动线仍可查看。请重试或开始下一手。',
        );
        if (!task.usingFallback) {
          // A stalled worker cannot process queued jobs. Replace it on retry.
          this.stopWorker();
          for (const other of this.pending.values()) {
            if (!other.usingFallback) other.finish(error);
          }
        } else task.finish(error);
      }, this.deadlineMs(job));
      const task: Task = {
        usingFallback: false,
        finish: (error, result) => {
          if (!this.pending.delete(id)) return;
          clearTimeout(deadline);
          signal?.removeEventListener('abort', cancel);
          controller.abort();
          if (error) reject(error);
          else resolve(result as T);
        },
        fallback: () => {
          if (task.usingFallback || !this.pending.has(id)) return;
          task.usingFallback = true;
          this.onModeChange('fallback');
          // Retain the same deadline. Fallback yields and observes cancellation.
          void Promise.resolve()
            .then(() => {
              if (controller.signal.aborted) throw new Error('计算已取消');
              return this.computeFallback(job, controller.signal);
            })
            .then(
              (result) => task.finish(undefined, result),
              (error: unknown) =>
                task.finish(
                  error instanceof Error
                    ? error
                    : new Error('策略计算暂时不可用'),
                ),
            );
        },
      };
      this.pending.set(id, task);
      signal?.addEventListener('abort', cancel, { once: true });
      const worker = this.ensureWorker();
      if (!worker) return task.fallback();
      try {
        worker.postMessage({ ...job, id });
      } catch {
        this.stopWorker();
        for (const pending of this.pending.values()) pending.fallback();
      }
    });
  }

  dispose() {
    this.disposed = true;
    this.stopWorker();
    for (const task of this.pending.values())
      task.finish(new Error('页面已离开'));
  }
}
