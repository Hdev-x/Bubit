// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { useLivePrice } from './useLivePrice';

const mocks = vi.hoisted(() => ({ fetchTicker: vi.fn(), callbacks: [] as Array<(ticker: { symbol: string; price: number }) => void>, closes: [] as ReturnType<typeof vi.fn>[] }));
vi.mock('../../api/exchange/headerTicker', () => ({ fetchHeaderTicker: mocks.fetchTicker }));
vi.mock('../../api/server/coinRealtime', () => {
  const subscribe = vi.fn((_symbols, callback) => { mocks.callbacks.push(callback); const close = vi.fn(); mocks.closes.push(close); return { close }; });
  return { subscribeBinanceFuturesTickers: subscribe, subscribeBinanceSpotTickers: subscribe, subscribeBitgetFuturesTickers: subscribe, subscribeBitgetSpotTickers: subscribe };
});
vi.mock('../../api/exchange/krw/krwRealtime', () => ({ subscribeKrwTickers: vi.fn((_exchange, _symbols, callback) => { mocks.callbacks.push(callback); const close = vi.fn(); mocks.closes.push(close); return { close }; }) }));

const ticker = (last: number, openUtc = 0) => ({ last, openUtc, high24h: last, low24h: last, baseVolume: 1, quoteVolume: 1 });
type Props = Parameters<typeof useLivePrice>[0];
const base: Props = { symbol: 'BTCUSDT', exchange: 'BINANCE', isFutures: true, loadDailyOpen: async () => 90 };
afterEach(async () => { await cleanupRenderHooks(); vi.clearAllMocks(); mocks.callbacks = []; mocks.closes = []; vi.useRealTimers(); });

describe('useLivePrice lifecycle', () => {
  it('ticker가 준비되면 pending daily open을 기다리지 않고 즉시 ready가 된다', async () => {
    const daily = deferred<number | null>();
    mocks.fetchTicker.mockResolvedValue(ticker(100, 999));
    const hook = await renderHook(useLivePrice, { ...base, loadDailyOpen: () => daily.promise });
    await act(async () => {});
    expect(hook.result()).toMatchObject({ price: 100, dailyOpen: null, ready: true, status: 'ready' });
    await act(async () => daily.resolve(90));
    expect(hook.result()).toMatchObject({ price: 100, dailyOpen: 90, ready: true });
  });

  it('full-key A→B→A는 새 loading이며 이전 subscription callback과 응답을 폐기한다', async () => {
    const a1 = deferred<ReturnType<typeof ticker>>(); const b = deferred<ReturnType<typeof ticker>>(); const a2 = deferred<ReturnType<typeof ticker>>();
    mocks.fetchTicker.mockReturnValueOnce(a1.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(a2.promise);
    const hook = await renderHook(useLivePrice, base);
    await act(async () => a1.resolve(ticker(100)));
    expect(hook.result()).toMatchObject({ price: 100, ready: true, status: 'ready' });
    const oldCallback = mocks.callbacks[0];
    await hook.rerender({ ...base, exchange: 'BITGET' });
    expect(hook.result()).toMatchObject({ price: 100, ready: false, status: 'loading' });
    await hook.rerender(base);
    expect(hook.result()).toMatchObject({ price: 100, ready: false, status: 'loading' });
    act(() => oldCallback({ symbol: 'BTCUSDT', price: 999 }));
    await act(async () => a2.resolve(ticker(300)));
    await act(async () => b.resolve(ticker(200)));
    expect(hook.result()).toMatchObject({ price: 300, ready: true, status: 'ready' });
  });

  it('daily reject와 hang은 ticker seed를 nullable dailyOpen으로 준비한다', async () => {
    vi.useFakeTimers();
    mocks.fetchTicker.mockResolvedValue(ticker(100));
    const rejected = await renderHook(useLivePrice, { ...base, loadDailyOpen: () => Promise.reject(new Error('daily')) });
    await act(async () => {});
    expect(rejected.result()).toMatchObject({ price: 100, dailyOpen: null, ready: true });
    await rejected.unmount();
    const hanging = await renderHook(useLivePrice, { ...base, loadDailyOpen: () => new Promise(() => {}) });
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(hanging.result()).toMatchObject({ price: 100, dailyOpen: null, ready: true });
  });

  it('ticker timeout은 error이고 reloadKey retry 및 StrictMode cleanup은 새 ready만 반영한다', async () => {
    vi.useFakeTimers();
    const first = new Promise<ReturnType<typeof ticker>>(() => {}); const strictOld = deferred<ReturnType<typeof ticker>>(); const retry = deferred<ReturnType<typeof ticker>>();
    mocks.fetchTicker.mockReturnValueOnce(first).mockReturnValueOnce(strictOld.promise).mockReturnValueOnce(retry.promise);
    const hook = await renderHook(useLivePrice, base, { strict: true });
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(hook.result().status).toBe('error');
    await hook.rerender({ ...base, reloadKey: 1 });
    expect(hook.result().status).toBe('loading');
    await act(async () => retry.resolve(ticker(400)));
    await act(async () => strictOld.resolve(ticker(111)));
    expect(hook.result()).toMatchObject({ price: 400, ready: true, status: 'ready' });
    await hook.unmount();
    expect(mocks.closes.every((close) => close.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('같은 key 실패 attempt의 daily를 버리고 retry 성공 뒤 rollover timer 하나만 둔다', async () => {
    vi.useFakeTimers();
    const failedDaily = deferred<number | null>();
    const daily = vi.fn().mockResolvedValueOnce(90).mockReturnValueOnce(failedDaily.promise).mockResolvedValueOnce(95);
    mocks.fetchTicker.mockResolvedValueOnce(ticker(100)).mockResolvedValueOnce(null).mockResolvedValueOnce(ticker(200));
    const hook = await renderHook(useLivePrice, { ...base, loadDailyOpen: daily }); await act(async () => {});
    expect(hook.result()).toMatchObject({ price: 100, dailyOpen: 90, status: 'ready' });
    await hook.rerender({ ...base, loadDailyOpen: daily, reloadKey: 1 }); await act(async () => {});
    expect(hook.result()).toMatchObject({ price: 100, dailyOpen: 90, status: 'error' });
    await act(async () => failedDaily.resolve(777));
    expect(hook.result().dailyOpen).toBe(90);
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(hook.result()).toMatchObject({ price: 200, dailyOpen: 95, status: 'ready' });
    expect(vi.getTimerCount()).toBe(1);
    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
