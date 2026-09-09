// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import type { CoinTicker } from '../../../shared/types/market';
import { MarketPanel } from './MarketPanel';

const tickers: CoinTicker[] = Array.from({ length: 60 }, (_, i) => ({
  symbol: `COIN${String(i).padStart(2, '0')}USDT`, baseSymbol: `COIN${i}`, quoteSymbol: 'USDT',
  name: `Coin ${i}`, last: i + 1, change: 0, changeRate: 0, volume: 60 - i, tickDecimals: 2,
}));
const mocks = vi.hoisted(() => ({ load: vi.fn(), binanceFutures: vi.fn(), bitgetFutures: vi.fn() }));
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

vi.mock('../../../hooks/ui/useDelayedReady', () => ({ useDelayedReady: () => true }));
vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ precisionMap: new Map() }) }));
vi.mock('../../../api/server/coinRealtime', () => ({
  subscribeBitgetSpotTickers: vi.fn(), subscribeBitgetFuturesTickers: mocks.bitgetFutures,
  subscribeBinanceSpotTickers: vi.fn(), subscribeBinanceFuturesTickers: mocks.binanceFutures,
}));
vi.mock('../../../api/exchange/krw/krwRealtime', () => ({ subscribeKrwTickers: vi.fn() }));
vi.mock('./marketShared', () => ({
  loadExchangeTickers: mocks.load,
  useDesktopFavorites: () => ({ isFav: () => false, toggleFav: vi.fn() }),
  useCoinLogos: () => ({}), formatVolume: () => '', formatVolumeKrw: () => '',
}));

afterEach(async () => { await cleanupRenderComponents(); vi.clearAllMocks(); });

describe('MarketPanel selection reset', () => {
  it('무한 스크롤 뒤 검색·정렬·거래소 전환에서 40개로 복원하고 KRW 거래소는 Spot을 선택한다', async () => {
    mocks.load.mockResolvedValue({ spot: tickers, futures: tickers });
    const view = await renderComponent(<MarketPanel active />);
    await act(async () => {});
    const list = view.container.querySelector('.wm-list') as HTMLDivElement;
    Object.defineProperties(list, { scrollHeight: { value: 1000 }, clientHeight: { value: 500 }, scrollTop: { value: 450, writable: true } });
    const grow = async () => act(async () => {
      list.scrollTop = 450;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await grow();
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(60);

    const nameSort = [...view.container.querySelectorAll('.wm-colhead button')].find((button) => button.textContent?.includes('Name'))!;
    await act(async () => nameSort.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(40);

    await grow();
    const spot = [...view.container.querySelectorAll('.wm-tabs button')].find((button) => button.textContent === 'Spot')!;
    await act(async () => spot.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(40);

    await grow();
    const search = view.container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'COIN');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(40);

    await grow();
    const binance = [...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Binance'))!;
    await act(async () => binance.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(60);

    const upbit = [...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Upbit'))!;
    await act(async () => upbit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(view.container.querySelector('.wm-tabs .active')?.textContent).toBe('Spot');
  });

  it('비활성·재활성과 거래소 전환은 스켈레톤을 보이고 늦은 이전 REST 응답을 버린다', async () => {
    const first = deferred<{ spot: CoinTicker[]; futures: CoinTicker[] }>();
    const second = deferred<{ spot: CoinTicker[]; futures: CoinTicker[] }>();
    mocks.load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = await renderComponent(<MarketPanel active />);
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(0);
    await view.rerender(<MarketPanel active={false} />);
    await view.rerender(<MarketPanel active />);
    expect(view.container.querySelectorAll('.wm-row')).toHaveLength(0);
    await act(async () => second.resolve({ spot: tickers, futures: tickers }));
    expect(view.container.textContent).toContain('COIN00USDT.P');
    await act(async () => first.resolve({ spot: [], futures: [] }));
    expect(view.container.textContent).toContain('COIN00USDT.P');
  });

  it('cleanup 뒤 WS callback은 표시를 갱신하지 않는다', async () => {
    mocks.load.mockResolvedValue({ spot: tickers, futures: tickers });
    let callback: ((ticker: { symbol: string; price: number; changeRate: number }) => void) | undefined;
    mocks.binanceFutures.mockImplementation((_symbols, cb) => { callback = cb; return { close: vi.fn() }; });
    const view = await renderComponent(<MarketPanel active />); await act(async () => {});
    await view.rerender(<MarketPanel active={false} />);
    act(() => callback?.({ symbol: 'COIN00USDT', price: 999, changeRate: 0.5 }));
    await view.rerender(<MarketPanel active />); await act(async () => {});
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).not.toContain('999');
  });

  it('A→B→A 전환에서 이전 A WS 값을 되살리지 않는다', async () => {
    const at = (price: number) => ({ spot: [], futures: [{ ...tickers[0], last: price }] });
    mocks.load.mockResolvedValueOnce(at(10)).mockResolvedValueOnce(at(20)).mockResolvedValueOnce(at(30));
    const callbacks: Array<(ticker: { symbol: string; price: number; changeRate: number }) => void> = [];
    mocks.binanceFutures.mockImplementation((_symbols, cb) => { callbacks.push(cb); return { close: vi.fn() }; });
    mocks.bitgetFutures.mockImplementation(() => ({ close: vi.fn() }));
    const view = await renderComponent(<MarketPanel active />); await act(async () => {});
    act(() => callbacks[0]({ symbol: 'COIN00USDT', price: 111, changeRate: 0 }));
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toContain('111');
    const bitget = [...view.container.querySelectorAll('.wm-chips button')].find((button) => button.textContent?.includes('Bitget'))!;
    await act(async () => bitget.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const binance = [...view.container.querySelectorAll('.wm-chips button')].find((button) => button.textContent?.includes('Binance'))!;
    await act(async () => binance.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => callbacks[0]({ symbol: 'COIN00USDT', price: 999, changeRate: 0 }));
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toContain('30');
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).not.toContain('111');
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).not.toContain('999');
  });
});
