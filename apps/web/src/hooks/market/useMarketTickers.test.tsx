// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinTicker } from '../../shared/types/market';
import type { RealtimeTicker } from '../../api/server/coinRealtime';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import {
  fetchBinanceFuturesTickers, fetchBinanceSpotTickers, fetchCoinFuturesTickers, fetchCoinTickers,
} from '../../api/server/marketApi';
import { fetchBithumbSpotTickers, fetchUpbitSpotTickers } from '../../api/exchange/krw/krwTickers';
import {
  subscribeBinanceFuturesTickers, subscribeBinanceSpotTickers, subscribeBitgetFuturesTickers, subscribeBitgetSpotTickers,
} from '../../api/server/coinRealtime';
import { useMarketTickers } from './useMarketTickers';

vi.mock('../../api/server/marketApi', () => ({
  fetchBinanceFuturesTickers: vi.fn(), fetchBinanceSpotTickers: vi.fn(), fetchCoinFuturesTickers: vi.fn(), fetchCoinTickers: vi.fn(),
}));
vi.mock('../../api/exchange/krw/krwTickers', () => ({ fetchBithumbSpotTickers: vi.fn(), fetchUpbitSpotTickers: vi.fn() }));
vi.mock('../../api/server/coinRealtime', () => ({
  subscribeBinanceFuturesTickers: vi.fn(), subscribeBinanceSpotTickers: vi.fn(), subscribeBitgetFuturesTickers: vi.fn(), subscribeBitgetSpotTickers: vi.fn(),
}));

const ticker = (symbol: string, last: number): CoinTicker => ({
  symbol, baseSymbol: symbol.replace(/USDT|KRW$/, ''), quoteSymbol: symbol.endsWith('KRW') ? 'KRW' : 'USDT', name: symbol,
  last, change: 0, changeRate: 0, volume: 1, tickDecimals: 2,
});
const close = vi.fn();
type Props = { exchangeFilter: 'BINANCE' | 'BITGET' | 'UPBIT' | 'BITHUMB'; productFilter: 'SPOT' | 'FUTURES'; realtimeSymbols: string[]; active?: boolean };

describe('useMarketTickers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    close.mockReset();
    for (const mock of [fetchBinanceFuturesTickers, fetchBinanceSpotTickers, fetchCoinFuturesTickers, fetchCoinTickers, fetchBithumbSpotTickers, fetchUpbitSpotTickers]) vi.mocked(mock).mockReset();
    for (const mock of [subscribeBinanceFuturesTickers, subscribeBinanceSpotTickers, subscribeBitgetFuturesTickers, subscribeBitgetSpotTickers]) vi.mocked(mock).mockReset().mockReturnValue({ close });
  });

  afterEach(async () => {
    await cleanupRenderHooks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('query 전환 중 이전 목록을 유지하고 ABA의 늦은 REST 응답을 버린다', async () => {
    const first = deferred<CoinTicker[]>();
    const middle = deferred<CoinTicker[]>();
    const current = deferred<CoinTicker[]>();
    vi.mocked(fetchBinanceFuturesTickers).mockReturnValueOnce(first.promise).mockReturnValueOnce(current.promise);
    vi.mocked(fetchCoinFuturesTickers).mockReturnValueOnce(middle.promise);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'BINANCE', productFilter: 'FUTURES', realtimeSymbols: [] });
    await act(async () => first.resolve([ticker('BTCUSDT', 1)]));

    await hook.rerender({ exchangeFilter: 'BITGET', productFilter: 'FUTURES', realtimeSymbols: [] });
    expect(hook.result()).toMatchObject({ allTickers: [{ symbol: 'BTCUSDT' }], isTickerLoading: true });
    await hook.rerender({ exchangeFilter: 'BINANCE', productFilter: 'FUTURES', realtimeSymbols: [] });
    await act(async () => current.resolve([ticker('ETHUSDT', 3)]));
    await act(async () => middle.resolve([ticker('XRPUSDT', 2)]));

    expect(hook.result()).toMatchObject({ allTickers: [{ symbol: 'ETHUSDT' }], sortSnapshot: [{ symbol: 'ETHUSDT' }], isTickerLoading: false });
  });

  it('WS 갱신은 800ms에 flush하고 정렬 seed는 바꾸지 않으며 비활성화하면 구독과 timer를 닫는다', async () => {
    let onTicker: ((live: RealtimeTicker) => void) | undefined;
    vi.mocked(fetchBinanceSpotTickers).mockResolvedValue([ticker('BTCUSDT', 1)]);
    vi.mocked(subscribeBinanceSpotTickers).mockImplementation((_symbols, callback) => { onTicker = callback; return { close }; });
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: true });
    await act(async () => {});
    act(() => onTicker?.({ symbol: 'BTCUSDT', price: 2, changeRate: 0.1 }));
    expect(hook.result().allTickers[0].last).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(hook.result().allTickers[0].last).toBe(2);
    expect(hook.result().sortSnapshot[0].last).toBe(1);

    await hook.rerender({ exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: false });
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('A→B→A 뒤 늦게 호출된 첫 A WS callback을 새 A 목록에 반영하지 않는다', async () => {
    let oldCallback: ((live: RealtimeTicker) => void) | undefined;
    vi.mocked(fetchBinanceSpotTickers).mockResolvedValueOnce([ticker('BTCUSDT', 1)]).mockResolvedValueOnce([ticker('BTCUSDT', 10)]);
    vi.mocked(fetchCoinTickers).mockResolvedValue([ticker('BTCUSDT', 5)]);
    vi.mocked(subscribeBinanceSpotTickers).mockImplementationOnce((_symbols, callback) => { oldCallback = callback; return { close }; });
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: true });
    await act(async () => {});
    await hook.rerender({ exchangeFilter: 'BITGET', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: true });
    await act(async () => {});
    await hook.rerender({ exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: true });
    await act(async () => {});

    act(() => oldCallback?.({ symbol: 'BTCUSDT', price: 99, changeRate: 0 }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(hook.result().allTickers[0].last).toBe(10);
  });

  it('새 query REST seed 전 WS는 이전 query 표시 목록에 섞지 않고 폐기한다', async () => {
    let nextCallback: ((live: RealtimeTicker) => void) | undefined;
    const nextSeed = deferred<CoinTicker[]>();
    vi.mocked(fetchBinanceSpotTickers).mockResolvedValue([ticker('BTCUSDT', 1)]);
    vi.mocked(fetchCoinTickers).mockReturnValue(nextSeed.promise);
    vi.mocked(subscribeBitgetSpotTickers).mockImplementation((_symbols, callback) => { nextCallback = callback; return { close }; });
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: true });
    await act(async () => {});
    await hook.rerender({ exchangeFilter: 'BITGET', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: true });

    act(() => nextCallback?.({ symbol: 'BTCUSDT', price: 99, changeRate: 0 }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(hook.result()).toMatchObject({ allTickers: [{ last: 1 }], isTickerLoading: true });
    await act(async () => nextSeed.resolve([ticker('BTCUSDT', 10)]));
    expect(hook.result()).toMatchObject({ allTickers: [{ last: 10 }], isTickerLoading: false });
  });

  it('inactive여도 초기 REST는 조회하지만 WS·flush는 시작하지 않는다', async () => {
    vi.mocked(fetchCoinTickers).mockResolvedValue([ticker('BTCUSDT', 1)]);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'BITGET', productFilter: 'SPOT', realtimeSymbols: ['BTCUSDT'], active: false });
    await act(async () => {});

    expect(fetchCoinTickers).toHaveBeenCalledOnce();
    expect(subscribeBitgetSpotTickers).not.toHaveBeenCalled();
    expect(hook.result().isTickerLoading).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('KRW 3000ms polling의 진행 중 응답을 비활성화 cleanup 뒤 버린다', async () => {
    const poll = deferred<CoinTicker[]>();
    vi.mocked(fetchUpbitSpotTickers).mockResolvedValueOnce([ticker('BTCKRW', 1)]).mockReturnValueOnce(poll.promise);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await hook.rerender({ exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: false });
    await act(async () => poll.resolve([ticker('ETHKRW', 2)]));

    expect(hook.result().allTickers[0].symbol).toBe('BTCKRW');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('KRW polling은 진행 중 요청이 끝난 뒤 다음 timer를 예약해 겹치지 않는다', async () => {
    const firstPoll = deferred<CoinTicker[]>();
    vi.mocked(fetchUpbitSpotTickers).mockResolvedValueOnce([ticker('BTCKRW', 1)]).mockReturnValueOnce(firstPoll.promise).mockResolvedValueOnce([ticker('BTCKRW', 3)]);
    await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => {});

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(fetchUpbitSpotTickers).toHaveBeenCalledTimes(2);

    await act(async () => firstPoll.resolve([ticker('BTCKRW', 2)]));
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(fetchUpbitSpotTickers).toHaveBeenCalledTimes(3);
  });

  it('KRW 최초 실패 뒤 polling 성공이 목록·정렬 seed·loading을 복구한다', async () => {
    vi.mocked(fetchUpbitSpotTickers).mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce([ticker('BTCKRW', 2)]);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => {});
    expect(hook.result()).toMatchObject({ allTickers: [], sortSnapshot: [], isTickerLoading: false });

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(hook.result()).toMatchObject({
      allTickers: [{ symbol: 'BTCKRW' }], sortSnapshot: [{ symbol: 'BTCKRW' }], isTickerLoading: false,
    });
  });

  it('KRW 최초 empty 뒤 polling 성공이 목록·정렬 seed를 복구한다', async () => {
    vi.mocked(fetchUpbitSpotTickers).mockResolvedValueOnce([]).mockResolvedValueOnce([ticker('BTCKRW', 2)]);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => {});
    expect(hook.result()).toMatchObject({ allTickers: [], sortSnapshot: [], isTickerLoading: false });

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(hook.result()).toMatchObject({
      allTickers: [{ symbol: 'BTCKRW' }], sortSnapshot: [{ symbol: 'BTCKRW' }], isTickerLoading: false,
    });
  });

  it('query 전환은 이전 KRW 요청 signal을 abort하고 늦은 응답을 버린다', async () => {
    const oldRequest = deferred<CoinTicker[]>();
    vi.mocked(fetchUpbitSpotTickers).mockReturnValueOnce(oldRequest.promise);
    vi.mocked(fetchBithumbSpotTickers).mockResolvedValueOnce([ticker('ETHKRW', 2)]);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    const oldSignal = vi.mocked(fetchUpbitSpotTickers).mock.calls[0][0];

    await hook.rerender({ exchangeFilter: 'BITHUMB', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => {});
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => oldRequest.resolve([ticker('BTCKRW', 1)]));
    expect(hook.result().allTickers[0].symbol).toBe('ETHKRW');
  });

  it('초기 요청 중 inactive 전환으로 취소돼도 다시 active면 같은 query를 재조회한다', async () => {
    const first = deferred<CoinTicker[]>();
    vi.mocked(fetchBinanceSpotTickers).mockReturnValueOnce(first.promise).mockResolvedValueOnce([ticker('BTCUSDT', 2)]);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: [], active: true });

    await hook.rerender({ exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: [], active: false });
    await hook.rerender({ exchangeFilter: 'BINANCE', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => {});

    expect(fetchBinanceSpotTickers).toHaveBeenCalledTimes(2);
    expect(hook.result()).toMatchObject({ allTickers: [{ last: 2 }], isTickerLoading: false });
  });

  it('KRW 비활성 재진입 polling 성공은 최초 정렬 snapshot을 바꾸지 않는다', async () => {
    vi.mocked(fetchUpbitSpotTickers).mockResolvedValueOnce([ticker('BTCKRW', 1)]).mockResolvedValueOnce([ticker('ETHKRW', 2)]);
    const hook = await renderHook((props: Props) => useMarketTickers(props), { exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => {});
    await hook.rerender({ exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: false });
    await hook.rerender({ exchangeFilter: 'UPBIT', productFilter: 'SPOT', realtimeSymbols: [], active: true });
    await act(async () => vi.advanceTimersByTimeAsync(3000));

    expect(hook.result()).toMatchObject({ allTickers: [{ symbol: 'ETHKRW' }], sortSnapshot: [{ symbol: 'BTCKRW' }] });
  });
});
