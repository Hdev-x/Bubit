export function loadWithTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    const timer = window.setTimeout(
      () => finish(() => reject(Object.assign(new Error('Candle load timed out'), { name: 'TimeoutError' }))),
      timeoutMs,
    );
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}
