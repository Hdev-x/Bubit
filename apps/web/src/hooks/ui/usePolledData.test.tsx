// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { usePolledData } from './usePolledData';

type Props = { enabled: boolean; fetcher: () => Promise<string> };

describe('usePolledData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await cleanupRenderHooks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('StrictMode 재설정에서 첫 요청을 버리고 활성 poll timer를 하나만 둔다', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fetcher = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const hook = await renderHook(
      ({ enabled, fetcher }: Props) => usePolledData(fetcher, 'empty', enabled, 1_000),
      { enabled: true, fetcher },
      { strict: true },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve('current'));
    expect(hook.result().data).toBe('current');
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => first.resolve('stale'));
    expect(hook.result().data).toBe('current');
    expect(vi.getTimerCount()).toBe(1);

    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('빠르게 비활성화 후 재활성화하면 늦은 이전 응답을 버린다', async () => {
    const oldRequest = deferred<string>();
    const newRequest = deferred<string>();
    const oldFetcher = vi.fn(() => oldRequest.promise);
    const newFetcher = vi.fn(() => newRequest.promise);
    const hook = await renderHook(
      ({ enabled, fetcher }: Props) => usePolledData(fetcher, 'empty', enabled, 1_000),
      { enabled: true, fetcher: oldFetcher },
    );

    await hook.rerender({ enabled: false, fetcher: oldFetcher });
    await hook.rerender({ enabled: true, fetcher: newFetcher });
    await act(async () => newRequest.resolve('new'));
    expect(hook.result()).toMatchObject({ data: 'new', loading: false });

    await act(async () => oldRequest.resolve('old'));
    expect(hook.result()).toMatchObject({ data: 'new', loading: false });
    expect(oldFetcher).toHaveBeenCalledOnce();
    expect(newFetcher).toHaveBeenCalledOnce();

    await hook.unmount();
  });

  it('unmount하면 진행 중 응답과 다음 poll 예약을 폐기한다', async () => {
    const request = deferred<string>();
    const fetcher = vi.fn(() => request.promise);
    const hook = await renderHook(
      ({ enabled, fetcher }: Props) => usePolledData(fetcher, 'empty', enabled, 1_000),
      { enabled: true, fetcher },
    );

    await hook.unmount();
    await act(async () => request.resolve('late'));
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetcher가 바뀌어도 refetch identity와 poll timer를 유지하며 최신 fetcher를 쓴다', async () => {
    const fetcherA = vi.fn().mockResolvedValue('a');
    const fetcherB = vi.fn().mockResolvedValueOnce('b').mockResolvedValueOnce('b-poll');
    const hook = await renderHook(
      ({ enabled, fetcher }: Props) => usePolledData(fetcher, 'empty', enabled, 1_000),
      { enabled: true, fetcher: fetcherA },
    );
    await act(async () => {});
    const refetch = hook.result().refetch;
    expect(vi.getTimerCount()).toBe(1);

    await hook.rerender({ enabled: true, fetcher: fetcherB });
    expect(hook.result().refetch).toBe(refetch);
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => refetch());
    expect(hook.result().data).toBe('b');
    expect(fetcherB).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetcherB).toHaveBeenCalledTimes(2);
    expect(hook.result().data).toBe('b-poll');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('disabled 상태의 명시적 refetch는 동작하지만 poll timer는 만들지 않는다', async () => {
    const fetcher = vi.fn().mockResolvedValue('manual');
    const hook = await renderHook(
      ({ enabled, fetcher }: Props) => usePolledData(fetcher, 'empty', enabled, 1_000),
      { enabled: false, fetcher },
    );
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => hook.result().refetch());
    expect(hook.result()).toMatchObject({ data: 'manual', loading: false });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('일시 실패에는 이전 데이터를 유지하고 다음 poll을 계속한다', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('recovered');
    const hook = await renderHook(
      ({ enabled, fetcher }: Props) => usePolledData(fetcher, 'empty', enabled, 1_000),
      { enabled: true, fetcher },
    );
    await act(async () => {});

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(hook.result()).toMatchObject({ data: 'first', loading: false });
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(hook.result().data).toBe('recovered');
  });
});
