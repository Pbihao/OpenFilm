/**
 * Async mutex — serializes concurrent operations one at a time.
 *
 * Pass an AbortSignal to runExclusive() so that if the signal fires while
 * waiting in the queue, the task is skipped immediately (not run) and the
 * next task in the queue is unblocked. Tasks already running are unaffected.
 */

function waitOrAbort(prev: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return Promise.race([
    prev,
    new Promise<never>((_, reject) =>
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    ),
  ]);
}

export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(r => { release = r; });
    try {
      await (signal ? waitOrAbort(prev, signal) : prev);
      return await fn();
    } finally {
      release(); // always release — even on abort or error, so the next task can proceed
    }
  }
}
