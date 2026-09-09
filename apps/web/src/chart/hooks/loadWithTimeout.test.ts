// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../../test/renderHook';
import { loadWithTimeout } from './loadWithTimeout';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('loadWithTimeout', () => {
  it('성공과 실패 뒤 timer를 정리한다', async () => {
    vi.useFakeTimers();
    await expect(loadWithTimeout(Promise.resolve('ok'), new AbortController().signal)).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
    await expect(loadWithTimeout(Promise.reject(new Error('fail')), new AbortController().signal)).rejects.toThrow('fail');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('abort와 deadline 뒤 늦은 resolve를 무시한다', async () => {
    vi.useFakeTimers();
    const aborted = deferred<string>();
    const controller = new AbortController();
    const abortResult = loadWithTimeout(aborted.promise, controller.signal);
    controller.abort();
    await expect(abortResult).rejects.toMatchObject({ name: 'AbortError' });
    aborted.resolve('late');
    expect(vi.getTimerCount()).toBe(0);

    const timed = deferred<string>();
    const timeoutResult = loadWithTimeout(timed.promise, new AbortController().signal, 100);
    const timeoutAssertion = expect(timeoutResult).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(100);
    await timeoutAssertion;
    timed.resolve('late');
    expect(vi.getTimerCount()).toBe(0);
  });
});
