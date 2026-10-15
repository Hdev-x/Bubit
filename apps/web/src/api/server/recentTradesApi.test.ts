import { afterEach, expect, it, vi } from 'vitest';
import { fetchRecentTrades } from './recentTradesApi';

afterEach(() => vi.unstubAllGlobals());

it('잘못된 숫자와 방향을 제외하고 체결 ID 문자열을 보존한다', async () => {
  const trade = { id: '9007199254740999', price: 100, size: 1, side: 'sell', time: 1700000000000 };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    trades: [trade, { ...trade, id: 'bad-price', price: 0 }, { ...trade, id: 'bad-time', time: 9e15 }, { ...trade, id: 'bad-side', side: 'unknown' }],
    stale: true,
  }) });
  vi.stubGlobal('fetch', fetchMock);
  expect(await fetchRecentTrades('BITGET', 'BTCUSDT', true, new AbortController().signal))
    .toEqual({ trades: [trade], stale: true });
  expect(fetchMock.mock.calls[0][0]).toBe('/coin/api/recent-trades?exchange=BITGET&symbol=BTCUSDT&futures=true');
});

it('HTTP 오류와 잘못된 응답을 정상적인 빈 체결로 취급하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ trades: [] }) }));
  const signal = new AbortController().signal;
  await expect(fetchRecentTrades('BINANCE', 'BTCUSDT', false, signal)).rejects.toThrow();
  await expect(fetchRecentTrades('BINANCE', 'BTCUSDT', false, signal)).rejects.toThrow();
});
