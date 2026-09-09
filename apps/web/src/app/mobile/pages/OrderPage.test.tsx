// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import OrderPage from './OrderPage';

vi.mock('../components/PullToRefresh', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../../hooks/account/useMainTrade', () => ({ useMainTrade: () => ({ data: { equity: 0, available: 0, hasKey: false, positions: [], orders: [], planOrders: [] }, refetch: vi.fn() }) }));
vi.mock('../../../hooks/account/useSpotTrade', () => ({ useSpotTrade: () => ({ data: { holdings: [], orders: [], usdtAvailable: 0, hasKey: false }, refetch: vi.fn() }) }));
vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ getTickDecimals: () => 2 }) }));
vi.mock('../../../hooks/market/useRealtimePrices', () => ({ useRealtimePrices: () => ({}) }));
vi.mock('../../../api/exchange/bitget/bitgetSymbols', () => ({ isBitgetSymbolSupported: vi.fn(async () => true) }));
vi.mock('../../../config/chartPolicy', () => ({ resolveTradeChartTarget: vi.fn(async () => ({ exchange: 'BINANCE', productType: 'USDT-FUTURES' })) }));
vi.mock('../hooks/useMobileOrderbook', () => ({ useMobileOrderbook: ({ depthScale }: { depthScale: string }) => ({
  askRows: [], bidRows: [], maxLevelSize: 0, buyPct: 50, centerPrice: 0, priceDir: 'flat', depthOptions: [{ scale: 'scale0', label: '0.1' }],
  depthLabel: depthScale, fmtMid: () => '', fmtPriceOb: () => '', fundingStr: '', obSnap: null,
}) }));
vi.mock('../components/trade/TradeTabBar', () => ({ default: ({ activeTab, onEditTabs, switchMarket }: { activeTab: string; onEditTabs: () => void; switchMarket: (tab: 'futures' | 'spot') => void }) => <><output data-testid="active-tab">{activeTab}</output><button onClick={onEditTabs}>edit-tabs</button><button onClick={() => switchMarket('spot')}>switch-spot</button></> }));
vi.mock('../components/trade/TradeSymbolHeader', () => ({ default: ({ onSymbolClick, onExchangeClick }: { onSymbolClick: () => void; onExchangeClick: () => void }) => <><button onClick={onSymbolClick}>open-symbol</button><button onClick={onExchangeClick}>open-exchange</button></> }));
vi.mock('../components/trade/TradeExchangeSheet', () => ({ default: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (exchange: 'UPBIT') => void }) => isOpen ? <button onClick={() => onSelect('UPBIT')}>select-upbit</button> : null }));
vi.mock('../components/trade/TradeSymbolSheet', () => ({ default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <output data-testid="symbol-sheet" /> : null }));
vi.mock('../components/trade/TradeTabEditSheet', () => ({ default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <output data-testid="tab-sheet" /> : null }));
vi.mock('../components/trade/DepthSheet', () => ({ default: ({ open, current, onSelect }: { open: boolean; current: string; onSelect: (scale: 'scale0' | 'scale3') => void }) => open ? <><button data-current={current} onClick={() => onSelect('scale0')}>select-depth</button><button onClick={() => onSelect('scale3')}>select-depth3</button></> : null }));
vi.mock('../../../chart/orderbook/TradeOrderbook', () => ({ default: ({ onOpenDepthSheet }: { onOpenDepthSheet: () => void }) => <button onClick={onOpenDepthSheet}>open-depth</button> }));
vi.mock('../components/trade/PositionsPanel', () => ({ default: ({ actions }: { actions: { setCostEditHolding: (holding: { coin: string; available: number; frozen: number; total: number; avgPrice: number }) => void; setIsHistoryOpen: (open: boolean) => void } }) => <><button onClick={() => actions.setCostEditHolding({ coin: 'BTC', available: 1, frozen: 0, total: 1, avgPrice: 1 })}>open-cost</button><button onClick={() => actions.setIsHistoryOpen(true)}>open-history</button></> }));
vi.mock('../components/trade/TradeHistoryDrawer', () => ({ default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <output data-testid="history" /> : null }));
vi.mock('../components/trade/SpotCostSheet', () => ({ default: () => <output data-testid="cost-sheet" /> }));
vi.mock('../components/trade/TradeAccountSummary', () => ({ default: () => null }));
vi.mock('../components/trade/SpotAccountSummary', () => ({ default: () => null }));
vi.mock('../components/trade/DemoTradeView', () => ({ default: () => null }));

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() { return values.size; },
  });
});

afterEach(async () => {
  await cleanupRenderComponents();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const click = async (container: HTMLElement, text: string) => {
  const button = [...container.querySelectorAll('button')].find((node) => node.textContent === text) as HTMLButtonElement;
  await act(async () => button.click());
};

describe('OrderPage local resets', () => {
  it('미지원 거래소와 외부 futures 요청을 Spot으로 보정한다', async () => {
    const props = { symbol: 'BTCUSDT', active: true };
    const view = await renderComponent(<OrderPage {...props} />);
    await click(view.container, 'open-exchange');
    await click(view.container, 'select-upbit');
    expect(view.container.querySelector('[data-testid="active-tab"]')?.textContent).toBe('spot');

    await view.rerender(<OrderPage {...props} tradeMarketReq={{ market: 'futures', seq: 1 }} />);
    expect(view.container.querySelector('[data-testid="active-tab"]')?.textContent).toBe('spot');
  });

  it('symbol 변경 시 depthScale을 기본값으로 되돌린다', async () => {
    const view = await renderComponent(<OrderPage symbol="BTCUSDT" active />);
    await click(view.container, 'open-depth');
    await click(view.container, 'select-depth');
    expect(view.container.querySelector('[data-current]')?.getAttribute('data-current')).toBe('scale0');

    await view.rerender(<OrderPage symbol="ETHUSDT" active />);
    expect(view.container.querySelector('[data-current]')?.getAttribute('data-current')).toBe('scale2');
  });

  it('현물 전환 시 지원하지 않는 scale3을 scale2로 보정한다', async () => {
    const view = await renderComponent(<OrderPage symbol="BTCUSDT" active />);
    await click(view.container, 'open-depth');
    await click(view.container, 'select-depth3');
    expect(view.container.querySelector('[data-current]')?.getAttribute('data-current')).toBe('scale3');

    await click(view.container, 'switch-spot');
    expect(view.container.querySelector('[data-current]')?.getAttribute('data-current')).toBe('scale2');
  });

  it('비활성화하면 열린 overlay 상태를 지우고 재활성화해도 다시 열지 않는다', async () => {
    const view = await renderComponent(<OrderPage symbol="BTCUSDT" active />);
    for (const label of ['edit-tabs', 'open-symbol', 'open-exchange', 'open-depth', 'open-cost', 'open-history']) await click(view.container, label);
    await view.rerender(<OrderPage symbol="BTCUSDT" active={false} />);
    await view.rerender(<OrderPage symbol="BTCUSDT" active />);

    expect(view.container.querySelector('[data-testid="tab-sheet"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="symbol-sheet"]')).toBeNull();
    expect(view.container.querySelector('[data-current]')).toBeNull();
    expect(view.container.querySelector('[data-testid="cost-sheet"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="history"]')).toBeNull();
    expect(view.container.querySelector('button')?.textContent).not.toBe('select-upbit');
  });

  it('미구현 거래 내역 drawer를 열어도 polling timer를 만들지 않는다', async () => {
    vi.useFakeTimers();
    const view = await renderComponent(<OrderPage symbol="BTCUSDT" active />);
    await click(view.container, 'open-history');
    expect(view.container.querySelector('[data-testid="history"]')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
