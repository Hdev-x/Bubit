import { afterEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { create: () => ({ get: request, interceptors: { request: { use: vi.fn() } } }) }, AxiosHeaders: { from: vi.fn() } }));
vi.mock('../client', () => ({ getToken: () => null }));
import { fetchBinanceSpotTickers, fetchCoinFuturesTickers } from './marketApi';
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); });

describe('ticker request options', () => {
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
