import { afterEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { create: () => ({ get: request, interceptors: { request: { use: vi.fn() } } }) }, AxiosHeaders: { from: vi.fn() } }));
vi.mock('../client', () => ({ getToken: () => null }));
import { formatPriceWithDecimals } from '../../shared/utils/coinFormatters';
import { fetchBinanceSpotTickers, fetchCoinFuturesTickers } from './marketApi';
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); });

describe('ticker request options', () => {
  it('Binance REST 문자열과 WS 숫자는 같은 유효 자릿수를 보존한다', async () => {
    const prices = ['362.85000000', 362.85, '0.00248400', 0.002484, '0.0000000123', 1.23e-8];
    request.mockResolvedValue({ data: prices.map((lastPrice, i) => ({ symbol: `COIN${i}USDT`, lastPrice })) });
    const tickers = await fetchBinanceSpotTickers();
    expect(tickers.map(t => t.tickDecimals)).toEqual([2, 2, 6, 6, 10, 10]);
    expect(tickers.map(t => formatPriceWithDecimals(t.last, t.tickDecimals)))
      .toEqual(['362.85', '362.85', '0.002484', '0.002484', '0.0000000123', '0.0000000123']);
  });

  it('USDT 요청은 USDC 완료를 기다리지 않고 기본 호출의 두 시장 지원은 유지한다', async () => {
    request.mockResolvedValue({ data: [] });
    await fetchCoinFuturesTickers({ quote: 'USDT', throwOnError: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/coin/api/futures/tickers', { params: { productType: 'USDT-FUTURES' } });
    request.mockClear();
    await fetchCoinFuturesTickers();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith('/coin/api/futures/tickers', { params: { productType: 'USDC-FUTURES' } });
  });

  it('목록 소비자는 실패를 구분하고 기존 소비자의 빈 배열 폴백은 유지한다', async () => {
    const error = new Error('offline'); request.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(fetchBinanceSpotTickers({ throwOnError: true })).rejects.toBe(error);
    await expect(fetchBinanceSpotTickers()).resolves.toEqual([]);
  });
});
