// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../test/renderComponent';
import App from './App';

const state = vi.hoisted(() => ({
  supported: vi.fn<(symbol: string, market: 'spot' | 'futures') => Promise<boolean>>(),
}));

vi.mock('../../api/client', () => ({ getToken: () => null }));
vi.mock('../../api/server/authApi', () => ({ fetchMe: async () => ({ username: 'tester' }), logout: vi.fn() }));
vi.mock('../../api/exchange/bitget/bitgetSymbols', () => ({
  prefetchBitgetSymbols: vi.fn(),
  isBitgetSymbolSupported: state.supported,
}));
vi.mock('../../api/exchange/binance/binanceSymbols', () => ({ prefetchBinanceSymbols: vi.fn() }));
vi.mock('../../hooks/ui/usePageVisible', () => ({ useDocumentVisible: () => true }));
vi.mock('../../hooks/market/useRealtimePrices', () => ({ useRealtimeTickers: () => ({}) }));
vi.mock('./components/BottomTabBar', () => ({ default: ({ onNavigate }: { onNavigate: (route: string) => void }) => <button onClick={() => onNavigate('/')}>go-market</button> }));
vi.mock('./pages/LoginPage', () => ({ default: () => null }));
vi.mock('./pages/AssetsPage', () => ({ default: () => null }));
vi.mock('../../shared/ui/StrategyComingSoon', () => ({ default: () => null }));
vi.mock('./pages/CoinChartPage', () => ({ default: ({ active, routeActive, symbol, productType, exchange }: { active: boolean; routeActive: boolean; symbol: string; productType?: string; exchange: string }) => <output data-testid="chart" data-active={String(active)} data-route-active={String(routeActive)} data-symbol={symbol} data-product={productType} data-exchange={exchange} /> }));
vi.mock('./pages/CoinListPage', () => ({ default: ({ active, onOpenTrade, onOpenChart, onSelectSymbol, onProductTypeChange, onExchangeChange, onLogout }: {
  active: boolean;
  onOpenTrade?: (symbol: string, market: 'spot' | 'futures') => void;
  onOpenChart: () => void;
  onSelectSymbol: (symbol: string) => void;
  onProductTypeChange: (value: string | undefined) => void;
  onExchangeChange: (value: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB') => void;
  onLogout: () => void;
}) => <div data-testid="market" data-active={String(active)}>
  <button onClick={() => onOpenTrade?.('ETHUSDT', 'spot')}>open-trade</button>
  <button onClick={() => onOpenTrade?.('SOLUSDT', 'futures')}>open-trade-futures</button>
  <button onClick={() => { onSelectSymbol('SOLUSDT'); onProductTypeChange('USDT-FUTURES'); onExchangeChange('BINANCE'); onOpenChart(); }}>open-chart</button>
  <button onClick={() => { onSelectSymbol('BTCKRW'); onProductTypeChange(undefined); onExchangeChange('UPBIT'); onOpenChart(); }}>open-upbit-chart</button>
  <button onClick={onLogout}>logout</button>
</div> }));
vi.mock('./pages/OrderPage', () => ({ default: ({ symbol, active, tradeMarketReq }: {
  symbol: string; active: boolean; tradeMarketReq?: { market: string; seq: number } | null;
}) => <output data-testid="orders" data-symbol={symbol} data-active={String(active)} data-market={tradeMarketReq?.market} data-seq={tradeMarketReq?.seq} /> }));

const click = async (container: HTMLElement, text: string) => {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === text) as HTMLButtonElement;
  await act(async () => button.click());
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

describe('mobile App market navigation', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callback(0); return 1; }));
    state.supported.mockReset();
    state.supported.mockResolvedValue(true);
  });
  afterEach(async () => { await cleanupRenderComponents(); vi.unstubAllGlobals(); });

  it('마켓 상세의 거래 요청이 지원 확인 뒤 orders 선택을 전달한다', async () => {
    const view = await renderComponent(<App />);
    await click(view.container, 'open-trade');
    const orders = view.container.querySelector('[data-testid="orders"]') as HTMLOutputElement;
    expect(state.supported).toHaveBeenCalledWith('ETHUSDT', 'spot');
    expect(orders.dataset.symbol).toBe('ETHUSDT');
    expect(orders.dataset.active).toBe('true');
    expect(orders.dataset.market).toBe('spot');
    expect(orders.dataset.seq).toBe('1');

    await click(view.container, 'go-market');
    await click(view.container, 'open-trade');
    expect((view.container.querySelector('[data-testid="orders"]') as HTMLOutputElement).dataset.seq).toBe('2');
  });

  it('미지원 요청은 route와 선택을 유지하고 안내한다', async () => {
    state.supported.mockResolvedValue(false);
    const view = await renderComponent(<App />);
    await click(view.container, 'open-trade-futures');
    expect(window.location.hash).toBe('');
    expect(view.container.querySelector('[data-testid="orders"]')).toBeNull();
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('SOLUSDT는 Bitget 선물');
    expect((view.container.querySelector('[data-testid="market"]') as HTMLElement).dataset.active).toBe('true');
  });

  it('chart icon은 지원 조회 없이 선택을 전달하고 즉시 이동한다', async () => {
    const view = await renderComponent(<App />);
    await click(view.container, 'open-chart');
    const chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.active).toBe('true');
    expect(chart.dataset.symbol).toBe('SOLUSDT');
    expect(chart.dataset.product).toBe('USDT-FUTURES');
    expect(chart.dataset.exchange).toBe('BINANCE');
    expect(chart.dataset.routeActive).toBe('true');
    expect(state.supported).not.toHaveBeenCalled();
  });

  it('KRW 현물의 symbol/exchange/product를 chart route까지 그대로 전달한다', async () => {
    const view = await renderComponent(<App />);
    await click(view.container, 'open-upbit-chart');
    const chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.symbol).toBe('BTCKRW');
    expect(chart.dataset.exchange).toBe('UPBIT');
    expect(chart.dataset.product).toBeUndefined();
  });

  it('늦은 지원 조회는 이후 navigation이나 더 최신 거래 요청을 덮지 않는다', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    state.supported.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const view = await renderComponent(<App />);
    await click(view.container, 'open-trade');
    await click(view.container, 'open-trade-futures');
    await act(async () => second.resolve(true));
    let orders = view.container.querySelector('[data-testid="orders"]') as HTMLOutputElement;
    expect(orders.dataset.symbol).toBe('SOLUSDT');
    expect(orders.dataset.market).toBe('futures');
    await act(async () => first.resolve(true));
    orders = view.container.querySelector('[data-testid="orders"]') as HTMLOutputElement;
    expect(orders.dataset.symbol).toBe('SOLUSDT');

    await click(view.container, 'go-market');
    const late = deferred<boolean>();
    state.supported.mockImplementationOnce(() => late.promise);
    await click(view.container, 'open-trade');
    await click(view.container, 'open-chart');
    await act(async () => late.resolve(true));
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.active).toBe('true');
  });

  it('pending 거래 조회는 logout과 unmount 뒤 navigation을 실행하지 않는다', async () => {
    const logoutLookup = deferred<boolean>();
    state.supported.mockImplementationOnce(() => logoutLookup.promise);
    const logoutView = await renderComponent(<App />);
    await click(logoutView.container, 'open-trade');
    await click(logoutView.container, 'logout');
    await act(async () => logoutLookup.resolve(true));
    expect(window.location.hash).toBe('');
    await logoutView.unmount();

    const unmountLookup = deferred<boolean>();
    state.supported.mockImplementationOnce(() => unmountLookup.promise);
    const unmountView = await renderComponent(<App />);
    await click(unmountView.container, 'open-trade');
    await unmountView.unmount();
    await act(async () => unmountLookup.resolve(true));
    expect(window.location.hash).toBe('');
  });

  it('pending 거래 조회는 외부 hash navigation을 덮지 않는다', async () => {
    const lookup = deferred<boolean>();
    state.supported.mockImplementationOnce(() => lookup.promise);
    const view = await renderComponent(<App />);
    await click(view.container, 'open-trade');
    await act(async () => {
      window.location.hash = '#/chart';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await act(async () => lookup.resolve(true));
    expect(window.location.hash).toBe('#/chart');
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.active).toBe('true');
  });
});
