import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHeaderTicker } from './headerTicker';

afterEach(() => vi.unstubAllGlobals());

describe('fetchHeaderTicker Binance routing', () => {
  it.each([
    [false, '/coin/api/binance/spot/ticker?symbol=BTCUSDT'],
    [true, '/coin/api/binance/futures/ticker?symbol=BTCUSDT'],
  ])('서버 단건 proxy를 사용하고 raw 24h ticker를 정규화한다', async (isFutures, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ lastPrice: '101', highPrice: '110', lowPrice: '90', volume: '12', quoteVolume: '1200', openPrice: '100' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHeaderTicker('BINANCE', 'BTCUSDT', isFutures)).resolves.toEqual({
      last: 101, high24h: 110, low24h: 90, baseVolume: 12, quoteVolume: 1200, openUtc: 100,
    });
    expect(fetchMock).toHaveBeenCalledWith(expectedUrl);
  });
});
