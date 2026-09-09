// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../../shared/types/market';
import { fetchBinanceCandles, fetchCoinCandles } from '../../api/server/marketApi';
import { fetchBithumbCandles, fetchUpbitCandles } from '../../api/exchange/krw/krwTickers';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { useCandleLoader } from './useCandleLoader';

vi.mock('../../api/server/marketApi', () => ({ fetchBinanceCandles: vi.fn(), fetchCoinCandles: vi.fn() }));
vi.mock('../../api/exchange/krw/krwTickers', () => ({ fetchUpbitCandles: vi.fn(), fetchBithumbCandles: vi.fn() }));

const candle = (close: number): Candle => ({ time: close, open: close, high: close, low: close, close, volume: 1 });

beforeEach(() => {
  vi.mocked(fetchBinanceCandles).mockReset();
  vi.mocked(fetchCoinCandles).mockReset();
  vi.mocked(fetchUpbitCandles).mockReset();
  vi.mocked(fetchBithumbCandles).mockReset();
});
afterEach(async () => {
  await cleanupRenderHooks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('useCandleLoader in-flight sharing', () => {
  it('동시 hook 소비자의 완전히 같은 요청은 Promise와 API 호출을 공유한다', async () => {
    const pending = deferred<Candle[]>();
    vi.mocked(fetchCoinCandles).mockReturnValueOnce(pending.promise);
    const hook = await renderHook(
      () => [
        useCandleLoader({ symbol: 'BTCUSDT', productType: 'USDT-FUTURES', exchange: 'BITGET' }),
        useCandleLoader({ symbol: 'BTCUSDT', productType: 'USDT-FUTURES', exchange: 'BITGET' }),
      ] as const,
      undefined,
    );

    const first = hook.result()[0]('1h', 300, '123');
    const second = hook.result()[1]('1h', 300, '123');
    expect(first).toBe(second);
    await act(async () => pending.resolve([candle(1)]));
    await expect(first).resolves.toEqual([candle(1)]);
    expect(fetchCoinCandles).toHaveBeenCalledOnce();
    expect(fetchCoinCandles).toHaveBeenCalledWith('BTCUSDT', '1h', 300, '123', 'USDT-FUTURES');
  });

  it('StrictMode의 즉시 cleanup/remount는 진행 중인 동일 요청을 공유한다', async () => {
    const pending = deferred<Candle[]>();
    vi.mocked(fetchCoinCandles).mockReturnValueOnce(pending.promise).mockResolvedValueOnce([candle(2)]);

    function useStrictConsumer() {
      const loadCandles = useCandleLoader({ symbol: 'BTCUSDT', exchange: 'BITGET' });
      useEffect(() => {
        void loadCandles('1h', 100);
      }, [loadCandles]);
      return loadCandles;
    }

    const hook = await renderHook(useStrictConsumer, undefined, { strict: true });
    expect(fetchCoinCandles).toHaveBeenCalledOnce();

    await act(async () => pending.resolve([candle(1)]));
    await expect(hook.result()('1h', 100)).resolves.toEqual([candle(2)]);
    expect(fetchCoinCandles).toHaveBeenCalledTimes(2);
  });

  it('exchange/product/symbol/granularity/limit/endTime 중 하나라도 다르면 공유하지 않는다', async () => {
    vi.mocked(fetchCoinCandles).mockResolvedValue([]);
    vi.mocked(fetchBinanceCandles).mockResolvedValue([]);
    const hook = await renderHook(
      () => ({
        futures: useCandleLoader({ symbol: 'BTCUSDT', productType: 'USDT-FUTURES', exchange: 'BITGET' }),
        binance: useCandleLoader({ symbol: 'BTCUSDT', productType: 'USDT-FUTURES', exchange: 'BINANCE' }),
        spot: useCandleLoader({ symbol: 'BTCUSDT', exchange: 'BITGET' }),
        eth: useCandleLoader({ symbol: 'ETHUSDT', productType: 'USDT-FUTURES', exchange: 'BITGET' }),
      }),
      undefined,
    );
    const requests = [
      hook.result().futures('1h', 100),
      hook.result().binance('1h', 100),
      hook.result().spot('1h', 100),
      hook.result().eth('1h', 100),
      hook.result().futures('4h', 100),
      hook.result().futures('1h', 200),
      hook.result().futures('1h', 100, '1'),
    ];
    expect(new Set(requests)).toHaveLength(7);
    await Promise.all(requests);
    expect(fetchCoinCandles).toHaveBeenCalledTimes(6);
    expect(fetchBinanceCandles).toHaveBeenCalledWith('BTCUSDT', '1h', 100, undefined, true);
  });

  it.each(['success', 'empty', 'failure'] as const)('%s 완료 뒤 같은 요청은 새 API 호출을 만든다', async (outcome) => {
    const api = vi.mocked(fetchCoinCandles);
    if (outcome === 'failure') api.mockRejectedValueOnce(new Error('fail'));
    else api.mockResolvedValueOnce(outcome === 'empty' ? [] : [candle(1)]);
    api.mockResolvedValueOnce([candle(2)]);
    const hook = await renderHook(
      () => useCandleLoader({ symbol: 'BTCUSDT', exchange: 'BITGET' }),
      undefined,
    );

    await hook.result()('1h', 100).catch(() => []);
    await expect(hook.result()('1h', 100)).resolves.toEqual([candle(2)]);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('15초 timeout 뒤 hung physical 요청을 공유 목록에서 제거한다', async () => {
    vi.useFakeTimers();
    const hung = deferred<Candle[]>();
    vi.mocked(fetchUpbitCandles).mockReturnValueOnce(hung.promise).mockResolvedValueOnce([candle(2)]);
    const hook = await renderHook(
      () => useCandleLoader({ symbol: 'BTCKRW', exchange: 'UPBIT' }),
      undefined,
    );
    const first = hook.result()('1h', 100);
    const rejected = expect(first).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    await expect(hook.result()('1h', 100)).resolves.toEqual([candle(2)]);
    expect(fetchUpbitCandles).toHaveBeenCalledTimes(2);
    hung.resolve([candle(1)]);
  });

  it('각 exchange API에 기존 인자를 그대로 전달한다', async () => {
    vi.mocked(fetchBinanceCandles).mockResolvedValue([]);
    vi.mocked(fetchUpbitCandles).mockResolvedValue([]);
    vi.mocked(fetchBithumbCandles).mockResolvedValue([]);
    const hook = await renderHook(
      () => ({
        binance: useCandleLoader({ symbol: 'BTCUSDT', productType: 'USDT-FUTURES', exchange: 'BINANCE' }),
        upbit: useCandleLoader({ symbol: 'BTCKRW', exchange: 'UPBIT' }),
        bithumb: useCandleLoader({ symbol: 'ETHKRW', exchange: 'BITHUMB' }),
      }),
      undefined,
    );
    await Promise.all([
      hook.result().binance('1Dutc', 2, '3'),
      hook.result().upbit('1h', 100, '4'),
      hook.result().bithumb('4h', 200, '5'),
    ]);
    expect(fetchBinanceCandles).toHaveBeenCalledWith('BTCUSDT', '1Dutc', 2, '3', true);
    expect(fetchUpbitCandles).toHaveBeenCalledWith('BTCKRW', '1h', 100, '4');
    expect(fetchBithumbCandles).toHaveBeenCalledWith('ETHKRW', '4h', 200, '5');
  });
});
