// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import type { CoinTicker } from '../../../shared/types/market';
import { FavoritesPanel } from './FavoritesPanel';

const mocks = vi.hoisted(() => ({ favs: [] as string[], load: vi.fn(), setOrder: vi.fn(), removeKey: vi.fn(), wsCallbacks: [] as Array<(ticker: { symbol: string; price: number; changeRate: number }) => void> }));
vi.mock('../../../hooks/ui/useDelayedReady', () => ({ useDelayedReady: (ready: boolean) => ready }));
vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ precisionMap: new Map() }) }));
vi.mock('../../../api/server/coinRealtime', () => {
  const subscribe = vi.fn((_symbols, callback) => { mocks.wsCallbacks.push(callback); return { close: vi.fn() }; });
  return { subscribeBitgetSpotTickers: subscribe, subscribeBitgetFuturesTickers: subscribe, subscribeBinanceSpotTickers: subscribe, subscribeBinanceFuturesTickers: subscribe };
});
vi.mock('./marketShared', async (original) => {
  const actual = await original<typeof import('./marketShared')>();
  return { ...actual, loadExchangeTickers: mocks.load, useCoinLogos: () => ({}), useDesktopFavorites: () => ({ favs: mocks.favs, isFav: () => true, toggleFav: vi.fn(), setOrder: mocks.setOrder, removeKey: mocks.removeKey }) };
});

const ticker = (symbol: string): CoinTicker => ({ symbol, baseSymbol: symbol.replace('USDT', ''), quoteSymbol: 'USDT', name: symbol, last: 1, change: 0, changeRate: 0.01, volume: 10, tickDecimals: 2 });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
afterEach(async () => { await cleanupRenderComponents(); vi.clearAllMocks(); mocks.favs = []; mocks.wsCallbacks = []; vi.useRealTimers(); });

describe('FavoritesPanel query lifecycle', () => {
  it('favorites 변경 조회 중 기존 매칭 행을 유지하고 empty 전환에서 목록을 비운다', async () => {
    mocks.favs = ['BINANCE|spot|BTCUSDT'];
    mocks.load.mockResolvedValueOnce({ spot: [ticker('BTCUSDT')], futures: [] });
    const view = await renderComponent(<FavoritesPanel active />); await act(async () => {});
    expect(view.container.textContent).toContain('BTCUSDT');

    const next = deferred<{ spot: CoinTicker[]; futures: CoinTicker[] }>();
    mocks.load.mockReturnValueOnce(next.promise);
    mocks.favs = ['BINANCE|spot|BTCUSDT', 'BINANCE|spot|ETHUSDT'];
    await view.rerender(<FavoritesPanel active />);
    expect(view.container.textContent).toContain('BTCUSDT');
    await act(async () => next.resolve({ spot: [ticker('BTCUSDT'), ticker('ETHUSDT')], futures: [] }));
    expect(view.container.textContent).toContain('ETHUSDT');

    mocks.favs = [];
    await view.rerender(<FavoritesPanel active />);
    expect(view.container.textContent).toContain('관심종목이 없어요.');
  });

  it('5초 폴링 실패에도 마지막 매칭 행을 유지한다', async () => {
    vi.useFakeTimers();
    mocks.favs = ['BINANCE|spot|BTCUSDT'];
    mocks.load.mockResolvedValueOnce({ spot: [ticker('BTCUSDT')], futures: [] }).mockRejectedValueOnce(new Error('poll failed'));
    const view = await renderComponent(<FavoritesPanel active />); await act(async () => {});
    expect(view.container.textContent).toContain('BTCUSDT');
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(view.container.textContent).toContain('BTCUSDT');
    await view.unmount();
    vi.clearAllTimers();
  });

  it('active ABA와 unmount 뒤 이전 WS callback을 폐기한다', async () => {
    mocks.favs = ['BINANCE|spot|BTCUSDT'];
    mocks.load.mockResolvedValue({ spot: [ticker('BTCUSDT')], futures: [] });
    const view = await renderComponent(<FavoritesPanel active />); await act(async () => {});
    const oldCallback = mocks.wsCallbacks[0];
    await view.rerender(<FavoritesPanel active={false} />);
    await view.rerender(<FavoritesPanel active />); await act(async () => {});
    act(() => oldCallback({ symbol: 'BTCUSDT', price: 999, changeRate: 0.5 }));
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).not.toContain('999');
    const currentCallback = mocks.wsCallbacks.at(-1)!;
    await view.unmount();
    act(() => currentCallback({ symbol: 'BTCUSDT', price: 777, changeRate: 0.5 }));
  });
});
