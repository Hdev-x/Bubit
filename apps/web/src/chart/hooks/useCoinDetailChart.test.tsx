// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import type { Candle } from '../../shared/types/market';
import { useCoinDetailChart } from './useCoinDetailChart';

const api = vi.hoisted(() => ({ bitget: vi.fn(), binance: vi.fn(), upbit: vi.fn(), bithumb: vi.fn() }));
vi.mock('../../api/server/marketApi', () => ({ fetchCoinCandles: api.bitget, fetchBinanceCandles: api.binance }));
vi.mock('../../api/exchange/krw/krwTickers', () => ({ fetchUpbitCandles: api.upbit, fetchBithumbCandles: api.bithumb }));
const candle = (close: number): Candle => ({ time: 1, open: close, high: close, low: close, close, volume: 1 });
const base: Parameters<typeof useCoinDetailChart>[0] = { detailOpen: true, selectedSymbol: 'BTCUSDT', exchangeFilter: 'BITGET', productFilter: 'FUTURES' };
afterEach(async () => { await cleanupRenderHooks(); vi.clearAllMocks(); });

describe('useCoinDetailChart', () => {
  it('전환·재open에서 비우고 늦은 ABA 응답과 실패를 버리며 닫을 때 데이터는 유지한다', async () => {
    const a1 = deferred<Candle[]>(); const b = deferred<Candle[]>(); const a2 = deferred<Candle[]>();
    api.bitget.mockReturnValueOnce(a1.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(a2.promise);
    const hook = await renderHook(useCoinDetailChart, base);
    await hook.rerender({ ...base, selectedSymbol: 'ETHUSDT' });
    await hook.rerender(base);
    await act(async () => a2.resolve([candle(3)]));
    await act(async () => { b.resolve([candle(2)]); a1.resolve([candle(1)]); });
    expect(hook.result().miniCandles[0].close).toBe(3);
    await hook.rerender({ ...base, detailOpen: false });
    expect(hook.result().miniCandles[0].close).toBe(3);
    api.bitget.mockRejectedValueOnce(new Error('failed'));
    await hook.rerender(base); await act(async () => {});
    expect(hook.result().miniCandles).toEqual([]);
  });

  it('같은 period 선택도 명시적으로 비우며 type은 유지하고 1W reset한다', async () => {
    api.bitget.mockResolvedValue([candle(1)]);
    const hook = await renderHook(useCoinDetailChart, base); await act(async () => {});
    const callsBeforeSamePeriod = api.bitget.mock.calls.length;
    act(() => hook.result().toggleChartType());
    act(() => hook.result().selectChartPeriod('1W'));
    expect(hook.result().miniCandles).toEqual([]);
    expect(api.bitget).toHaveBeenCalledTimes(callsBeforeSamePeriod);
    expect(hook.result().chartType).toBe('line');
    act(() => hook.result().selectChartPeriod('4H'));
    act(() => hook.result().resetDetailChart());
    expect(hook.result().chartPeriod).toBe('1W');
    expect(hook.result().chartType).toBe('line');
  });

  it('exchange-only와 product-only 변경은 정확한 loader 인자로 새 조회한다', async () => {
    api.bitget.mockResolvedValue([]); api.binance.mockResolvedValue([]);
    const hook = await renderHook(useCoinDetailChart, base); await act(async () => {});
    expect(api.bitget).toHaveBeenLastCalledWith('BTCUSDT', '1Wutc', 90, undefined, 'USDT-FUTURES');
    await hook.rerender({ ...base, exchangeFilter: 'BINANCE' }); await act(async () => {});
    expect(api.binance).toHaveBeenLastCalledWith('BTCUSDT', '1Wutc', 120, undefined, true);
    await hook.rerender({ ...base, exchangeFilter: 'BINANCE', productFilter: 'SPOT' }); await act(async () => {});
    expect(api.binance).toHaveBeenLastCalledWith('BTCUSDT', '1Wutc', 120, undefined, false);
  });

  it('KRW 거래소는 Bitget fallback 없이 각 현물 loader를 사용한다', async () => {
    api.upbit.mockResolvedValue([]); api.bithumb.mockResolvedValue([]);
    const hook = await renderHook(useCoinDetailChart, { ...base, selectedSymbol: 'BTCKRW', exchangeFilter: 'UPBIT', productFilter: 'SPOT' });
    await act(async () => {});
    expect(hook.result().chartExchange).toBe('UPBIT');
    expect(hook.result().chartProductType).toBeUndefined();
    expect(api.upbit).toHaveBeenLastCalledWith('BTCKRW', '1Wutc', 90);
    expect(api.bitget).not.toHaveBeenCalled();
    await hook.rerender({ ...base, selectedSymbol: 'ETHKRW', exchangeFilter: 'BITHUMB', productFilter: 'SPOT' });
    await act(async () => {});
    expect(api.bithumb).toHaveBeenLastCalledWith('ETHKRW', '1Wutc', 90);
  });

  it('StrictMode 첫 요청과 unmount 뒤 늦은 응답을 폐기한다', async () => {
    const first = deferred<Candle[]>(); const second = deferred<Candle[]>();
    api.bitget.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = await renderHook(useCoinDetailChart, base, { strict: true });
    await act(async () => second.resolve([candle(2)]));
    await act(async () => first.resolve([candle(1)]));
    expect(hook.result().miniCandles[0].close).toBe(2);
    await hook.unmount();
  });
});
