// @vitest-environment jsdom
import { act, forwardRef, StrictMode, useEffect, useImperativeHandle, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackerState } from '../../../shared/types/bot';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import CoinChartPage from './CoinChartPage';

const state = vi.hoisted(() => ({
  manager: { id: 'manager-1' }, mountCount: 0, selectDrawing: vi.fn(), clearAll: vi.fn(),
  retryCandles: vi.fn(), retryMtf: vi.fn(),
  main: {
    candles: [{ time: 1, open: 90, high: 110, low: 80, close: 100, volume: 1 }],
    candlesKey: 'BITGET|S|BTCUSDT|1Dutc', livePrice: 100, dailyOpenPrice: 90,
    requestKey: 'BITGET|S|BTCUSDT|1Dutc', status: 'ready' as 'loading' | 'ready' | 'error',
  },
  mtf: {
    mtfCandles: { '1D': [{ time: 1, open: 90, high: 110, low: 80, close: 100, volume: 1 }] },
    mtfKey: 'BITGET|S|BTCUSDT', requestKey: 'BITGET|S|BTCUSDT', settingsKey: '',
    status: 'settled' as 'loading' | 'settled', missing: [] as string[],
  },
}));

vi.mock('../../../chart/MarketChart', () => ({
  default: forwardRef(function MockMarketChart({ candles, symbol, period, marketKey, className, drawingStorageKey, legacyDrawingStorageKey, interactionBlocked, activeTool, indicatorLayers, onVisibleRangeChange, maSettings, bbSetting, pivotSetting, focusTracker, highlightTracker }: {
    candles: Array<{ close: number }>; symbol?: string; period?: string; marketKey?: string; drawingStorageKey?: string; legacyDrawingStorageKey?: string; interactionBlocked?: boolean; activeTool?: string | null;
    className?: string;
    indicatorLayers?: Array<{ tf: string }>; onVisibleRangeChange?: () => void; maSettings?: unknown[]; bbSetting?: unknown; pivotSetting?: unknown;
    focusTracker?: { signature?: string } | null; highlightTracker?: { signature?: string } | null;
  }, ref) {
    useEffect(() => { state.mountCount++; }, []);
    useImperativeHandle(ref, () => ({
      getDrawingManager: () => state.manager,
      selectDrawing: state.selectDrawing,
      clearAll: state.clearAll, undo: vi.fn(), redo: vi.fn(), focusTimeWindow: vi.fn(), resetView: vi.fn(),
    }));
    return <output data-testid="chart" className={className} data-symbol={symbol} data-period={period} data-market-key={marketKey} data-drawing-key={drawingStorageKey} data-legacy-key={legacyDrawingStorageKey} data-blocked={String(interactionBlocked)} data-tool={activeTool ?? ""} data-close={candles.at(-1)?.close} data-mtf={indicatorLayers?.map(layer => layer.tf).join(',')} data-visible-range={onVisibleRangeChange ? 'on' : 'off'} data-ma={maSettings?.length} data-bb={(bbSetting as { test?: string })?.test ?? 'old'} data-pivot={(pivotSetting as { test?: string })?.test ?? 'old'} data-focus={focusTracker?.signature} data-highlight={highlightTracker?.signature} />;
  }),
}));
vi.mock('../components/PullToRefresh', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ precisionMap: new Map(), getTickDecimals: () => 2 }) }));
vi.mock('../../../hooks/ui/usePersistentState', () => ({ usePersistentState: <T,>(_key: string, initial: T) => useState(initial) }));
vi.mock('../../../chart/hooks/useChartTheme', () => ({ useChartTheme: <T,>(initial: T) => useState(initial) }));
vi.mock('../../../chart/hooks/useMtfCandles', () => ({ useMtfCandles: () => ({ ...state.mtf, retryMtf: state.retryMtf }) }));
vi.mock('../../../chart/hooks/useCandleLoader', () => ({ useCandleLoader: () => vi.fn().mockResolvedValue([]) }));
vi.mock('../../../chart/hooks/useCoinCandles', () => ({ useCoinCandles: () => ({
  ...state.main, retryCandles: state.retryCandles, refreshCandles: vi.fn(), handleVisibleRangeChange: vi.fn(),
}) }));
vi.mock('../components/sheets/AnalysisHubSheet', () => ({ default: ({ isOpen, onOpenObjectTree }: { isOpen: boolean; onOpenObjectTree: () => void }) => isOpen ? <button onClick={onOpenObjectTree}>open-object-tree</button> : null }));
vi.mock('../components/sheets/ObjectTreeSheet', () => ({ default: ({ isOpen, manager, onClose, onSelectDrawing }: { isOpen: boolean; manager: { id: string } | null; onClose: () => void; onSelectDrawing: (id: string) => void }) => isOpen ? <div><output data-testid="manager">{manager?.id ?? 'none'}</output><button onClick={onClose}>close-tree</button><button onClick={() => onSelectDrawing('drawing-1')}>select-drawing</button></div> : null }));
vi.mock('../components/sheets/TimeframeSheet', () => ({
  isTimeframeSupported: (exchange: string, timeframe: string) => !((exchange === 'UPBIT' && ['6h', '12h', '3d'].includes(timeframe)) || (exchange === 'BITHUMB' && timeframe === '3d')),
  default: ({ isOpen, selectedTimeframe, exchange, onSelect }: { isOpen: boolean; selectedTimeframe: string; exchange: string; onSelect: (value: { label: string; value: string; granularity: string; channel: string; category: 'min' | 'hour' | 'day' }) => void }) => isOpen ? <div data-testid="timeframe-sheet" data-selected={selectedTimeframe} data-exchange={exchange}><button onClick={() => onSelect({ label: '5분', value: '5m', granularity: '5min', channel: 'candle5m', category: 'min' })}>select-5m</button><button onClick={() => onSelect({ label: '6시간', value: '6h', granularity: '6Hutc', channel: 'candle6Hutc', category: 'hour' })}>select-6h</button><button onClick={() => onSelect({ label: '3일', value: '3d', granularity: '3Dutc', channel: 'candle3Dutc', category: 'day' })}>select-3d</button></div> : null,
}));
vi.mock('../components/sheets/SymbolSearchSheet', () => ({ default: () => null }));
const drawingSheet = vi.hoisted(() => ({ select: null as null | ((tool: string | null) => void) }));
vi.mock('../components/sheets/DrawingSheet', () => ({ default: ({ isOpen, onClearAll, onSelectTool }: { isOpen: boolean; onClearAll: () => void; onSelectTool: (tool: string | null) => void }) => { drawingSheet.select = onSelectTool; return <output data-testid="drawing-sheet" data-open={String(isOpen)} onClick={onClearAll} />; } }));
vi.mock('../../../chart/indicators/IndicatorSheet', () => ({ default: ({ isOpen, onMaSettingsChange, onBbSettingChange, onPivotSettingChange }: {
  isOpen: boolean; onMaSettingsChange: (value: unknown[]) => void; onBbSettingChange: (value: unknown) => void; onPivotSettingChange: (value: unknown) => void;
}) => isOpen ? <button onClick={() => { onMaSettingsChange([]); onBbSettingChange({ test: 'new' }); onPivotSettingChange({ test: 'new' }); }}>change-settings</button> : null }));
vi.mock('../../../chart/settings/ChartSettingsSheet', () => ({ default: () => null }));
vi.mock('../../../chart/settings/theme', () => ({ PRESET_THEMES: [{}], getThemeCssVars: () => ({}) }));

const baseProps = { symbol: 'BTCUSDT', active: true, onSelectSymbol: vi.fn() };
const tracker = (signature: string): TrackerState => ({
  symbol: 'BTCUSDT', signature, monitorKind: 'pattern_4h', type: 'bull', phase: 'scanning', mid: 1,
  obTime: 1, lookAfterTime: 1, waitCount: 0, holdCount: 0,
});
const click = async (container: HTMLElement, text: string) => {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === text) as HTMLButtonElement;
  await act(async () => button.click());
};

describe('CoinChartPage imperative state', () => {
  beforeEach(() => {
    document.title = 'Bubit';
    state.manager = { id: 'manager-1' };
    state.mountCount = 0;
    state.selectDrawing.mockReset();
    state.clearAll.mockReset();
    state.retryCandles.mockReset();
    state.retryMtf.mockReset();
    Object.assign(state.main, {
      candles: [{ time: 1, open: 90, high: 110, low: 80, close: 100, volume: 1 }],
      candlesKey: 'BITGET|S|BTCUSDT|1Dutc', livePrice: 100, dailyOpenPrice: 90,
      requestKey: 'BITGET|S|BTCUSDT|1Dutc', status: 'ready',
    });
    Object.assign(state.mtf, {
      mtfCandles: { '1D': [{ time: 1, open: 90, high: 110, low: 80, close: 100, volume: 1 }] },
      mtfKey: 'BITGET|S|BTCUSDT', requestKey: 'BITGET|S|BTCUSDT', settingsKey: '', status: 'settled', missing: [],
    });
  });
  afterEach(async () => { await cleanupRenderComponents(); });

  it('첫 load 중에는 chart host를 유지하면서 선택과 quote를 blank로 둔다', async () => {
    Object.assign(state.main, { candles: [], candlesKey: null, livePrice: null, dailyOpenPrice: null, status: 'loading' });
    Object.assign(state.mtf, { mtfCandles: {}, mtfKey: null, status: 'loading' });
    const view = await renderComponent(<CoinChartPage {...baseProps} />);
    const chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart).not.toBeNull();
    expect(chart.dataset.symbol).toBeUndefined();
    expect(chart.dataset.drawingKey).toBeUndefined();
    expect(chart.dataset.blocked).toBe('true');
    expect(view.container.querySelector('.chart-symbol-name')?.textContent).toBe('BTCUSDT');
    expect(view.container.querySelector('.chart-live-price')?.textContent).toBe('—');
    expect(view.container.querySelector('[role="status"]')).toBeNull();
    expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect((view.container.querySelector('button[title="이 브라우저는 전체화면을 지원하지 않습니다."]') as HTMLButtonElement).disabled).toBe(true);
    expect((view.container.querySelector('button[title="이 브라우저는 공유를 지원하지 않습니다."]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Bithumb 6Hutc 선택값을 유지하고 Upbit 전환 시 미지원 TF를 1Dutc로 되돌린다', async () => {
    const view = await renderComponent(<CoinChartPage {...baseProps} symbol="BTCKRW" exchange="BITHUMB" productType={undefined} />);
    const timeframe = [...view.container.querySelectorAll('.tool-group.symbol-time span')].at(-1) as HTMLElement;
    await act(async () => timeframe.click());
    await click(view.container, 'select-6h');
    let sheet = view.container.querySelector('[data-testid="timeframe-sheet"]') as HTMLElement;
    expect(sheet.dataset.selected).toBe('6h');
    expect(sheet.dataset.exchange).toBe('BITHUMB');
    await view.rerender(<CoinChartPage {...baseProps} symbol="BTCKRW" exchange="UPBIT" productType={undefined} />);
    sheet = view.container.querySelector('[data-testid="timeframe-sheet"]') as HTMLElement;
    expect(sheet.dataset.selected).toBe('1d');
    expect(sheet.dataset.exchange).toBe('UPBIT');
  });

  it('Bithumb 전환은 미지원 3Dutc를 1Dutc로 되돌린다', async () => {
    const view = await renderComponent(<CoinChartPage {...baseProps} exchange="BINANCE" />);
    const timeframe = [...view.container.querySelectorAll('.tool-group.symbol-time span')].at(-1) as HTMLElement;
    await act(async () => timeframe.click());
    await click(view.container, 'select-3d');
    expect((view.container.querySelector('[data-testid="timeframe-sheet"]') as HTMLElement).dataset.selected).toBe('3d');
    await view.rerender(<CoinChartPage {...baseProps} exchange="BITHUMB" productType={undefined} />);
    expect((view.container.querySelector('[data-testid="timeframe-sheet"]') as HTMLElement).dataset.selected).toBe('1d');
  });

  it('ObjectTree를 열 때 현재 manager를 캡처하고 close/select 뒤 재열면 새 manager를 사용한다', async () => {
    const view = await renderComponent(<CoinChartPage {...baseProps} />);
    const more = view.container.querySelector('button[title="더보기"]') as HTMLButtonElement;
    await act(async () => more.click());
    await click(view.container, 'open-object-tree');
    expect(view.container.querySelector('[data-testid="manager"]')?.textContent).toBe('manager-1');
    await click(view.container, 'close-tree');

    state.manager = { id: 'manager-2' };
    await click(view.container, 'open-object-tree');
    expect(view.container.querySelector('[data-testid="manager"]')?.textContent).toBe('manager-2');
    await click(view.container, 'select-drawing');
    expect(state.selectDrawing).toHaveBeenCalledWith('drawing-1');
    expect(view.container.querySelector('[data-testid="manager"]')).toBeNull();
    expect(state.mountCount).toBe(1);
    await view.rerender(<CoinChartPage {...baseProps} tickDecimals={4} />);
    expect(state.mountCount).toBe(1);
  });

  it('TF 선택 중에는 완성된 이전 packet을 유지하고 같은 key의 ready 결과에서 한 번에 교체한다', async () => {
    const view = await renderComponent(<CoinChartPage {...baseProps} />);
    const drawingButton = view.container.querySelector('button[title="그리기"]') as HTMLButtonElement;
    await act(async () => drawingButton.click());
    expect((view.container.querySelector('[data-testid="drawing-sheet"]') as HTMLElement).dataset.open).toBe('true');
    const exitingSheetSelect = drawingSheet.select!;
    const timeframe = [...view.container.querySelectorAll('.tool-group.symbol-time span')].at(-1) as HTMLElement;
    await act(async () => timeframe.click());
    await click(view.container, 'select-5m');
    const pendingChart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(pendingChart.dataset.period).toBe('1d');
    expect(pendingChart.dataset.close).toBe('100');
    expect(pendingChart.dataset.visibleRange).toBe('off');
    expect(pendingChart.dataset.blocked).toBe('true');
    expect(pendingChart.dataset.drawingKey).toBe('mobile_BITGET_spot_BTCUSDT');
    expect(drawingButton.disabled).toBe(true);
    expect((view.container.querySelector('[data-testid="drawing-sheet"]') as HTMLElement).dataset.open).toBe('false');
    await act(async () => drawingButton.click());
    expect((view.container.querySelector('[data-testid="drawing-sheet"]') as HTMLElement).dataset.open).toBe('false');
    await act(async () => (view.container.querySelector('[data-testid="drawing-sheet"]') as HTMLElement).click());
    expect(state.clearAll).not.toHaveBeenCalled();
    await act(async () => exitingSheetSelect('trend-line'));
    expect(pendingChart.dataset.tool).toBe('');
    expect(view.container.querySelector('[role="status"]')).toBeNull();
    expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull();

    Object.assign(state.main, {
      candles: [{ time: 2, open: 190, high: 210, low: 180, close: 200, volume: 2 }],
      candlesKey: 'BITGET|S|BTCUSDT|5min', livePrice: 200, dailyOpenPrice: 180,
      requestKey: 'BITGET|S|BTCUSDT|5min', status: 'ready',
    });
    await view.rerender(<CoinChartPage {...baseProps} />);
    const readyChart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(readyChart.dataset.period).toBe('5m');
    expect(readyChart.dataset.close).toBe('200');
    expect(readyChart.dataset.tool).toBe('');
    expect(readyChart.dataset.visibleRange).toBe('on');
    expect(view.container.querySelector('[role="status"]')).toBeNull();
    expect(state.mountCount).toBe(1);
  });

  it('새 chart entry target은 이전 packet을 즉시 숨기고 main과 MTF 완료 뒤 같은 frame에 표시한다', async () => {
    const view = await renderComponent(<CoinChartPage {...baseProps} routeActive />);
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.close).toBe('100');

    const nextProps = { ...baseProps, symbol: 'ETHUSDT', exchange: 'BINANCE' as const, productType: 'USDT-FUTURES' };
    Object.assign(state.main, { requestKey: 'BINANCE|F|ETHUSDT|1Dutc', status: 'loading' });
    Object.assign(state.mtf, { requestKey: 'BINANCE|F|ETHUSDT', status: 'loading' });
    await view.rerender(<CoinChartPage {...nextProps} routeActive={false} />);
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.close).toBe('100');

    await view.rerender(<CoinChartPage {...nextProps} routeActive />);
    let chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(view.container.querySelector('.chart-symbol-name')?.textContent).toBe('ETHUSDT.P');
    expect(view.container.querySelector('.chart-live-price')?.textContent).toBe('—');
    expect(document.title).toBe('ETHUSDT.P —');
    expect(chart.classList.contains('chart-entry-blank')).toBe(true);
    expect(chart.dataset.symbol).toBeUndefined();
    expect(chart.dataset.drawingKey).toBeUndefined();
    expect(chart.dataset.close).toBeUndefined();
    expect(state.mountCount).toBe(1);

    Object.assign(state.main, { status: 'error' });
    await view.rerender(<CoinChartPage {...nextProps} routeActive />);
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('불러오지 못했습니다');
    await click(view.container, '다시 시도');
    expect(state.retryCandles).toHaveBeenCalledTimes(1);
    expect(state.retryMtf).toHaveBeenCalledTimes(1);

    Object.assign(state.main, {
      candles: [{ time: 2, open: 190, high: 210, low: 180, close: 200, volume: 2 }],
      candlesKey: 'BINANCE|F|ETHUSDT|1Dutc', livePrice: 200, dailyOpenPrice: 180,
      requestKey: 'BINANCE|F|ETHUSDT|1Dutc', status: 'ready',
    });
    await view.rerender(<CoinChartPage {...nextProps} routeActive />);
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).classList.contains('chart-entry-blank')).toBe(true);

    Object.assign(state.mtf, { mtfCandles: {}, mtfKey: 'BINANCE|F|ETHUSDT', requestKey: 'BINANCE|F|ETHUSDT', status: 'settled', missing: [] });
    await view.rerender(<CoinChartPage {...nextProps} routeActive />);
    chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.classList.contains('chart-entry-blank')).toBe(false);
    expect(chart.dataset.symbol).toBe('ETHUSDT');
    expect(chart.dataset.drawingKey).toBe('mobile_BINANCE_USDT-FUTURES_ETHUSDT');
    expect(chart.dataset.legacyKey).toBe('ETHUSDT');
    expect(chart.dataset.blocked).toBe('false');
    expect(chart.dataset.close).toBe('200');
    expect(state.mountCount).toBe(1);

    await view.rerender(<CoinChartPage {...nextProps} routeActive={false} />);
    await view.rerender(<CoinChartPage {...nextProps} routeActive />);
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.close).toBe('200');
  });

  it('새 tracker는 기존 TF packet에 섞지 않고 일치하는 TF packet부터 focus와 highlight를 표시한다', async () => {
    const view = await renderComponent(<CoinChartPage {...baseProps} />);
    await view.rerender(<CoinChartPage {...baseProps} focusTracker={tracker('focus-4h')} />);
    let chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.period).toBe('1d');
    expect(chart.dataset.focus).toBeUndefined();
    expect(chart.dataset.highlight).toBeUndefined();

    Object.assign(state.main, {
      candles: [{ time: 2, open: 190, high: 210, low: 180, close: 200, volume: 2 }],
      candlesKey: 'BITGET|S|BTCUSDT|4h', livePrice: 200, dailyOpenPrice: 180,
      requestKey: 'BITGET|S|BTCUSDT|4h', status: 'ready',
    });
    await view.rerender(<CoinChartPage {...baseProps} focusTracker={tracker('focus-4h')} />);
    chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.period).toBe('4h');
    expect(chart.dataset.focus).toBe('focus-4h');
    expect(chart.dataset.highlight).toBe('focus-4h');

    const timeframe = [...view.container.querySelectorAll('.tool-group.symbol-time span')].at(-1) as HTMLElement;
    await act(async () => timeframe.click());
    await click(view.container, 'select-5m');
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.period).toBe('4h');
  });

  it('종목 전환 실패는 이전 title/quote/chart/drawing/MTF를 유지하고 retry를 함께 실행한다', async () => {
    const view = await renderComponent(<StrictMode><CoinChartPage {...baseProps} /></StrictMode>);
    Object.assign(state.main, {
      candles: [{ time: 2, open: 130, high: 160, low: 120, close: 150, volume: 2 }],
      livePrice: 150,
    });
    await view.rerender(<StrictMode><CoinChartPage {...baseProps} /></StrictMode>);
    expect(document.title).toBe('BTCUSDT 150.00 (+66.67%)');
    Object.assign(state.main, { requestKey: 'BINANCE|F|ETHUSDT|1Dutc', status: 'error' });
    Object.assign(state.mtf, { mtfKey: 'BITGET|S|BTCUSDT', requestKey: 'BINANCE|F|ETHUSDT', status: 'loading' });
    const nextProps = { ...baseProps, symbol: 'ETHUSDT', exchange: 'BINANCE' as const, productType: 'USDT-FUTURES' };
    await view.rerender(<StrictMode><CoinChartPage {...nextProps} /></StrictMode>);
    const chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(view.container.querySelector('.chart-symbol-name')?.textContent).toBe('BTCUSDT');
    expect(view.container.querySelector('.chart-live-price')?.textContent).toBe('150.00');
    expect(chart.dataset.symbol).toBe('BTCUSDT');
    expect(chart.dataset.drawingKey).toBe('mobile_BITGET_spot_BTCUSDT');
    expect(chart.dataset.close).toBe('150');
    expect(document.title).toBe('BTCUSDT 150.00 (+66.67%)');
    expect(chart.dataset.mtf).toBe('1D');
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('불러오지 못했습니다');
    await click(view.container, '다시 시도');
    expect(state.retryCandles).toHaveBeenCalledTimes(1);
    expect(state.retryMtf).toHaveBeenCalledTimes(1);

    Object.assign(state.main, {
      candles: [{ time: 2, open: 290, high: 310, low: 280, close: 300, volume: 3 }],
      candlesKey: 'BINANCE|F|ETHUSDT|1Dutc', livePrice: 300, dailyOpenPrice: 270,
      requestKey: 'BINANCE|F|ETHUSDT|1Dutc', status: 'ready',
    });
    await view.rerender(<StrictMode><CoinChartPage {...nextProps} /></StrictMode>);
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.symbol).toBe('BTCUSDT');

    Object.assign(state.mtf, {
      mtfCandles: { '1D': [{ time: 2, open: 290, high: 310, low: 280, close: 300, volume: 3 }] },
      mtfKey: 'BINANCE|F|ETHUSDT', requestKey: 'BINANCE|F|ETHUSDT', status: 'settled', missing: [],
    });
    await view.rerender(<StrictMode><CoinChartPage {...nextProps} /></StrictMode>);
    const swapped = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(view.container.querySelector('.chart-symbol-name')?.textContent).toBe('ETHUSDT.P');
    expect(swapped.dataset.symbol).toBe('ETHUSDT');
    expect(swapped.dataset.drawingKey).toBe('mobile_BINANCE_USDT-FUTURES_ETHUSDT');
    expect(swapped.dataset.close).toBe('300');
    expect(document.title).toBe('ETHUSDT.P 300.00 (+11.11%)');
    Object.assign(state.main, { livePrice: 500 });
    await view.rerender(<StrictMode><CoinChartPage {...nextProps} active={false} /></StrictMode>);
    expect(document.title).toBe('ETHUSDT.P 300.00 (+11.11%)');
  });

  it('같은 symbol의 거래소·상품 변경은 MTF와 main이 모두 준비된 뒤 교체하고 missing을 알린다', async () => {
    const view = await renderComponent(<CoinChartPage {...baseProps} />);
    const initialChart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    const initialMa = initialChart.dataset.ma;
    Object.assign(state.mtf, { settingsKey: '1W', status: 'loading', missing: ['1W'] });
    const indicatorButton = view.container.querySelector('button[title="보조지표"]') as HTMLButtonElement;
    await act(async () => indicatorButton.click());
    await click(view.container, 'change-settings');
    let chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.ma).toBe(initialMa);
    expect(chart.dataset.bb).toBe('old');
    expect(chart.dataset.pivot).toBe('old');
    Object.assign(state.mtf, { mtfKey: 'BITGET|S|BTCUSDT', status: 'settled' });
    await view.rerender(<CoinChartPage {...baseProps} />);
    chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.ma).toBe('0');
    expect(chart.dataset.bb).toBe('new');
    expect(chart.dataset.pivot).toBe('new');

    const nextProps = { ...baseProps, exchange: 'BINANCE' as const, productType: 'USDT-FUTURES' };
    Object.assign(state.mtf, {
      mtfCandles: {}, mtfKey: 'BITGET|S|BTCUSDT', requestKey: 'BINANCE|F|BTCUSDT',
      settingsKey: '1W', status: 'loading', missing: ['1W'],
    });
    Object.assign(state.main, { requestKey: 'BINANCE|F|BTCUSDT|1Dutc', status: 'loading' });
    await view.rerender(<CoinChartPage {...nextProps} />);
    chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.marketKey).toBe('BITGET-spot');
    expect(view.container.querySelector('.chart-symbol-name')?.textContent).toBe('BTCUSDT');

    Object.assign(state.mtf, { mtfKey: 'BINANCE|F|BTCUSDT', status: 'settled' });
    await view.rerender(<CoinChartPage {...nextProps} />);
    expect((view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement).dataset.marketKey).toBe('BITGET-spot');

    Object.assign(state.main, {
      candles: [{ time: 3, open: 390, high: 410, low: 380, close: 400, volume: 4 }],
      candlesKey: 'BINANCE|F|BTCUSDT|1Dutc', livePrice: 400, dailyOpenPrice: 380,
      requestKey: 'BINANCE|F|BTCUSDT|1Dutc', status: 'ready',
    });
    await view.rerender(<CoinChartPage {...nextProps} />);
    chart = view.container.querySelector('[data-testid="chart"]') as HTMLOutputElement;
    expect(chart.dataset.marketKey).toBe('BINANCE-USDT-FUTURES');
    expect(view.container.querySelector('.chart-symbol-name')?.textContent).toBe('BTCUSDT.P');
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('1W');
  });
});
