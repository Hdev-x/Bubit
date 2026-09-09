// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBinanceFunding, fetchFundingRate, type FundingInfo } from '../../api/exchange/bitget/bitgetFunding';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { useFundingRate } from './useFundingRate';

vi.mock('../../api/exchange/bitget/bitgetFunding', () => ({
  fetchFundingRate: vi.fn(),
  fetchBinanceFunding: vi.fn(),
}));

const funding = (rate: number, nextUpdate = 10_000): FundingInfo => ({ rate, nextUpdate, intervalHours: 8 });
type Props = { symbol: string; enabled: boolean; exchange: 'BITGET' | 'BINANCE' };

describe('useFundingRate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(fetchFundingRate).mockReset();
    vi.mocked(fetchBinanceFunding).mockReset();
  });
  afterEach(async () => {
    await cleanupRenderHooks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('새 조회 전에는 이전 값을 유지하고 늦은 응답은 버린다', async () => {
    vi.mocked(fetchFundingRate).mockResolvedValueOnce(funding(0.001));
    const next = deferred<FundingInfo | null>();
    vi.mocked(fetchBinanceFunding).mockReturnValueOnce(next.promise);
    const hook = await renderHook(
      ({ symbol, enabled, exchange }: Props) => useFundingRate(symbol, enabled, exchange),
      { symbol: 'BTCUSDT', enabled: true, exchange: 'BITGET' },
    );
    await act(async () => {});
    expect(hook.result()).toContain('0.1000%');

    await hook.rerender({ symbol: 'ETHUSDT', enabled: true, exchange: 'BINANCE' });
    expect(hook.result()).toContain('0.1000%');
    await act(async () => next.resolve(funding(0.002)));
    expect(hook.result()).toContain('0.2000%');
  });

  it('BTC→ETH→BTC ABA에서 마지막 요청만 반영한다', async () => {
    const btc1 = deferred<FundingInfo | null>();
    const eth = deferred<FundingInfo | null>();
    const btc2 = deferred<FundingInfo | null>();
    vi.mocked(fetchFundingRate)
      .mockReturnValueOnce(btc1.promise)
      .mockReturnValueOnce(eth.promise)
      .mockReturnValueOnce(btc2.promise);
    const hook = await renderHook(
      ({ symbol, enabled, exchange }: Props) => useFundingRate(symbol, enabled, exchange),
      { symbol: 'BTCUSDT', enabled: true, exchange: 'BITGET' },
    );
    await hook.rerender({ symbol: 'ETHUSDT', enabled: true, exchange: 'BITGET' });
    await hook.rerender({ symbol: 'BTCUSDT', enabled: true, exchange: 'BITGET' });
    await act(async () => btc2.resolve(funding(0.003)));
    await act(async () => btc1.resolve(funding(0.001)));
    await act(async () => eth.resolve(funding(0.002)));
    expect(hook.result()).toContain('0.3000%');
  });

  it('응답 시각을 원자 반영하고 1초 countdown·60초 조회 주기를 유지한다', async () => {
    vi.mocked(fetchFundingRate).mockResolvedValue(funding(0.001, 10_000));
    const hook = await renderHook(
      ({ symbol, enabled, exchange }: Props) => useFundingRate(symbol, enabled, exchange),
      { symbol: 'BTCUSDT', enabled: true, exchange: 'BITGET' },
    );
    await act(async () => {});
    expect(hook.result()).toContain('00:00:10');
    expect(vi.getTimerCount()).toBe(2);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(hook.result()).toContain('00:00:09');
    await act(async () => vi.advanceTimersByTimeAsync(59_000));
    expect(fetchFundingRate).toHaveBeenCalledTimes(2);
  });

  it('disabled면 즉시 빈 값으로 초기화하고 cleanup 뒤 timer가 없다', async () => {
    vi.mocked(fetchFundingRate).mockResolvedValueOnce(funding(0.001));
    const hook = await renderHook(
      ({ symbol, enabled, exchange }: Props) => useFundingRate(symbol, enabled, exchange),
      { symbol: 'BTCUSDT', enabled: true, exchange: 'BITGET' },
    );
    await act(async () => {});
    await hook.rerender({ symbol: 'BTCUSDT', enabled: false, exchange: 'BITGET' });
    expect(hook.result()).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
