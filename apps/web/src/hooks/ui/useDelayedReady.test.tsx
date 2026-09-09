// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, renderHook } from '../../test/renderHook';
import { useDelayedReady } from './useDelayedReady';

describe('useDelayedReady', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    await cleanupRenderHooks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('true에서 false로 바뀌면 새 timeout 전체를 기다린다', async () => {
    const hook = await renderHook(
      ({ ready, timeoutMs }: { ready: boolean; timeoutMs: number }) => useDelayedReady(ready, timeoutMs),
      { ready: true, timeoutMs: 1_500 },
    );
    await hook.rerender({ ready: false, timeoutMs: 1_500 });
    expect(hook.result()).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(1_499));
    expect(hook.result()).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(hook.result()).toBe(true);
  });

  it('timeout 변경은 기존 timer를 취소하고 새 주기로 예약한다', async () => {
    const hook = await renderHook(
      ({ timeoutMs }: { timeoutMs: number }) => useDelayedReady(false, timeoutMs),
      { timeoutMs: 1_500 },
    );
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await hook.rerender({ timeoutMs: 2_000 });
    await act(async () => vi.advanceTimersByTimeAsync(1_999));
    expect(hook.result()).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(hook.result()).toBe(true);
  });

  it('StrictMode에서도 timer 하나만 유지하고 unmount 때 제거한다', async () => {
    const hook = await renderHook(
      ({ ready }: { ready: boolean }) => useDelayedReady(ready, 1_500),
      { ready: false },
      { strict: true },
    );
    expect(vi.getTimerCount()).toBe(1);
    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
