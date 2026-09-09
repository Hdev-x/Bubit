// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../api/server/authApi';
import type { TrackerState } from '../../shared/types/bot';
import type { MarketChartRef } from '../../chart/MarketChart';
import { cleanupRenderComponents, renderComponent } from '../../test/renderComponent';
import DesktopApp from './DesktopApp';

const controls = vi.hoisted(() => ({
  candlesKey: 'BINANCE|F|BTCUSDT|1h', decimals: 2, chartMounts: 0,
  candleStatus: 'ready' as 'loading' | 'ready' | 'error', mtfStatus: 'settled' as 'loading' | 'settled',
  priceStatus: 'ready' as 'loading' | 'ready' | 'error', primaryReady: true, candleClose: 1, missing: [] as string[],
  candles: [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }], mtf: {},
  retryCandles: vi.fn(), retryMtf: vi.fn(), rangeChange: vi.fn(),
  focusTimeWindow: vi.fn(),
  resetPriceAutoScale: vi.fn(), raf: new Map<number, FrameRequestCallback>(), nextRaf: 1,
}));

vi.mock('../../hooks/ui/usePersistentState', () => ({ usePersistentState: <T,>(_key: string, initial: T) => useState(initial) }));
vi.mock('./panels/marketShared', () => ({ useCoinLogos: () => ({}) }));
vi.mock('../../hooks/account/useMainTrade', () => ({ useMainTrade: () => ({ data: { hasKey: false, positions: [], orders: [], planOrders: [], available: 0, equity: 0 } }) }));
vi.mock('../../hooks/account/useSpotTrade', () => ({ useSpotTrade: () => ({ data: { holdings: [], orders: [], usdtAvailable: 0, hasKey: false } }) }));
vi.mock('../../hooks/market/useUsdKrw', () => ({ useUsdKrw: () => 1380 }));
vi.mock('../../hooks/market/useRealtimePrices', () => ({ useRealtimePrices: () => ({}) }));
vi.mock('../../hooks/ui/useDelayedReady', () => ({ useDelayedReady: () => true }));
vi.mock('../../hooks/market/useLivePrice', () => ({ useLivePrice: () => ({ price: 100, dailyOpen: 90, ready: controls.priceStatus === 'ready', status: controls.priceStatus }) }));
vi.mock('../../chart/hooks/useCandleLoader', () => ({ useCandleLoader: () => vi.fn(async () => []) }));
vi.mock('./hooks/useDesktopCandles', () => ({ useDesktopCandles: ({ activeTf, symbol, exchange, isFutures }: { activeTf: string; symbol: string; exchange: string; isFutures: boolean }) => { const granularity = activeTf === '4H' ? '4h' : '1h'; const requestKey = `${exchange}|${isFutures ? 'F' : 'S'}|${symbol}|${granularity}`; return { timeframe: { value: activeTf, granularity }, candles: controls.candles, candlesKey: controls.candlesKey, requestKey, status: controls.candleStatus, retryCandles: controls.retryCandles, handleVisibleRangeChange: controls.rangeChange }; } }));
vi.mock('./hooks/useOrderbookSnapshot', () => ({ useOrderbookSnapshot: () => ({ krwDec: 0, getTickDecimals: () => controls.decimals }) }));
vi.mock('./hooks/useHeaderSnapshot', () => ({ useHeaderSnapshot: ({ symbol, exchange, isFutures }: { symbol: string; exchange: string; isFutures: boolean }) => ({ H: { title: symbol, symbol, exchange, isFutures }, primaryReady: controls.primaryReady, fmtVol: () => '' }) }));
vi.mock('../../chart/hooks/useMtfCandles', () => ({ useMtfCandles: (_symbol: string, _settings: unknown, _load: unknown, _atomic: boolean, key: string) => ({ mtfCandles: controls.mtf, mtfKey: key, requestKey: key, settingsKey: '', status: controls.mtfStatus, missing: controls.missing, retryMtf: controls.retryMtf }) }));
vi.mock('./hooks/useDrawingState', () => ({ useDrawingState: () => ({ drawOpen: false, setDrawOpen: vi.fn(), drawRef: { current: null } }) }));
vi.mock('./hooks/useIndicatorState', () => ({ useIndicatorState: () => ({ indiOpen: false, setIndiOpen: vi.fn(), indiRef: { current: null }, effIndicatorSettings: { '1M': {}, '1W': {}, '3D': {}, '1D': {} } }) }));
vi.mock('./hooks/useChartViewState', () => ({ useChartViewState: () => { const [activeTf, setActiveTf] = useState('1H'); return { activeTf, setActiveTf, chartSetOpen: false, setChartSetOpen: vi.fn(), chartSetRef: { current: null } }; } }));
vi.mock('./panels/DesktopHeader', () => ({ DesktopHeader: ({ setWatchMode }: { setWatchMode: (mode: 'hidden' | 'dock') => void }) => <><button onClick={() => setWatchMode('dock')}>dock</button><button onClick={() => setWatchMode('hidden')}>hide</button></> }));
vi.mock('./panels/WatchlistPanel', () => ({ WatchlistPanel: ({ mode, onSelect }: { mode: string; onSelect: (symbol: string, market: string, exchange: string) => void }) => <div data-testid={`watch-${mode}`}><button onClick={() => onSelect('BTCUSDT', 'spot', 'BITGET')}>same-symbol</button><button onClick={() => onSelect('ETHUSDT', 'spot', 'BITGET')}>other-symbol</button></div> }));
vi.mock('./panels/ChartToolbar', () => ({ ChartToolbar: ({ solo, view, interactionBlocked }: { solo: { soloOn: boolean; setFocusTracker: (tracker: TrackerState) => void; setSoloActive: (active: boolean) => void }; view: { setActiveTf: (tf: string) => void }; interactionBlocked?: boolean }) => <><output data-testid="solo">{String(solo.soloOn)}</output><output data-testid="toolbar-blocked">{String(interactionBlocked)}</output><button onClick={() => { solo.setFocusTracker({ symbol: 'BTCUSDT', xabc: { X: { time: 1 } } } as TrackerState); solo.setSoloActive(true); }}>solo-on</button><button onClick={() => view.setActiveTf('4H')}>change-tf</button></> }));
vi.mock('./panels/ChartStage', () => ({ ChartStage: ({ chartRef, data, sel }: { chartRef: RefObject<MarketChartRef | null>; data: { chartTickDecimals: number; candles: Array<{ close: number }>; pending: boolean; error: boolean; missing: string[]; onRetry: () => void; handleVisibleRangeChange: () => void }; sel: { symbol: string } }) => { useEffect(() => { controls.chartMounts += 1; (chartRef as { current: MarketChartRef | null }).current = { resetPriceAutoScale: controls.resetPriceAutoScale, focusTimeWindow: controls.focusTimeWindow, getVisibleRawTimeRange: () => ({ from: 1, to: 2 }) } as unknown as MarketChartRef; return () => { (chartRef as { current: MarketChartRef | null }).current = null; }; }, [chartRef]); return <><output data-testid="decimals">{data.chartTickDecimals}</output><output data-testid="shown">{`${sel.symbol}|${data.candles[0]?.close}|${data.pending}|${data.error}|${data.missing.join(',')}`}</output><button onClick={data.onRetry}>retry-chart</button><button onClick={data.handleVisibleRangeChange}>load-history</button></>; } }));
vi.mock('./panels/SymbolHeader', () => ({ SymbolHeader: () => null }));
vi.mock('./panels/OrderbookPanel', () => ({ OrderbookPanel: () => null }));
vi.mock('./panels/RightPanel', () => ({ RightPanel: () => null }));
vi.mock('./panels/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./panels/IconRail', () => ({ IconRail: () => null }));

const user = { role: 'USER' } as AuthUser;
const props = { user, onLoginClick: vi.fn(), onLogout: vi.fn() };
const click = async (container: HTMLElement, label: string) => {
  const button = [...container.querySelectorAll('button')].find((node) => node.textContent === label) as HTMLButtonElement;
  await act(async () => button.click());
};
const flushRaf = async () => act(async () => {
  const callbacks = [...controls.raf.values()]; controls.raf.clear(); callbacks.forEach((callback) => callback(0));
});

describe('DesktopApp chart state', () => {
  beforeEach(() => {
    vi.useFakeTimers(); controls.candlesKey = 'BINANCE|F|BTCUSDT|1h'; controls.decimals = 2; controls.candleClose = 1; controls.candles = [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }]; controls.candleStatus = 'ready'; controls.mtfStatus = 'settled'; controls.priceStatus = 'ready'; controls.primaryReady = true; controls.missing = []; controls.chartMounts = 0; controls.rangeChange.mockReset(); controls.retryCandles.mockReset(); controls.retryMtf.mockReset(); controls.focusTimeWindow.mockReset(); controls.resetPriceAutoScale.mockReset(); controls.raf.clear(); controls.nextRaf = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = controls.nextRaf++; controls.raf.set(id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => controls.raf.delete(id));
  });
  afterEach(async () => { await cleanupRenderComponents(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('같은 symbol 선택은 solo를 유지하고 다른 symbol 선택만 해제한다', async () => {
    const view = await renderComponent(<DesktopApp {...props} />);
    await click(view.container, 'dock'); await flushRaf(); await flushRaf();
    await click(view.container, 'solo-on'); await click(view.container, 'change-tf');
    expect(view.container.querySelector('[data-testid="solo"]')?.textContent).toBe('true');
    await click(view.container, 'same-symbol');
    expect(view.container.querySelector('[data-testid="solo"]')?.textContent).toBe('true');
    await click(view.container, 'other-symbol');
    expect(view.container.querySelector('[data-testid="solo"]')?.textContent).toBe('false');
    expect(controls.resetPriceAutoScale).toHaveBeenCalledOnce();
  });

  it('새 캔들 key가 준비될 때만 decimals를 바꾸고 chart를 재마운트하지 않는다', async () => {
    const view = await renderComponent(<DesktopApp {...props} />);
    controls.decimals = 8; controls.candlesKey = 'old'; await view.rerender(<DesktopApp {...props} />);
    expect(view.container.querySelector('[data-testid="decimals"]')?.textContent).toBe('2');
    controls.candlesKey = 'BINANCE|F|BTCUSDT|1h'; await view.rerender(<DesktopApp {...props} />);
    expect(view.container.querySelector('[data-testid="decimals"]')?.textContent).toBe('8');
    expect(controls.chartMounts).toBe(1);
  });

  it('main·price·MTF가 같은 선택으로 준비될 때만 표시 packet을 교체한다', async () => {
    const view = await renderComponent(<DesktopApp {...props} />);
    expect(view.container.querySelector('[data-testid="shown"]')?.textContent).toBe('BTCUSDT|1|false|false|');

    controls.candleStatus = 'loading'; controls.mtfStatus = 'loading'; controls.priceStatus = 'loading'; controls.candleClose = 2; controls.candles = [{ time: 2, open: 2, high: 2, low: 2, close: 2, volume: 1 }];
    await click(view.container, 'dock'); await flushRaf(); await flushRaf(); await click(view.container, 'other-symbol');
    expect(view.container.querySelector('[data-testid="shown"]')?.textContent).toBe('BTCUSDT|1|true|false|');

    controls.candlesKey = 'BITGET|S|ETHUSDT|1h'; controls.candleStatus = 'ready'; controls.priceStatus = 'ready'; controls.primaryReady = true;
    await view.rerender(<DesktopApp {...props} />);
    expect(view.container.querySelector('[data-testid="shown"]')?.textContent).toBe('BTCUSDT|1|true|false|');
    controls.mtfStatus = 'settled'; controls.missing = ['1W']; await view.rerender(<DesktopApp {...props} />);
    expect(view.container.querySelector('[data-testid="shown"]')?.textContent).toBe('ETHUSDT|2|false|false|1W');
    expect(controls.chartMounts).toBe(1);
  });

  it('새 선택의 main candle 실패는 이전 packet과 retry를 유지한다', async () => {
    const view = await renderComponent(<DesktopApp {...props} />);
    await click(view.container, 'load-history');
    expect(controls.rangeChange).toHaveBeenCalledOnce();
    controls.rangeChange.mockClear();
    controls.candleStatus = 'error'; controls.candleClose = 2;
    await click(view.container, 'dock'); await flushRaf(); await flushRaf(); await click(view.container, 'other-symbol');
    expect(view.container.querySelector('[data-testid="shown"]')?.textContent).toBe('BTCUSDT|1|false|true|');
    await click(view.container, 'load-history');
    expect(controls.rangeChange).not.toHaveBeenCalled();
    await click(view.container, 'retry-chart');
    expect(controls.retryCandles).toHaveBeenCalledOnce();
    expect(controls.retryMtf).toHaveBeenCalledOnce();
    expect(controls.chartMounts).toBe(1);
  });

  it('solo TF 전환은 pending 중 범위를 바꾸지 않고 packet commit 뒤 한 번만 맞춘다', async () => {
    const view = await renderComponent(<DesktopApp {...props} />);
    await click(view.container, 'solo-on');
    controls.focusTimeWindow.mockClear();
    controls.candleStatus = 'loading'; controls.mtfStatus = 'loading';
    await click(view.container, 'change-tf');
    expect(controls.focusTimeWindow).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="toolbar-blocked"]')?.textContent).toBe('true');

    controls.candlesKey = 'BINANCE|F|BTCUSDT|4h'; controls.candleStatus = 'ready'; controls.mtfStatus = 'settled';
    await view.rerender(<DesktopApp {...props} />);
    expect(controls.focusTimeWindow).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-testid="toolbar-blocked"]')?.textContent).toBe('false');
  });

  it('dock close→open은 unmount timer와 중첩 RAF를 취소한다', async () => {
    const view = await renderComponent(<DesktopApp {...props} />);
    await flushRaf(); await flushRaf(); // Desktop sidebar의 초기 double RAF 소진
    await click(view.container, 'dock'); await flushRaf();
    await click(view.container, 'hide');
    expect(controls.raf.size).toBe(0); // dock outer RAF가 예약한 inner RAF도 close cleanup에서 제거
    expect(view.container.querySelector('.watch-dock')?.classList.contains('open')).toBe(false);
    await click(view.container, 'dock'); await act(async () => vi.advanceTimersByTimeAsync(440)); await flushRaf(); await flushRaf();
    expect(view.container.querySelector('[data-testid="watch-dock"]')).not.toBeNull();
    expect(view.container.querySelector('.watch-dock')?.classList.contains('open')).toBe(true);

    await click(view.container, 'hide');
    await click(view.container, 'dock'); await flushRaf();
    expect(controls.raf.size).toBe(1);
    await view.unmount();
    expect(controls.raf.size).toBe(0);
  });

  it('로그아웃하면 저장된 dock 모드를 접고 전환 뒤 unmount한다', async () => {
    const view = await renderComponent(<DesktopApp {...props} />);
    await click(view.container, 'dock'); await flushRaf(); await flushRaf();
    expect(view.container.querySelector('.watch-dock')?.classList.contains('open')).toBe(true);

    await view.rerender(<DesktopApp {...props} user={null} />);
    expect(view.container.querySelector('.watch-dock')?.classList.contains('open')).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(440));
    expect(view.container.querySelector('[data-testid="watch-dock"]')).toBeNull();
  });
});
