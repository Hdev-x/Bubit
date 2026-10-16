// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../test/renderComponent';
import App from './App';
import type { AuthUser } from '../../api/server/authApi';

const state = vi.hoisted(() => ({
  tickerListeners: new Map<string, (ticker: { symbol: string; price: number; changeRate?: number }) => void>(),
  me: vi.fn<() => Promise<AuthUser | null>>(),
  supported: vi.fn<(symbol: string, market: 'spot' | 'futures') => Promise<boolean>>(),
}));

vi.mock('../../api/client', () => ({ getToken: () => null }));
vi.mock('../../api/server/authApi', () => ({ fetchMe: state.me, logout: vi.fn() }));
vi.mock('../../api/exchange/bitget/bitgetSymbols', () => ({
  prefetchBitgetSymbols: vi.fn(),
  isBitgetSymbolSupported: state.supported,
}));
vi.mock('../../api/exchange/binance/binanceSymbols', () => ({ prefetchBinanceSymbols: vi.fn() }));
vi.mock('../../hooks/ui/usePageVisible', () => ({ useDocumentVisible: () => true }));
vi.mock('../../api/server/coinRealtime', () => ({ listenRealtimeTicker: (topic: string, listener: (ticker: { symbol: string; price: number; changeRate?: number }) => void) => { state.tickerListeners.set(topic, listener); return { close: () => state.tickerListeners.delete(topic) }; } }));
vi.mock('./components/BottomTabBar', () => ({ default: ({ onNavigate }: { onNavigate: (route: string) => void }) => <button onClick={() => onNavigate('/')}>go-market</button> }));
vi.mock('./pages/LoginPage', () => ({ default: ({ onSuccess, onBrowse }: { onSuccess: (user: AuthUser) => void; onBrowse: () => void }) => <div data-testid="login"><button onClick={() => onSuccess({ username: 'tester', role: 'USER' })}>login</button><button onClick={onBrowse}>browse</button></div> }));
vi.mock('../shared/account/MyPageDialog', () => ({ default: ({ initialSection, onClose }: { initialSection: string; onClose: () => void }) => <div data-testid="settings" data-section={initialSection}><button onClick={onClose}>close-settings</button></div> }));
vi.mock('../shared/paper/PaperTradingPanel', () => ({ PaperTradingPanel: ({ onOpenSettings }: { onOpenSettings: () => void }) => <div data-testid="paper"><button onClick={onOpenSettings}>paper-settings</button></div> }));
vi.mock('./pages/AssetsPage', () => ({ default: () => <output data-testid="assets" /> }));
vi.mock('../../shared/ui/StrategyComingSoon', () => ({ default: () => <output data-testid="strategy" /> }));
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
    state.tickerListeners.clear();
    state.me.mockReset().mockResolvedValue({ username: 'tester', role: 'USER' });
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
  it('guest는 시장과 차트를 즉시 보고 거래 로그인 후 요청 종목을 유지한다', async () => {
    state.me.mockResolvedValue(null);
    const view = await renderComponent(<App />);
    expect(view.container.querySelector('[data-testid="market"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="login"]')).toBeNull();
    await click(view.container, 'open-chart');
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLElement).dataset.active).toBe('true');
    await click(view.container, 'go-market');
    await click(view.container, 'open-trade');
    expect(state.supported).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="orders"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="login"]')).not.toBeNull();
    await click(view.container, 'login');
    const orders = view.container.querySelector('[data-testid="orders"]') as HTMLElement;
    expect(orders.dataset.symbol).toBe('ETHUSDT');
    expect(orders.dataset.market).toBe('spot');
  });

  it.each(['/orders', '/strategy', '/assets'])('guest의 %s 직접 진입은 private 화면을 mount하지 않는다', async route => {
    state.me.mockResolvedValue(null);
    window.location.hash = route;
    const view = await renderComponent(<App />);
    expect(view.container.querySelector('[data-testid="login"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="orders"], [data-testid="strategy"], [data-testid="assets"]')).toBeNull();
    await click(view.container, 'browse');
    expect(view.container.querySelector('[data-testid="login"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="market"]')).not.toBeNull();
  });

  it('인증 서버 응답을 기다리는 동안에도 시장을 표시한다', async () => {
    const me = deferred<AuthUser | null>();
    state.me.mockReturnValue(me.promise);
    const view = await renderComponent(<App />);
    expect(view.container.querySelector('[data-testid="market"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="login"]')).toBeNull();
    await act(async () => me.resolve(null));
  });

  it('타이틀은 선택 거래소·현선물의 공유 시세만 듣고 늦은 종목 이벤트를 무시한다', async () => {
    const view = await renderComponent(<App />);
    const oldTicker = state.tickerListeners.get('/topic/binance-futures/BTCUSDT')!;
    await act(async () => oldTicker({ symbol: 'BTCUSDT', price: 100 }));
    expect(document.title).toContain('BTCUSDT 100');
    await click(view.container, 'open-trade');
    expect(state.tickerListeners.has('/topic/binance-futures/BTCUSDT')).toBe(false);
    const spotTicker = state.tickerListeners.get('/topic/binance-spot/ETHUSDT')!;
    await act(async () => spotTicker({ symbol: 'ETHUSDT', price: 200 }));
    expect(document.title).toContain('ETHUSDT 200');
    await act(async () => oldTicker({ symbol: 'BTCUSDT', price: 999 }));
    expect(document.title).toContain('ETHUSDT 200');
    expect([...state.tickerListeners.keys()].some(topic => topic.includes('/coin'))).toBe(false);
  });

  it('모의투자에서 설정을 열면 조회를 멈추고 닫은 뒤 계좌를 새로 불러온다', async () => {
    const view = await renderComponent(<App />);
    await click(view.container, 'open-trade');
    await click(view.container, '모의투자');
    await click(view.container, 'paper-settings');
    expect(view.container.querySelector('[data-testid="paper"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="settings"]')?.getAttribute('data-section')).toBe('paper');
    await click(view.container, 'close-settings');
    expect(view.container.querySelector('[data-testid="paper"]')).not.toBeNull();
  });

  it('모의투자 선택 시 계좌 화면을 닫고 화면을 떠나면 모의 조회도 멈춘다', async () => {
    const view = await renderComponent(<App />);
    await click(view.container, 'open-trade');
    await click(view.container, '모의투자');
    expect(view.container.querySelector('[data-testid="orders"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="paper"]')).not.toBeNull();
    await click(view.container, 'go-market');
    expect(view.container.querySelector('[data-testid="paper"]')).toBeNull();
  });

});
