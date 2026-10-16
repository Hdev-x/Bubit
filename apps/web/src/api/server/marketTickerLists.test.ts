import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinTicker } from '../../shared/types/market';
const mocks = vi.hoisted(() => ({ futures: vi.fn(), spot: vi.fn() }));
vi.mock('./marketApi', () => ({ fetchBinanceFuturesTickers: mocks.futures, fetchBinanceSpotTickers: mocks.spot, fetchCoinTickers: vi.fn(), fetchCoinFuturesTickers: vi.fn() }));
const ticker: CoinTicker = { symbol: 'BTCUSDT', baseSymbol: 'BTC', quoteSymbol: 'USDT', name: 'BTC', last: 1, change: 0, changeRate: 0, volume: 1, tickDecimals: 2 };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
let cache: typeof import('./marketTickerLists');
beforeEach(async () => { vi.resetModules(); vi.resetAllMocks(); cache = await import('./marketTickerLists'); });

describe('ticker list cache', () => {
  it('같은 시장의 진행 중 요청과 최근 결과를 공유하고 현물·선물을 분리한다', async () => {
    const slow = deferred<CoinTicker[]>(); mocks.futures.mockReturnValue(slow.promise); mocks.spot.mockResolvedValue([{ ...ticker, last: 7 }]);
    const first = cache.refreshTickerList('BINANCE|futures');
    expect(cache.refreshTickerList('BINANCE|futures')).toBe(first);
    await cache.refreshTickerList('BINANCE|spot');
    expect(cache.getTickerLists()['BINANCE|spot']?.tickers[0].last).toBe(7);
    expect(cache.getTickerLists()['BINANCE|futures']?.status).toBe('loading');
    slow.resolve([ticker]); await first;
    await cache.refreshTickerList('BINANCE|futures');
    expect(mocks.futures).toHaveBeenCalledTimes(1);
    expect(cache.getTickerLists()['BINANCE|futures']?.tickers[0].last).toBe(1);
  });

  it('실패와 정상 빈 결과를 구분하고 갱신 실패·빈 응답은 기존 목록을 보존한다', async () => {
    mocks.spot.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]).mockResolvedValueOnce([ticker]).mockResolvedValueOnce([]);
    await cache.refreshTickerList('BINANCE|spot');
    expect(cache.getTickerLists()['BINANCE|spot']?.status).toBe('error');
    await cache.refreshTickerList('BINANCE|spot', true);
    expect(cache.getTickerLists()['BINANCE|spot']).toMatchObject({ status: 'ready', tickers: [] });
    await cache.refreshTickerList('BINANCE|spot', true);
    await cache.refreshTickerList('BINANCE|spot', true);
    expect(cache.getTickerLists()['BINANCE|spot']).toMatchObject({ status: 'error', tickers: [ticker] });
  });
});
