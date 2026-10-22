/**
 * Runs at most `limit` tasks at once. The server resolves each stream with its
 * own process, so a burst of requests would stall all of them past the timeout.
 */
export class TaskQueue {
  private readonly waiting: (() => void)[] = [];
  private running = 0;

  constructor(private readonly limit: number) {}

  /** @param urgent - goes ahead of the waiting tasks, for what is needed right now */
  run<T>(task: () => Promise<T>, { urgent = false } = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.waiting.shift()?.();
          });
      };
      if (this.running < this.limit) start();
      else if (urgent) this.waiting.unshift(start);
      else this.waiting.push(start);
    });
  }
}
