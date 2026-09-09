// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import { deferred } from '../../../test/renderHook';
import { fetchMainTrade } from '../../../api/server/mainTradeApi';
import { fetchUsdKrwRate } from '../../../api/exchange/exchangeRate';
import CoinListPage from './CoinListPage';
import TimeframeSheet from '../components/sheets/TimeframeSheet';

const detail = vi.hoisted(() => ({ params: null as null | { exchangeFilter: string; productFilter: string } }));

vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ precisionMap: new Map() }) }));
vi.mock('../../../hooks/market/useMarketTickers', () => ({ useMarketTickers: () => ({ allTickers: [{ symbol: 'BTCKRW', baseSymbol: 'BTC', quoteSymbol: 'KRW', name: 'Bitcoin', last: 100, change: 1, changeRate: 0.01, volume: 10, tickDecimals: 0 }], sortSnapshot: [{ symbol: 'BTCKRW', baseSymbol: 'BTC', quoteSymbol: 'KRW', name: 'Bitcoin', last: 100, change: 1, changeRate: 0.01, volume: 10, tickDecimals: 0 }], isTickerLoading: false }) }));
vi.mock('../../../hooks/account/useWatchlist', () => ({ useWatchlist: () => ({ watchlist: [], toggleWatchlist: vi.fn(), isWatched: () => false }) }));
vi.mock('../../../shared/contexts/settingsContext', () => ({ useCurrency: vi.fn() }));
vi.mock('../../../chart/hooks/useCoinDetailChart', () => ({ useCoinDetailChart: (params: { exchangeFilter: string; productFilter: string }) => { detail.params = params; return { miniCandles: [], chartPeriod: '1D', chartType: 'candles', chartExchange: params.exchangeFilter, chartProductType: params.productFilter === 'FUTURES' ? 'USDT-FUTURES' : undefined, resetDetailChart: vi.fn(), selectChartPeriod: vi.fn(), toggleChartType: vi.fn() }; } }));
vi.mock('../../../hooks/account/useSpotValueUsdt', () => ({ useSpotValueUsdt: () => ({ value: 0, priced: false }) }));
vi.mock('../../../hooks/ui/useDelayedReady', () => ({ useDelayedReady: () => true }));
vi.mock('../../../api/server/marketApi', () => ({ fetchCoinLogos: vi.fn(async () => ({})) }));
vi.mock('../../../api/server/mainTradeApi', () => ({ fetchMainTrade: vi.fn(async () => null) }));
vi.mock('../../../api/exchange/exchangeRate', () => ({ fetchUsdKrwRate: vi.fn(async () => 1380) }));
vi.mock('../components/PullToRefresh', () => ({ default: ({ children, onRefresh }: { children: ReactNode; onRefresh: () => Promise<void> }) => <><button onClick={() => void onRefresh()}>refresh-assets</button>{children}</> }));
vi.mock('../components/ProfileMenu', () => ({ default: () => null }));
vi.mock('../components/TotalAssetHero', () => ({ TotalAssetHero: ({ totalUsdt }: { totalUsdt: number }) => <output data-testid="total-assets">{totalUsdt}</output> }));
vi.mock('../components/coin-list/CoinRow', () => ({ CoinRow: ({ onClick }: { onClick: (symbol: string) => void }) => <button onClick={() => onClick('BTCKRW')}>open-detail</button> }));
vi.mock('../components/coin-list/CoinListSkeleton', () => ({ CoinListSkeleton: () => null }));
vi.mock('../components/coin-list/WatchlistStorySection', () => ({ WatchlistStorySection: () => null }));
vi.mock('../components/coin-list/CoinDetailPanel', () => ({ CoinDetailPanel: ({ detailOpen, onOpenChart }: { detailOpen: boolean; onOpenChart: () => void }) => detailOpen ? <button onClick={onOpenChart}>detail-chart</button> : null }));
vi.mock('../components/coin-list/WatchlistBottomSheet', () => ({ WatchlistBottomSheet: () => null }));
vi.mock('../components/coin-list/CoinListFilterBar', () => ({ CoinListFilterBar: ({ productFilter, marketFilter, activeSheet, setActiveSheet }: { productFilter: string; marketFilter: string; activeSheet: string | null; setActiveSheet: (sheet: 'EXCHANGE') => void }) => <><output data-testid="filters">{productFilter}|{marketFilter}</output><output data-testid="sheet">{activeSheet ?? ''}</output><button onClick={() => setActiveSheet('EXCHANGE')}>open-exchange</button></> }));
vi.mock('../components/coin-list/ExchangeBottomSheet', () => ({ ExchangeBottomSheet: ({ activeSheet, onSelectExchange }: { activeSheet: string | null; onSelectExchange: (exchange: 'UPBIT' | 'BINANCE') => void }) => activeSheet === 'EXCHANGE' ? <><button onClick={() => onSelectExchange('UPBIT')}>upbit</button><button onClick={() => onSelectExchange('BINANCE')}>binance</button></> : null }));

const mainTrade = (equity: number) => ({ hasKey: true, equity, available: 0, positions: [], orders: [], planOrders: [] });

beforeEach(() => {
  vi.mocked(fetchMainTrade).mockReset().mockResolvedValue(mainTrade(0));
  vi.mocked(fetchUsdKrwRate).mockReset().mockResolvedValue(1380);
});

afterEach(async () => {
  await cleanupRenderComponents();
  vi.clearAllTimers();
  vi.useRealTimers();
});

const props = { selectedSymbol: 'BTCUSDT', onSelectSymbol: vi.fn(), onOpenChart: vi.fn(), onLogout: vi.fn() };

describe('CoinListPage selection reset', () => {
  it('KRW 거래소별 미지원 timeframe만 비활성화한다', async () => {
    const view = await renderComponent(<TimeframeSheet isOpen selectedTimeframe="1d" exchange="UPBIT" onClose={vi.fn()} onSelect={vi.fn()} />);
    const button = (label: string) => [...view.container.querySelectorAll('button')].find(node => node.textContent === label) as HTMLButtonElement;
    expect(button('6시간').disabled).toBe(true);
    expect(button('12시간').disabled).toBe(true);
    expect(button('3일').disabled).toBe(true);
    await view.rerender(<TimeframeSheet isOpen selectedTimeframe="1d" exchange="BITHUMB" onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(button('6시간').disabled).toBe(false);
    expect(button('12시간').disabled).toBe(false);
    expect(button('3일').disabled).toBe(true);
    expect(button('3일').title).toContain('Bithumb');
  });
  it('KRW 거래소는 SPOT/KRW로, USDT 거래소 복귀는 USDT로 보정한다', async () => {
    const view = await renderComponent(<CoinListPage {...props} active />);
    const click = async (label: string) => {
      const button = [...view.container.querySelectorAll('button')].find((node) => node.textContent === label) as HTMLButtonElement;
      await act(async () => button.click());
    };
    await click('open-exchange');
    await click('upbit');
    expect(view.container.querySelector('[data-testid="filters"]')?.textContent).toBe('SPOT|KRW');
    await click('open-exchange');
    await click('binance');
    expect(view.container.querySelector('[data-testid="filters"]')?.textContent).toBe('SPOT|USDT');
  });

  it('KRW 상세에서 선택한 거래소·현물·symbol을 full chart callback에 보존한다', async () => {
    const onSelectSymbol = vi.fn();
    const onExchangeChange = vi.fn();
    const onProductTypeChange = vi.fn();
    const onOpenChart = vi.fn();
    const view = await renderComponent(<CoinListPage {...props} active onSelectSymbol={onSelectSymbol} onExchangeChange={onExchangeChange} onProductTypeChange={onProductTypeChange} onOpenChart={onOpenChart} />);
    const click = async (label: string) => {
      const button = [...view.container.querySelectorAll('button')].find(node => node.textContent === label) as HTMLButtonElement;
      await act(async () => button.click());
    };
    await click('open-exchange');
    await click('upbit');
    await click('open-detail');
    await click('detail-chart');
    expect(detail.params).toMatchObject({ exchangeFilter: 'UPBIT', productFilter: 'SPOT' });
    expect(onSelectSymbol).toHaveBeenCalledWith('BTCKRW');
    expect(onExchangeChange).toHaveBeenCalledWith('UPBIT');
    expect(onProductTypeChange).toHaveBeenCalledWith(undefined);
    expect(onOpenChart).toHaveBeenCalledOnce();
  });

  it('비활성화하면 열린 sheet 상태를 지워 재활성화해도 열리지 않는다', async () => {
    const view = await renderComponent(<CoinListPage {...props} active />);
    const button = view.container.querySelector('button') as HTMLButtonElement;
    await act(async () => button.click());
    await view.rerender(<CoinListPage {...props} active={false} />);
    await view.rerender(<CoinListPage {...props} active />);
    expect(view.container.querySelector('[data-testid="sheet"]')?.textContent).toBe('');
  });

  it('자산 summary를 최초·10초·PullRefresh에서 조회하고 inactive면 polling을 멈춘다', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchMainTrade).mockResolvedValue(mainTrade(10));
    const view = await renderComponent(<CoinListPage {...props} active />);
    await act(async () => {});
    expect(fetchMainTrade).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-testid="total-assets"]')?.textContent).toBe('10');

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchMainTrade).toHaveBeenCalledTimes(2);
    const refresh = [...view.container.querySelectorAll('button')].find((node) => node.textContent === 'refresh-assets') as HTMLButtonElement;
    await act(async () => refresh.click());
    expect(fetchMainTrade).toHaveBeenCalledTimes(3);

    await view.rerender(<CoinListPage {...props} active={false} />);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(fetchMainTrade).toHaveBeenCalledTimes(3);
  });

  it('비활성화 cleanup 뒤 늦은 자산 응답을 화면에 반영하지 않는다', async () => {
    const request = deferred<Awaited<ReturnType<typeof fetchMainTrade>>>();
    vi.mocked(fetchMainTrade).mockReturnValueOnce(request.promise);
    const view = await renderComponent(<CoinListPage {...props} active />);
    await view.rerender(<CoinListPage {...props} active={false} />);
    await act(async () => request.resolve(mainTrade(99)));
    expect(view.container.querySelector('[data-testid="total-assets"]')?.textContent).toBe('0');
  });

  it('늦은 PullRefresh 응답이 비활성·재활성 뒤 새 자산 결과를 덮지 않는다', async () => {
    const oldManual = deferred<Awaited<ReturnType<typeof fetchMainTrade>>>();
    const newActive = deferred<Awaited<ReturnType<typeof fetchMainTrade>>>();
    vi.mocked(fetchMainTrade)
      .mockResolvedValueOnce(mainTrade(1))
      .mockReturnValueOnce(oldManual.promise)
      .mockReturnValueOnce(newActive.promise);
    const view = await renderComponent(<CoinListPage {...props} active />);
    await act(async () => {});
    const refresh = [...view.container.querySelectorAll('button')].find((node) => node.textContent === 'refresh-assets') as HTMLButtonElement;
    act(() => refresh.click());
    await view.rerender(<CoinListPage {...props} active={false} />);
    await view.rerender(<CoinListPage {...props} active />);
    await act(async () => newActive.resolve(mainTrade(3)));
    await act(async () => oldManual.resolve(mainTrade(2)));

    expect(view.container.querySelector('[data-testid="total-assets"]')?.textContent).toBe('3');
  });
});
