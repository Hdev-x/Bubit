// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import type { CoinTicker } from '../../../shared/types/market';
const mocks = vi.hoisted(() => ({ spot: vi.fn(), futures: vi.fn(), bitget: vi.fn(), subscribe: vi.fn(), precision: new Map<string, number>() }));
vi.mock('../../../api/server/marketApi', () => ({
  fetchBinanceSpotTickers: mocks.spot, fetchBinanceFuturesTickers: mocks.futures,
  fetchCoinFuturesTickers: mocks.bitget, fetchCoinTickers: vi.fn(), fetchCoinLogos: () => Promise.resolve({}),
}));
vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ precisionMap: mocks.precision }) }));
vi.mock('../../../api/server/coinRealtime', () => ({
  subscribeBitgetSpotTickers: mocks.subscribe, subscribeBitgetFuturesTickers: mocks.subscribe,
  subscribeBinanceSpotTickers: mocks.subscribe, subscribeBinanceFuturesTickers: mocks.subscribe,
}));
vi.mock('../../../api/exchange/krw/krwRealtime', () => ({ subscribeKrwTickers: mocks.subscribe }));
const ticker = (symbol: string): CoinTicker => ({ symbol, baseSymbol: symbol.replace('USDT', ''), quoteSymbol: 'USDT', name: symbol, last: 1, change: 0, changeRate: 0.01, volume: 10, tickDecimals: 2 });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
let FavoritesPanel: typeof import('./FavoritesPanel').FavoritesPanel;
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks(); mocks.precision.clear();
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) }); mocks.subscribe.mockReturnValue({ close: vi.fn() });
  ({ FavoritesPanel } = await import('./FavoritesPanel'));
});
afterEach(async () => { await cleanupRenderComponents(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const saveFavorites = (keys: string[]) => {
  localStorage.setItem('web_market_favorites', JSON.stringify(keys));
  window.dispatchEvent(new Event('desktop-favs-changed'));
};

describe('FavoritesPanel immediate rows', () => {
  it('같은 심볼도 거래소·현선물 틱을 구분하고 메타데이터 없이 받은 WS 소액 가격을 보존한다', async () => {
    saveFavorites(['BINANCE|spot|IQUSDT', 'BITGET|futures|IQUSDT', 'BINANCE|spot|NEWUSDT']);
    mocks.precision.set('IQUSDT', 2);
    mocks.precision.set('BINANCE:SPOT:IQUSDT', 7);
    mocks.precision.set('BITGET:FUTURES:IQUSDT', 4);
    mocks.spot.mockResolvedValue([{ ...ticker('IQUSDT'), last: 0.0012345 }]);
    mocks.bitget.mockResolvedValue([{ ...ticker('IQUSDT'), last: 0.0012 }]);
    const callbacks: Array<(ticker: { symbol: string; price: number }) => void> = [];
    mocks.subscribe.mockImplementation((_symbols, callback) => { callbacks.push(callback); return { close: vi.fn() }; });
    const view = await renderComponent(<FavoritesPanel active />);
    act(() => callbacks[0]({ symbol: 'NEWUSDT', price: 0.00000123 }));
    expect([...view.container.querySelectorAll('.wm-row-price strong')].map(el => el.textContent))
      .toEqual(['0.0012345', '0.0012', '0.00000123']);
  });

  it('첫 조회 대기에도 종목이 즉시 보이며 REST보다 먼저 도착한 WS 가격을 표시한다', async () => {
    vi.useFakeTimers();
    saveFavorites(['broken', 'BINANCE|spot|BTCUSDT']);
    const slow = deferred<CoinTicker[]>(); mocks.spot.mockReturnValue(slow.promise);
    let callback!: (ticker: { symbol: string; price: number; changeRate: number }) => void;
    mocks.subscribe.mockImplementation((_symbols, cb) => { callback = cb; return { close: vi.fn() }; });
    const view = await renderComponent(<FavoritesPanel active />);
    expect(view.container.textContent).toContain('BTCUSDT');
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toBe('—');
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(view.container.querySelector('.wm-row-skel')).toBeNull();
    act(() => callback({ symbol: 'BTCUSDT', price: 42, changeRate: 0.02 }));
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toBe('42.00');
    await act(async () => slow.resolve([ticker('BTCUSDT')]));
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toBe('42.00');
    expect(mocks.futures).not.toHaveBeenCalled();
  });

  it('느린 거래소를 기다리지 않고 준비된 시장을 표시하며 같은 시장 종목 추가는 재조회하지 않는다', async () => {
    saveFavorites(['BINANCE|spot|BTCUSDT', 'BITGET|futures|ETHUSDT']);
    mocks.spot.mockResolvedValue([ticker('BTCUSDT'), ticker('SOLUSDT')]);
    const slow = deferred<CoinTicker[]>(); mocks.bitget.mockReturnValue(slow.promise);
    const view = await renderComponent(<FavoritesPanel active />);
    expect([...view.container.querySelectorAll('.wm-row-price strong')].map(el => el.textContent)).toEqual(['1.00', '—']);
    expect(mocks.bitget).toHaveBeenCalledWith({ throwOnError: true, quote: 'USDT' });
    act(() => saveFavorites(['BINANCE|spot|BTCUSDT', 'BITGET|futures|ETHUSDT', 'BINANCE|spot|SOLUSDT']));
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(3);
    expect(mocks.spot).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve([ticker('ETHUSDT')]));
    expect([...view.container.querySelectorAll('.wm-row-price strong')].map(el => el.textContent)).toEqual(['1.00', '1.00', '1.00']);
  });

  it('실패에도 행을 유지하고 재활성화 후 이전 WS callback을 폐기한다', async () => {
    vi.useFakeTimers(); saveFavorites(['BINANCE|spot|BTCUSDT']);
    mocks.spot.mockResolvedValueOnce([ticker('BTCUSDT')]).mockRejectedValue(new Error('offline'));
    const callbacks: Array<(ticker: { symbol: string; price: number }) => void> = [];
    mocks.subscribe.mockImplementation((_symbols, callback) => { callbacks.push(callback); return { close: vi.fn() }; });
    const view = await renderComponent(<FavoritesPanel active />);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(view.container.textContent).toContain('일부 시세를 갱신하지 못했어요.');
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(1);
    await view.rerender(<FavoritesPanel active={false} />); await view.rerender(<FavoritesPanel active />);
    act(() => callbacks[0]({ symbol: 'BTCUSDT', price: 999 }));
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toBe('1.00');
    act(() => saveFavorites([]));
    expect(view.container.textContent).toContain('관심종목이 없어요.');
  });
});
