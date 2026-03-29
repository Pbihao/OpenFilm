/**
 * Simple async mutex for serializing async operations.
 */
export class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.queue;
    let resolve!: () => void;
    this.queue = new Promise<void>(r => { resolve = r; });
    await prev;
    try {
      return await fn();
    } finally {
      resolve();
    }
  }
}
