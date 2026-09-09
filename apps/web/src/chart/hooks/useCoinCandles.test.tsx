// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../../shared/types/market';
import { subscribeCoinCandle } from '../../api/server/coinRealtime';
import { subscribeKrwCandle } from '../../api/exchange/krw/krwRealtime';
import { subscribeBitgetKline } from '../../api/exchange/bitget/klineRealtime';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { useCoinCandles } from './useCoinCandles';

vi.mock('../../api/server/coinRealtime', () => ({
  subscribeCoinCandle: vi.fn(), subscribeBinanceCandle: vi.fn(), subscribeBinanceKline: vi.fn(),
}));
vi.mock('../../api/exchange/krw/krwRealtime', () => ({ subscribeKrwCandle: vi.fn() }));
vi.mock('../../api/exchange/bitget/klineRealtime', () => ({ subscribeBitgetKline: vi.fn() }));

const candle = (close: number): Candle => ({ time: close, open: close - 1, high: close, low: close - 1, close, volume: 1 });
const FALLBACK = [candle(9)];
type Loader = (granularity: string, limit: number, endTime?: string) => Promise<Candle[]>;
type Props = { symbol: string; load: Loader; clear?: boolean; granularity?: string; krw?: boolean; active?: boolean; kline?: boolean };
const callbacks: Array<(ticker: { time: number; open: number; high: number; low: number; close: number; volume: number }) => void> = [];

const getBucketTime = (time: number) => time;
const useSubject = ({ symbol, load, clear = false, granularity = '1h', krw = false, active = true, kline = false }: Props) => useCoinCandles({
  symbol, isBinance: false, isFutures: true,
  timeframe: { granularity, channel: 'candle1H' },
  loadCandles: load, fallbackCandles: FALLBACK,
  getBucketTime, clearOnSymbolChange: clear,
  exchange: krw ? 'UPBIT' : 'BITGET', liveCandle: krw || kline, active,
});

beforeEach(() => {
  vi.useFakeTimers();
  callbacks.length = 0;
  vi.mocked(subscribeCoinCandle).mockImplementation((_symbol, _channel, callback) => {
    callbacks.push(callback);
    return { close: vi.fn() };
  });
  vi.mocked(subscribeKrwCandle).mockReturnValue({ close: vi.fn() });
  vi.mocked(subscribeBitgetKline).mockImplementation((_symbol, _futures, _channel, callback) => {
    callbacks.push(callback);
    return { close: vi.fn() };
  });
});
afterEach(async () => {
  await cleanupRenderHooks();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useCoinCandles request state', () => {
  it.each([3600, 7200])('refresh 도중 WS가 갱신한 %i 봉과 가격을 늦은 REST가 되돌리지 않는다', async (time) => {
    const pending = deferred<Candle[]>();
    const initial = { ...candle(100), time: 3600 };
    const load = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const hook = await renderHook(useSubject, { symbol: 'BTCUSDT', load });
    const refresh = hook.result().refreshCandles();
    await act(async () => callbacks.at(-1)!({ ...initial, time, close: 105, high: 105 }));
    await act(async () => pending.resolve([{ ...initial, close: 101, volume: 20 }]));
    await refresh;
    expect(hook.result().livePrice).toBe(105);
    expect(hook.result().candles.at(-1)).toMatchObject({ time, close: 105 });
    expect(hook.result().openPrice).toBe(hook.result().candles.at(-1)?.open);
    // 티커가 제공하지 않는 캔들 거래량은 REST로 계속 보정한다.
    expect(hook.result().candles.find(c => Number(c.time) === 3600)?.volume).toBe(20);
  });

  it('refresh 도중 가격이 출발값으로 돌아와도 마지막 WS 값을 보존한다', async () => {
    const pending = deferred<Candle[]>();
    const initial = { ...candle(100), time: 3600 };
    const load = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const hook = await renderHook(useSubject, { symbol: 'BTCUSDT', load });
    const refresh = hook.result().refreshCandles();
    await act(async () => {
      callbacks.at(-1)!({ ...initial, close: 99 });
      callbacks.at(-1)!(initial);
      pending.resolve([{ ...initial, close: 101 }]);
    });
    await refresh;
    expect(hook.result()).toMatchObject({ livePrice: 100, candles: [initial] });
  });

  it('kline OHLCV는 보호하고 과거 REST 보정과 다음 refresh는 허용한다', async () => {
    const pending = deferred<Candle[]>();
    const history = { ...candle(90), time: 0 };
    const initial = { ...candle(100), time: 3600 };
    const live = { ...initial, open: 98, low: 98, close: 105, high: 105, volume: 30 };
    const load = vi.fn().mockResolvedValueOnce([history, initial]).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const hook = await renderHook(useSubject, { symbol: 'BTCUSDT', load, kline: true });
    const refresh = hook.result().refreshCandles();
    await act(async () => callbacks.at(-1)!(live));
    await act(async () => pending.resolve([{ ...history, volume: 9 }, { ...initial, volume: 20 }]));
    await refresh;
    expect(hook.result().candles).toEqual([{ ...history, volume: 9 }, live]);
    expect(hook.result().openPrice).toBe(98);
    load.mockResolvedValueOnce([{ ...initial, close: 110, high: 110, volume: 40 }]);
    await act(async () => hook.result().refreshCandles());
    expect(hook.result()).toMatchObject({ livePrice: 110 });
    expect(hook.result().candles.at(-1)).toMatchObject({ close: 110, volume: 40 });
  });

  it('WS보다 새 봉을 포함한 REST 응답은 새 봉과 가격을 함께 반영한다', async () => {
    const pending = deferred<Candle[]>();
    const initial = { ...candle(100), time: 3600 };
    const newer = { ...candle(110), time: 7200 };
    const load = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const hook = await renderHook(useSubject, { symbol: 'BTCUSDT', load });
    const refresh = hook.result().refreshCandles();
    await act(async () => callbacks.at(-1)!({ ...initial, close: 105, high: 105 }));
    await act(async () => pending.resolve([initial, newer]));
    await refresh;
    expect(hook.result()).toMatchObject({ livePrice: 110, openPrice: 109 });
    expect(hook.result().candles.at(-1)).toEqual(newer);
  });

  it('이미 표시한 새 봉보다 오래된 REST 응답은 헤더 가격을 되돌리지 않는다', async () => {
    const initial = { ...candle(100), time: 3600 };
    const load = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([]).mockResolvedValueOnce([initial]);
    const hook = await renderHook(useSubject, { symbol: 'BTCUSDT', load });
    await act(async () => callbacks.at(-1)!({ ...initial, time: 7200, close: 105, high: 105 }));
    await act(async () => hook.result().refreshCandles());
    expect(hook.result().livePrice).toBe(105);
    expect(hook.result().candles.at(-1)).toMatchObject({ time: 7200, close: 105 });
  });

  it('KRW A→B→A 뒤 첫 A의 늦은 거래량 응답을 폐기한다', async () => {
    const pending = deferred<Candle[]>();
    const initial = { ...candle(100), time: 3600 };
    const loadA = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise).mockResolvedValue([initial]);
    const loadB = vi.fn().mockResolvedValue([initial]);
    const hook = await renderHook(useSubject, { symbol: 'KRW-BTC', load: loadA, krw: true });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    await hook.rerender({ symbol: 'KRW-ETH', load: loadB, krw: true });
    await hook.rerender({ symbol: 'KRW-BTC', load: loadA, krw: true });
    await act(async () => pending.resolve([{ ...initial, volume: 999 }]));
    expect(hook.result().candles.at(-1)?.volume).toBe(1);
  });

  it.each(['inactive', 'retry'] as const)('KRW %s 뒤 이전 거래량 요청을 반영하지 않는다', async (transition) => {
    const pending = deferred<Candle[]>();
    const initial = { ...candle(100), time: 3600 };
    const load = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise).mockResolvedValue([initial]);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'KRW-BTC', load, krw: true });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    if (transition === 'inactive') await hook.rerender({ symbol: 'KRW-BTC', load, krw: true, active: false });
    else await act(async () => hook.result().retryCandles());
    await act(async () => pending.resolve([{ ...initial, volume: 999 }]));
    expect(hook.result().candles.at(-1)?.volume).toBe(1);
  });

  it('KRW 거래량 요청은 겹치지 않고 timeout 후 다시 조회한다', async () => {
    const pending = deferred<Candle[]>();
    const initial = { ...candle(100), time: 3600 };
    const load = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise).mockResolvedValue([{ ...initial, volume: 20 }]);
    const hook = await renderHook(useSubject, { symbol: 'KRW-BTC', load, krw: true });
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(load).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(load.mock.calls.length).toBeGreaterThan(3);
    await act(async () => pending.resolve([{ ...initial, volume: 999 }]));
    expect(hook.result().candles.at(-1)?.volume).toBe(20);
    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('KRW refresh 이전에 시작한 poll은 새 REST 거래량을 되돌리지 않는다', async () => {
    const poll = deferred<Candle[]>();
    const refreshResult = deferred<Candle[]>();
    const initial = { ...candle(100), time: 3600 };
    const load = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValueOnce([])
      .mockReturnValueOnce(poll.promise).mockReturnValueOnce(refreshResult.promise);
    const hook = await renderHook(useSubject, { symbol: 'KRW-BTC', load, krw: true });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    const refresh = hook.result().refreshCandles();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(load).toHaveBeenCalledTimes(4);
    await act(async () => refreshResult.resolve([{ ...initial, volume: 20 }]));
    await refresh;
    await act(async () => poll.resolve([{ ...initial, volume: 9 }]));
    expect(hook.result().candles.at(-1)?.volume).toBe(20);
  });

  it('첫 진입은 타이머 대기 없이 요청하고 1Dutc 마지막 open을 재사용한다', async () => {
    const load = vi.fn().mockResolvedValue([candle(10)]);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(
      useSubject,
      { symbol: 'BTCUSDT', load, granularity: '1Dutc' },
    );
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith('1Dutc', 60);
    expect(hook.result()).toMatchObject({ status: 'ready', dailyOpenPrice: 9 });
  });

  it('daily가 멈춰도 main 완료 즉시 ready하고 daily는 같은 세대에서 나중에 보강한다', async () => {
    const daily = deferred<Candle[]>();
    const load = vi.fn().mockResolvedValueOnce([candle(10)]).mockReturnValueOnce(daily.promise);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', load });
    expect(hook.result()).toMatchObject({ status: 'ready', candles: [candle(10)], dailyOpenPrice: null });

    await act(async () => daily.resolve([candle(101)]));
    expect(hook.result().dailyOpenPrice).toBe(100);
  });

  it('main nonempty와 daily를 함께 ready commit하고 daily empty는 null로 교체한다', async () => {
    const main = deferred<Candle[]>();
    const load = vi.fn((granularity: string) => granularity === '1Dutc' ? Promise.resolve([]) : main.promise);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', load });
    expect(hook.result()).toMatchObject({ status: 'loading', requestKey: 'BITGET|F|BTCUSDT|1h' });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => main.resolve([candle(10)]));
    expect(hook.result()).toMatchObject({ status: 'ready', candles: [candle(10)], dailyOpenPrice: null, livePrice: 10 });
    expect(hook.result().candlesKey).toBe(hook.result().requestKey);
  });

  it.each(['empty', 'reject'] as const)('main %s는 old data를 보존하고 error이며 retry가 full load한다', async (failure) => {
    const retryMain = deferred<Candle[]>();
    const load = vi.fn()
      .mockImplementationOnce(() => failure === 'empty' ? Promise.resolve([]) : Promise.reject(new Error('fail')))
      .mockResolvedValueOnce([candle(20)])
      .mockReturnValueOnce(retryMain.promise)
      .mockResolvedValueOnce([candle(40)]);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', load });
    expect(hook.result()).toMatchObject({ status: 'error', candles: [candle(9)], dailyOpenPrice: null });

    await act(async () => hook.result().retryCandles());
    expect(hook.result().status).toBe('loading');
    expect(load).toHaveBeenCalledTimes(4);
    await act(async () => retryMain.resolve([candle(30)]));
    expect(hook.result()).toMatchObject({ status: 'ready', candles: [candle(30)], dailyOpenPrice: 39 });
  });

  it.each(['empty', 'reject'] as const)('A ready 뒤 B main %s면 daily를 포함한 이전 묶음을 유지한다', async (failure) => {
    const loadA = vi.fn().mockResolvedValueOnce([candle(10)]).mockResolvedValueOnce([candle(101)]);
    const loadB = vi.fn()
      .mockImplementationOnce(() => failure === 'empty' ? Promise.resolve([]) : Promise.reject(new Error('fail')))
      .mockResolvedValueOnce([candle(201)]);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'A', load: loadA });
    expect(hook.result().dailyOpenPrice).toBe(100);

    await hook.rerender({ symbol: 'B', load: loadB });
    await act(async () => {});
    expect(hook.result()).toMatchObject({ status: 'error', candles: [candle(10)], dailyOpenPrice: 100 });
  });

  it('15초 deadline은 error가 되고 retry할 수 있다', async () => {
    const stuck = deferred<Candle[]>();
    const load = vi.fn().mockReturnValue(stuck.promise);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', load });
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(hook.result().status).toBe('loading');
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(hook.result().status).toBe('error');
    expect(hook.result().candles).toEqual([candle(9)]);
  });

  it('same-key manual refresh 경합은 마지막 요청만 반영한다', async () => {
    const first = deferred<Candle[]>();
    const second = deferred<Candle[]>();
    const load = vi.fn()
      .mockResolvedValueOnce([candle(10)])
      .mockResolvedValueOnce([candle(20)])
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', load });

    const refresh1 = hook.result().refreshCandles();
    const refresh2 = hook.result().refreshCandles();
    await act(async () => second.resolve([candle(40)]));
    await act(async () => first.resolve([candle(30)]));
    await Promise.all([refresh1, refresh2]);
    expect(hook.result().candles.at(-1)?.close).toBe(40);
  });

  it('A의 hung paging을 B 전환이 해제해 B paging을 허용하고 late/unmount 응답을 버린다', async () => {
    const aPaging = deferred<Candle[]>();
    const bPaging = deferred<Candle[]>();
    const bUnmountPaging = deferred<Candle[]>();
    const loadA = vi.fn()
      .mockResolvedValueOnce([candle(10)])
      .mockResolvedValueOnce([candle(11)])
      .mockReturnValueOnce(aPaging.promise);
    const loadB = vi.fn()
      .mockResolvedValueOnce([candle(20)])
      .mockResolvedValueOnce([candle(21)])
      .mockReturnValueOnce(bPaging.promise)
      .mockReturnValueOnce(bUnmountPaging.promise);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'A', load: loadA });
    await act(async () => hook.result().handleVisibleRangeChange({ logicalRange: { from: 0, to: 10 } }));

    await hook.rerender({ symbol: 'B', load: loadB });
    await act(async () => {});
    await act(async () => hook.result().handleVisibleRangeChange({ logicalRange: { from: 0, to: 10 } }));
    await act(async () => bPaging.resolve([candle(5)]));
    await act(async () => aPaging.resolve([candle(1)]));
    expect(hook.result().candles.map((item) => item.close)).toEqual([5, 20]);

    await act(async () => hook.result().handleVisibleRangeChange({ logicalRange: { from: 0, to: 10 } }));
    await hook.unmount();
    await act(async () => bUnmountPaging.resolve([candle(2)]));
    expect(hook.result().candles.map((item) => item.close)).toEqual([5, 20]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('A→B→A에서 마지막 full load만 반영하고 old WS도 막는다', async () => {
    const a1Main = deferred<Candle[]>(); const a1Day = deferred<Candle[]>();
    const bMain = deferred<Candle[]>(); const bDay = deferred<Candle[]>();
    const a2Main = deferred<Candle[]>(); const a2Day = deferred<Candle[]>();
    const loadA1 = vi.fn().mockReturnValueOnce(a1Main.promise).mockReturnValueOnce(a1Day.promise);
    const loadB = vi.fn().mockReturnValueOnce(bMain.promise).mockReturnValueOnce(bDay.promise);
    const loadA2 = vi.fn().mockReturnValueOnce(a2Main.promise).mockReturnValueOnce(a2Day.promise);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'A', load: loadA1 });
    await hook.rerender({ symbol: 'B', load: loadB });
    await hook.rerender({ symbol: 'A', load: loadA2 });
    await act(async () => { a2Main.resolve([candle(30)]); a2Day.resolve([candle(40)]); });
    expect(hook.result()).toMatchObject({ status: 'ready', candles: [candle(30)] });

    await act(async () => callbacks[0]?.({ time: 30, open: 1, high: 100, low: 1, close: 99, volume: 1 }));
    await act(async () => { a1Main.resolve([candle(10)]); a1Day.resolve([candle(20)]); bMain.resolve([candle(50)]); bDay.resolve([candle(60)]); });
    expect(hook.result()).toMatchObject({ status: 'ready', candles: [candle(30)], dailyOpenPrice: 39 });
  });

  it('StrictMode/unmount 뒤 늦은 full load를 폐기한다', async () => {
    const main = deferred<Candle[]>(); const daily = deferred<Candle[]>();
    const load = vi.fn((granularity: string) => granularity === '1Dutc' ? daily.promise : main.promise);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'A', load }, { strict: true });
    await hook.unmount();
    await act(async () => { main.resolve([candle(1)]); daily.resolve([candle(2)]); });
    expect(hook.result().status).toBe('loading');
    expect(vi.getTimerCount()).toBe(0);
  });
});
