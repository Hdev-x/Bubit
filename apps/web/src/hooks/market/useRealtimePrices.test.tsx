// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, renderHook } from '../../test/renderHook';
import { useRealtimePrices, useRealtimeTickers } from './useRealtimePrices';

const mocks = vi.hoisted(() => ({
  spot: vi.fn(), futures: vi.fn(), callbacks: [] as Array<(ticker: { symbol: string; price: number }) => void>, closes: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock('../../api/server/coinRealtime', () => {
  const subscribe = (mock: ReturnType<typeof vi.fn>) => mock.mockImplementation((_symbols: string[], callback: (ticker: { symbol: string; price: number }) => void) => {
    mocks.callbacks.push(callback);
    const close = vi.fn(); mocks.closes.push(close);
    return { close };
  });
  return { subscribeBitgetSpotTickers: subscribe(mocks.spot), subscribeBitgetFuturesTickers: subscribe(mocks.futures) };
});

afterEach(async () => { await cleanupRenderHooks(); vi.clearAllMocks(); mocks.callbacks = []; mocks.closes = []; });

describe('useRealtimePrices', () => {
  it('ticker 현선물 전환과 A→B→A에서 이전 값과 이전 구독을 폐기한다', async () => {
    const hook = await renderHook(
      ({ symbols, futures }: { symbols: string[]; futures: boolean }) => useRealtimeTickers(symbols, futures),
      { symbols: ['BTCUSDT'], futures: true },
    );
    act(() => mocks.callbacks[0]({ symbol: 'BTCUSDT', price: 100 }));
    await hook.rerender({ symbols: ['BTCUSDT'], futures: false });
    expect(hook.result()).toEqual({});
    act(() => mocks.callbacks[1]({ symbol: 'BTCUSDT', price: 200 }));
    await hook.rerender({ symbols: ['ETHUSDT'], futures: false });
    await hook.rerender({ symbols: ['BTCUSDT'], futures: false });
    expect(hook.result()).toEqual({});
    act(() => mocks.callbacks[1]({ symbol: 'BTCUSDT', price: 999 }));
    expect(hook.result()).toEqual({});
    act(() => mocks.callbacks[3]({ symbol: 'BTCUSDT', price: 300 }));
    expect(hook.result()).toEqual({ BTCUSDT: { symbol: 'BTCUSDT', price: 300 } });
    await hook.rerender({ symbols: [], futures: false });
    expect(hook.result()).toEqual({});
    expect(mocks.closes.every(close => close.mock.calls.length === 1)).toBe(true);
  });

  it('현물 채널만 구독하고 비활성화 시 닫고 이전 가격을 비운다', async () => {
    const hook = await renderHook(
      ({ active }: { active: boolean }) => useRealtimePrices(['BTCUSDT'], false, active),
      { active: true },
    );
    expect(mocks.spot).toHaveBeenCalledWith(['BTCUSDT'], expect.any(Function));
    expect(mocks.futures).not.toHaveBeenCalled();
    act(() => mocks.callbacks[0]({ symbol: 'BTCUSDT', price: 100 }));
    expect(hook.result()).toEqual({ BTCUSDT: 100 });

    await hook.rerender({ active: false });
    expect(mocks.closes[0]).toHaveBeenCalledOnce();
    expect(hook.result()).toEqual({});

    await hook.rerender({ active: true });
    expect(hook.result()).toEqual({});
    act(() => mocks.callbacks[0]({ symbol: 'BTCUSDT', price: 999 }));
    expect(hook.result()).toEqual({});
    act(() => mocks.callbacks[1]({ symbol: 'BTCUSDT', price: 200 }));
    expect(hook.result()).toEqual({ BTCUSDT: 200 });
  });
});
