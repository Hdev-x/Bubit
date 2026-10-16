// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import type { CoinTicker } from '../../../shared/types/market';

const tickers: CoinTicker[] = Array.from({ length: 160 }, (_, i) => ({
  symbol: `COIN${String(i).padStart(3, '0')}USDT`, baseSymbol: `COIN${i}`, quoteSymbol: 'USDT',
  name: `Coin ${i}`, last: i + 1, change: 0, changeRate: 0, volume: 160 - i, tickDecimals: 2,
}));
const mocks = vi.hoisted(() => ({ futures: vi.fn(), spot: vi.fn(), bitget: vi.fn(), upbit: vi.fn(), subscribe: vi.fn(), precision: new Map<string, number>() }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
vi.mock('../../../api/server/marketApi', () => ({
  fetchBinanceFuturesTickers: mocks.futures, fetchBinanceSpotTickers: mocks.spot,
  fetchCoinFuturesTickers: mocks.bitget, fetchCoinTickers: vi.fn(), fetchCoinLogos: () => Promise.resolve({}),
}));
vi.mock('../../../api/exchange/krw/krwTickers', () => ({ fetchUpbitSpotTickers: mocks.upbit, fetchBithumbSpotTickers: vi.fn() }));
vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ precisionMap: mocks.precision }) }));
vi.mock('../../../api/server/coinRealtime', () => ({
  subscribeBitgetSpotTickers: mocks.subscribe, subscribeBitgetFuturesTickers: mocks.subscribe,
  subscribeBinanceSpotTickers: mocks.subscribe, subscribeBinanceFuturesTickers: mocks.subscribe,
}));
vi.mock('../../../api/exchange/krw/krwRealtime', () => ({ subscribeKrwTickers: mocks.subscribe }));

let MarketPanel: typeof import('./MarketPanel').MarketPanel;
let FavoritesPanel: typeof import('./FavoritesPanel').FavoritesPanel;
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks(); mocks.precision.clear();
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
  mocks.subscribe.mockReturnValue({ close: vi.fn() });
  ({ MarketPanel } = await import('./MarketPanel'));
  ({ FavoritesPanel } = await import('./FavoritesPanel'));
});
afterEach(async () => { await cleanupRenderComponents(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const click = async (container: HTMLElement, selector: string, label: string) => {
  const button = [...container.querySelectorAll(selector)].find(element => element.textContent?.includes(label))!;
  await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};
const rows = (container: HTMLElement) => container.querySelectorAll('.wm-row:not(.wm-row-skel)');

describe('MarketPanel loading and shared snapshots', () => {
  it('거래량 낮은 순 Binance Spot은 현물 틱을 쓰고 WS에서도 작은 가격을 보존한다', async () => {
    mocks.precision.set('IQUSDT', 2);
    mocks.precision.set('BINANCE:FUTURES:IQUSDT', 2);
    mocks.precision.set('BINANCE:SPOT:IQUSDT', 7);
    mocks.precision.set('BINANCE:SPOT:MDBBUSDT', 8);
    mocks.futures.mockResolvedValue([]);
    mocks.spot.mockResolvedValue([
      { ...tickers[0], symbol: 'IQUSDT', last: 0.0012345, volume: 20, tickDecimals: 2 },
      { ...tickers[1], symbol: 'MDBBUSDT', last: 362.85, volume: 10, tickDecimals: 8 },
    ]);
    let onTicker!: (ticker: { symbol: string; price: number }) => void;
    mocks.subscribe.mockImplementation((_symbols, callback) => { onTicker = callback; return { close: vi.fn() }; });
    const view = await renderComponent(<MarketPanel active />);
    await click(view.container, '.wm-tabs button', 'Spot');
    await click(view.container, '.wm-colhead button', 'Volume');
    expect([...view.container.querySelectorAll('.wm-row-price strong')].map(el => el.textContent))
      .toEqual(['362.85', '0.0012345']);
    act(() => onTicker({ symbol: 'IQUSDT', price: 0.0012346 }));
    expect([...view.container.querySelectorAll('.wm-row-price strong')].map(el => el.textContent))
      .toEqual(['362.85', '0.0012346']);
  });

  it('1.5초가 지나도 조회 중에는 스켈레톤을 유지하고 실제 목록 도착 시 페이드한다', async () => {
    vi.useFakeTimers();
    const request = deferred<CoinTicker[]>(); mocks.futures.mockReturnValue(request.promise);
    const view = await renderComponent(<MarketPanel active />);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(view.container.querySelectorAll('.wm-row-skel')).toHaveLength(12);
    expect(view.container.querySelector('.wm-list-fade')).toBeNull();
    await act(async () => request.resolve(tickers));
    expect(view.container.querySelectorAll('.wm-row-skel')).toHaveLength(0);
    expect(rows(view.container)).toHaveLength(40);
    expect(view.container.querySelector('.wm-list-fade')).not.toBeNull();
  });

  it('시장 전환에 캐시를 즉시 재사용하고 잘못된 시장 값과 이전 WS callback을 섞지 않는다', async () => {
    mocks.futures.mockResolvedValue([tickers[0]]);
    mocks.spot.mockResolvedValue([{ ...tickers[0], last: 777 }]);
    const callbacks: Array<(ticker: { symbol: string; price: number }) => void> = [];
    mocks.subscribe.mockImplementation((_symbols, callback) => { callbacks.push(callback); return { close: vi.fn() }; });
    const view = await renderComponent(<MarketPanel active />);
    const oldCallback = callbacks[0];
    await click(view.container, '.wm-tabs button', 'Spot');
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toContain('777');
    await click(view.container, '.wm-tabs button', 'Futures');
    act(() => oldCallback({ symbol: tickers[0].symbol, price: 999 }));
    expect(view.container.querySelector('.wm-row-price strong')?.textContent).toBe('1.00');
    expect(mocks.futures).toHaveBeenCalledTimes(1);
    expect(mocks.spot).toHaveBeenCalledTimes(1);
    expect(mocks.futures).toHaveBeenCalledWith({ throwOnError: true });
  });

  it('첫 관심종목은 마켓의 공유 snapshot으로 즉시 나타나고 같은 시장을 재조회하지 않는다', async () => {
    mocks.futures.mockResolvedValue(tickers);
    const view = await renderComponent(<><MarketPanel active /><FavoritesPanel active /></>);
    expect(view.container.textContent).toContain('관심종목이 없어요.');
    const star = view.container.querySelector('.wm-row-star')!;
    await act(async () => star.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const favorites = view.container.querySelectorAll('.wm')[1];
    expect(favorites.querySelectorAll('.wm-row')).toHaveLength(1);
    expect(favorites.querySelector('.wm-row-price strong')?.textContent).toBe('1.00');
    expect(favorites.querySelector('.wm-row-skel')).toBeNull();
    expect(mocks.futures).toHaveBeenCalledTimes(1);
    expect(mocks.spot).not.toHaveBeenCalled();
  });

  it('실패와 빈 결과를 표시하며 재시도 후 목록으로 복구한다', async () => {
    mocks.futures.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]).mockResolvedValueOnce(tickers);
    const view = await renderComponent(<MarketPanel active />);
    expect(view.container.textContent).toContain('종목 목록을 불러오지 못했어요.');
    await click(view.container, 'button', '다시 불러오기');
    expect(view.container.textContent).toContain('표시할 종목이 없어요.');
    await click(view.container, 'button', '다시 불러오기');
    expect(rows(view.container)).toHaveLength(40);
  });

  it('스크롤로 40개씩 확장해도 DOM·WS는 화면 주변 행만 유지하고 정렬·거래소 전환에서 복원한다', async () => {
    mocks.futures.mockResolvedValue(tickers); mocks.upbit.mockResolvedValue(tickers);
    const view = await renderComponent(<MarketPanel active />);
    const list = view.container.querySelector('.wm-list') as HTMLDivElement;
    Object.defineProperties(list, { scrollHeight: { value: 2160, configurable: true }, clientHeight: { value: 500 }, scrollTop: { value: 1710, writable: true } });
    await act(async () => list.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(rows(view.container)).toHaveLength(40);
    expect(view.container.textContent).toContain('COIN059USDT.P');
    expect(mocks.subscribe.mock.calls.at(-1)?.[0]).toHaveLength(40);
    const subscriptions = mocks.subscribe.mock.calls.length;
    list.scrollTop = 1764;
    await act(async () => list.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(mocks.subscribe).toHaveBeenCalledTimes(subscriptions);
    Object.defineProperty(list, 'scrollHeight', { value: 4320 }); list.scrollTop = 3600;
    await act(async () => list.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(rows(view.container)).toHaveLength(40);
    expect(view.container.textContent).toContain('COIN079USDT.P');
    await click(view.container, '.wm-colhead button', 'Name');
    expect(view.container.textContent).toContain('COIN000USDT.P');
    expect(list.scrollTop).toBe(0);
    await click(view.container, '.wm-chips button', 'Upbit');
    expect(view.container.querySelector('.wm-tabs .active')?.textContent).toBe('Spot');
    expect(rows(view.container)).toHaveLength(40);
  });

  it('느린 요청이 끝난 뒤 5초 후 재조회하며 실패해도 기존 행을 유지한다', async () => {
    vi.useFakeTimers();
    const slow = deferred<CoinTicker[]>();
    mocks.futures.mockReturnValueOnce(slow.promise).mockRejectedValueOnce(new Error('offline'));
    const view = await renderComponent(<MarketPanel active />);
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(mocks.futures).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve(tickers));
    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(mocks.futures).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.futures).toHaveBeenCalledTimes(2);
    expect(rows(view.container)).toHaveLength(40);
  });
});
