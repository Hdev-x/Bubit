import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBithumbCandles, fetchBithumbSpotTickers, fetchUpbitCandles, fetchUpbitSpotTickers } from './krwTickers';

afterEach(() => vi.unstubAllGlobals());

describe('KRW market API', () => {
  it.each([
    [fetchUpbitCandles, '/coin/api/upbit/candles?symbol=BTCKRW&granularity=1h&count=1200'],
    [fetchBithumbCandles, '/coin/api/bithumb/candles?symbol=BTCKRW&granularity=1h&count=1200'],
  ] as const)('candles 요청량을 1200으로 보존하고 그 이상만 제한한다', async (load, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    await load('BTCKRW', '1h', 1500);

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
  });

  it.each([
    [fetchUpbitSpotTickers, '/coin/api/upbit/tickers'],
    [fetchBithumbSpotTickers, '/coin/api/bithumb/tickers'],
  ] as const)('ticker 요청에 caller AbortSignal과 timeout을 결합한다', async (load, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await load(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
