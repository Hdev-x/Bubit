import { useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import MarketChart from '../../../chart/MarketChart';
import { ChartLoadStatus } from '../../../chart/ChartLoadStatus';
import type { MarketChartRef } from '../../../chart/MarketChart';
import type { DrawingManager } from '../../../chart/drawing';
import TimeframeSheet from '../components/sheets/TimeframeSheet';
import SymbolSearchSheet from '../components/sheets/SymbolSearchSheet';
import AnalysisHubSheet from '../components/sheets/AnalysisHubSheet';
import ObjectTreeSheet from '../components/sheets/ObjectTreeSheet';
import ChartSettingsSheet from '../../../chart/settings/ChartSettingsSheet';
import { PRESET_THEMES, getThemeCssVars } from '../../../chart/settings/theme';
import DrawingSheet from '../components/sheets/DrawingSheet';
import IndicatorSheet from '../../../chart/indicators/IndicatorSheet';
import { DEFAULT_MA_SETTINGS, DEFAULT_BB_SETTING, DEFAULT_PIVOT_SETTING } from '../../../chart/indicators/settings';
import type { MASetting, BBSetting, PivotSetting } from '../../../chart/indicators/IndicatorSheet';
import type { IndicatorSettings, IndicatorLayer, TFKey, OBOptions } from '../../../chart/overlays/ChartOverlay';
import { usePricePrecision } from '../../../hooks/market/usePricePrecision';
import { usePersistentState } from '../../../hooks/ui/usePersistentState';
import { useChartTheme } from '../../../chart/hooks/useChartTheme';
import { useMtfCandles } from '../../../chart/hooks/useMtfCandles';
import { useCandleLoader } from '../../../chart/hooks/useCandleLoader';
import { useCoinCandles } from '../../../chart/hooks/useCoinCandles';
import { chartKey, priceKey } from '../../../chart/hooks/marketKey';
import PullToRefresh from '../components/PullToRefresh';
import { DEFAULT_OB_OPTIONS } from '../../../chart/analysis/chartIndicators';
import type { Candle } from '../../../shared/types/market';
import type { TrackerState } from '../../../shared/types/bot';
import './CoinChartPage.css';
import { isRecord } from '../../../shared/utils/guards';
import { EXCHANGES, type ExchangeId } from '../../../shared/constants/exchanges';
import { getDrawingStorageKeys } from '../../../chart/drawingStorage';

type Props = {
  active?: boolean; // 차트 화면이 떠 있을 때만 실시간 캔들 구독·카운트다운 타이머 작동
  routeActive?: boolean;
  symbol: string;
  onSelectSymbol: (symbol: string) => void;
  productType?: string;
  exchange?: ExchangeId;
  tickDecimals?: number;
  onExchangeChange?: (exchange: ExchangeId) => void;
  onProductTypeChange?: (productType: string | undefined) => void;
  onOpenTrade?: () => void;
  focusTracker?: TrackerState | null;
};

function formatPrice(price: number, decimals: number) {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type TimeframeOption = {
  label: string;
  value: string;
  granularity: string;
  channel: string;
  category: 'min' | 'hour' | 'day' | 'week' | 'month';
};

type DisplayPacket = {
  key: string;
  settingsKey: string;
  selection: {
    symbol: string;
    productType?: string;
    exchange: ExchangeId;
    timeframe: TimeframeOption;
  };
  candles: Candle[];
  livePrice: number | null;
  dailyOpenPrice: number | null;
  mtfCandles: Partial<Record<TFKey, Candle[]>>;
  indicatorSettings: IndicatorSettings;
  maSettings: MASetting[];
  bbSetting: BBSetting;
  pivotSetting: PivotSetting;
  focusTracker: TrackerState | null;
  highlightTracker: TrackerState | null;
  tickDecimals: number;
};

const CHART_TIMEFRAMES: Record<'30m' | '1h' | '4h' | '1d', TimeframeOption> = {
  '30m': { label: '30분', value: '30m', granularity: '30m', channel: 'candle30m', category: 'min' },
  '1h': { label: '1시간', value: '1h', granularity: '1h', channel: 'candle1H', category: 'hour' },
  '4h': { label: '4시간', value: '4h', granularity: '4h', channel: 'candle4H', category: 'hour' },
  '1d': { label: '1일', value: '1d', granularity: '1Dutc', channel: 'candle1Dutc', category: 'day' },
};

function isTimeframeSupported(exchange: ExchangeId, timeframe: string) {
  return !((exchange === 'UPBIT' && (timeframe === '6h' || timeframe === '12h' || timeframe === '3d'))
    || (exchange === 'BITHUMB' && timeframe === '3d'));
}

const CHART_PATTERN_CANDLE_LIMIT = 1200;
const DEFAULT_CANDLE_LIMIT = CHART_PATTERN_CANDLE_LIMIT;
const FOCUS_MIN_CANDLE_LIMIT = CHART_PATTERN_CANDLE_LIMIT;
const FOCUS_MAX_CANDLE_LIMIT = CHART_PATTERN_CANDLE_LIMIT;
const FOCUS_PIVOT_CONTEXT_BARS = 80;

function timeframeForTracker(tracker?: TrackerState | null): TimeframeOption | null {
  const kind = tracker?.monitorKind ?? '';
  if (kind.endsWith('_30m')) return CHART_TIMEFRAMES['30m'];
  if (kind.endsWith('_1h')) return CHART_TIMEFRAMES['1h'];
  if (kind.endsWith('_4h')) return CHART_TIMEFRAMES['4h'];
  if (kind.endsWith('_1d')) return CHART_TIMEFRAMES['1d'];
  return null;
}

const EMPTY_CANDLES: Candle[] = [];
const EMPTY_MTF_CANDLES: Partial<Record<TFKey, Candle[]>> = {};

function getBaseSymbol(symbol: string) {
  return symbol.replace(/(USDT|USDC|KRW)$/i, '');
}

function getChartLogoUrl(baseSymbol: string) {
  const officialLogos: Record<string, string> = {
    BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    XRP: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
    SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
    ADA: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
    AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
    DOT: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
    LINK: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
    TRX: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png'
  };
  return officialLogos[baseSymbol] ||
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${baseSymbol.toLowerCase()}.png`;
}

function getChartLogoColor(symbol: string) {
  const colors = ['#f59f2f', '#5d6fbd', '#12a594', '#36a3d9', '#3f67ff', '#d6aa32'];
  return colors[symbol.charCodeAt(0) % colors.length];
}

function getIntervalSeconds(granularity: string): number {
  const map: Record<string, number> = {
    '1min': 60, '3min': 180, '5min': 300, '15min': 900, '30min': 1800, '30m': 1800,
    '1h': 3600, '4h': 14400, '6Hutc': 21600, '12Hutc': 43200,
    '1Dutc': 86400, '3Dutc': 259200, '1Wutc': 604800, '1Mutc': 2592000,
  };
  return map[granularity] ?? 60;
}

function getFocusCandleLimit(tracker: TrackerState, granularity: string): number {
  const startTime = Number(tracker.xabc?.X?.time ?? tracker.xabc?.A?.time);
  if (!Number.isFinite(startTime) || startTime <= 0) return FOCUS_MIN_CANDLE_LIMIT;

  const intervalSec = getIntervalSeconds(granularity);
  const nowSec = Math.floor(Date.now() / 1000);
  const barsFromStart = Math.max(1, Math.ceil((nowSec - startTime) / intervalSec) + 1);
  const needed = barsFromStart + FOCUS_PIVOT_CONTEXT_BARS;
  return Math.min(FOCUS_MAX_CANDLE_LIMIT, Math.max(FOCUS_MIN_CANDLE_LIMIT, needed));
}

function getBucketTime(timestamp: number, granularity: string): number {
  const seconds = timestamp;
  switch (granularity) {
    case '1min':  return Math.floor(seconds / 60) * 60;
    case '3min':  return Math.floor(seconds / 180) * 180;
    case '5min':  return Math.floor(seconds / 300) * 300;
    case '15min': return Math.floor(seconds / 900) * 900;
    case '30m':
    case '30min': return Math.floor(seconds / 1800) * 1800;
    case '1h':    return Math.floor(seconds / 3600) * 3600;
    case '4h':    return Math.floor(seconds / 14400) * 14400;
    case '6h':
    case '6Hutc': return Math.floor(seconds / 21600) * 21600;
    case '12h':
    case '12Hutc':return Math.floor(seconds / 43200) * 43200;
    case '1Dutc': return Math.floor(seconds / 86400) * 86400;
    case '3Dutc': return Math.floor(seconds / 259200) * 259200;
    case '1Wutc': {
      const date = new Date(seconds * 1000);
      const day = date.getUTCDay();
      const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
      return Math.floor(monday.getTime() / 1000);
    }
    case '1Mutc': {
      const date = new Date(seconds * 1000);
      const firstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      return Math.floor(firstDay.getTime() / 1000);
    }
    default: return Math.floor(seconds / 60) * 60;
  }
}

export default function CoinChartPage({ active = true, routeActive = true, symbol, onSelectSymbol, productType, exchange = 'BITGET', tickDecimals = 2, onExchangeChange, onProductTypeChange, focusTracker }: Props) {
  const isBinance = exchange === 'BINANCE';

  const handleSelectFixed = (sym: string, ex: 'BITGET' | 'BINANCE', futures: boolean) => {
    onSelectSymbol(sym);
    onExchangeChange?.(ex);
    onProductTypeChange?.(futures ? 'USDT-FUTURES' : undefined);
  };
  const isFutures = !!productType;
  
  const { precisionMap, getTickDecimals } = usePricePrecision(tickDecimals);
  const actualTickDecimals = useMemo(() => {
    if (precisionMap.size === 0) return tickDecimals;
    const key = (isBinance && isFutures) ? 'BN_' + symbol : symbol;
    return getTickDecimals(key);
  }, [getTickDecimals, precisionMap, isBinance, isFutures, symbol, tickDecimals]);

  const loadCandles = useCandleLoader({ symbol, productType, exchange });
  const [hoveredCandle, setHoveredCandle] = useState<{ key: string; candle: Candle | null } | null>(null);

  const [timeframe, setTimeframe] = useState<TimeframeOption>({ label: '1일', value: '1d', granularity: '1Dutc', channel: 'candle1Dutc', category: 'day' });
  if (!isTimeframeSupported(exchange, timeframe.value)) {
    setTimeframe(CHART_TIMEFRAMES['1d']);
  }
  const [observedRouteActive, setObservedRouteActive] = useState(false);
  const [highlightActive, setHighlightActive] = useState(true);
  const [appliedFocusTfKey, setAppliedFocusTfKey] = useState<string | null>(null);
  const focusKey = focusTracker?.symbol === symbol ? `${focusTracker.symbol}|${focusTracker.signature ?? focusTracker.obTime}` : null;
  const trackerSelectionPending = focusKey !== null && appliedFocusTfKey !== focusKey;
  if (trackerSelectionPending) {
    setAppliedFocusTfKey(focusKey);
    setHighlightActive(true);
    const nextTimeframe = focusTracker ? timeframeForTracker(focusTracker) : null;
    if (nextTimeframe && nextTimeframe.value !== timeframe.value) setTimeframe(nextTimeframe);
  }
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSymbolSheetOpen, setIsSymbolSearchOpen] = useState(false);
  const [isLogScale, setIsLogScale] = usePersistentState('chart_log_scale', true);

  // 드로잉
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isDrawingPanelOpen, setIsDrawingPanelOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalysisHubOpen, setIsAnalysisHubOpen] = useState(false);
  const [isObjectTreeOpen, setIsObjectTreeOpen] = useState(false);
  const [objectTreeManager, setObjectTreeManager] = useState<DrawingManager | null>(null);
  const closeObjectTree = () => {
    setIsObjectTreeOpen(false);
    setObjectTreeManager(null);
  };
  const chartRef = useRef<MarketChartRef>(null);

  // 보조지표
  const [isIndicatorSheetOpen, setIsIndicatorSheetOpen] = useState(false);
  // 지표 on/off 상태를 종목 이동·새로고침에도 유지 (전역 공통)
  const [indicatorSettings, setIndicatorSettings] = usePersistentState<IndicatorSettings>('chart_indicators', {
    '1M': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1W': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '3D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  }, true);
  const desiredPriceKey = priceKey(exchange, isFutures, symbol);
  const {
    mtfCandles,
    mtfKey,
    settingsKey: mtfSettingsKey,
    status: mtfStatus,
    missing: missingMtf,
    retryMtf,
  } = useMtfCandles(symbol, indicatorSettings, loadCandles, true, desiredPriceKey);
  const [obOptions] = useState<OBOptions>(DEFAULT_OB_OPTIONS);

  // 차트 테마 (localStorage 우선, 쿠키 폴백)
  const [chartTheme, setChartTheme] = useChartTheme(PRESET_THEMES[0]);

  const [maSettings, setMaSettings] = usePersistentState<MASetting[]>('chart_ma_settings', DEFAULT_MA_SETTINGS);
  const [bbSetting, setBbSetting] = usePersistentState<BBSetting>('chart_bb_setting', DEFAULT_BB_SETTING, true);
  const [pivotSetting, setPivotSetting] = usePersistentState<PivotSetting>('chart_pivot_setting', DEFAULT_PIVOT_SETTING, true);
  const initialCandleLimit = useMemo(() => {
    if (!focusTracker) return DEFAULT_CANDLE_LIMIT;
    const focusTimeframe = timeframeForTracker(focusTracker) ?? timeframe;
    return getFocusCandleLimit(focusTracker, focusTimeframe.granularity);
  }, [focusTracker, timeframe]);

  const {
    candles,
    candlesKey,
    livePrice,
    dailyOpenPrice,
    requestKey,
    status: candleStatus,
    retryCandles,
    refreshCandles,
    handleVisibleRangeChange,
  } = useCoinCandles({
    symbol,
    productType,
    isBinance,
    isFutures,
    timeframe,
    loadCandles,
    fallbackCandles: EMPTY_CANDLES,
    getBucketTime,
    initialLimit: initialCandleLimit,
    active,
    clearOnSymbolChange: false, // 종목 전환 시 새 캔들 도착까지 이전 캔들 유지 — 빈 차트 플래시 방지(웹과 동일)
    exchange,
  });

  const desiredKey = chartKey(exchange, isFutures, symbol, timeframe.granularity);
  const candidate = useMemo<DisplayPacket | null>(() => {
    if (
      candleStatus !== 'ready'
      || requestKey !== desiredKey
      || candlesKey !== desiredKey
      || mtfStatus !== 'settled'
      || mtfKey !== desiredPriceKey
      || trackerSelectionPending
    ) return null;
    return {
      key: desiredKey,
      settingsKey: mtfSettingsKey,
      selection: { symbol, productType, exchange, timeframe },
      candles,
      livePrice,
      dailyOpenPrice,
      mtfCandles,
      indicatorSettings,
      maSettings,
      bbSetting,
      pivotSetting,
      focusTracker: focusTracker?.symbol === symbol ? focusTracker : null,
      highlightTracker: highlightActive && focusTracker?.symbol === symbol ? focusTracker : null,
      tickDecimals: actualTickDecimals,
    };
  }, [actualTickDecimals, bbSetting, candleStatus, candles, candlesKey, dailyOpenPrice, desiredKey, desiredPriceKey, exchange, focusTracker, highlightActive, indicatorSettings, livePrice, maSettings, mtfCandles, mtfKey, mtfSettingsKey, mtfStatus, pivotSetting, productType, requestKey, symbol, timeframe, trackerSelectionPending]);
  const [displayPacket, setDisplayPacket] = useState<DisplayPacket | null>(null);
  const routeEntered = routeActive && !observedRouteActive;
  const entryChanged = routeEntered;
  const resetForEntry = entryChanged && displayPacket !== null && displayPacket.key !== desiredKey;
  if (observedRouteActive !== routeActive) setObservedRouteActive(routeActive);
  if (resetForEntry) {
    setDisplayPacket(null);
    setActiveTool(null);
    setIsDrawingPanelOpen(false);
    setIsObjectTreeOpen(false);
    setObjectTreeManager(null);
    setCanUndo(false);
    setCanRedo(false);
  } else if (candidate && displayPacket !== candidate) setDisplayPacket(candidate);
  const retainedPacket = resetForEntry ? null : displayPacket;
  const visiblePacket = candidate && retainedPacket && candidate.key === retainedPacket.key && candidate.settingsKey === retainedPacket.settingsKey
    ? candidate
    : retainedPacket;
  const entrySelection = routeActive ? { symbol, productType, exchange, timeframe } : undefined;
  const displaySelection = visiblePacket?.selection ?? entrySelection;
  const displayCandles = visiblePacket?.candles ?? EMPTY_CANDLES;
  const displayMtfCandles = visiblePacket?.mtfCandles ?? EMPTY_MTF_CANDLES;
  const displayTickDecimals = visiblePacket?.tickDecimals ?? tickDecimals;
  const displayLivePrice = visiblePacket?.livePrice ?? null;
  const displayDailyOpenPrice = visiblePacket?.dailyOpenPrice ?? null;
  const displayKey = visiblePacket?.key ?? '';
  const chartSymbol = visiblePacket?.selection.symbol;
  const drawingStorage = visiblePacket
    ? getDrawingStorageKeys('mobile', visiblePacket.selection.exchange, visiblePacket.selection.productType, visiblePacket.selection.symbol)
    : undefined;
  const pending = !candidate || displayKey !== desiredKey || visiblePacket?.settingsKey !== mtfSettingsKey;
  const interactionBlocked = pending || candleStatus === 'error' || !visiblePacket;
  const interactionBlockedRef = useRef(interactionBlocked);
  useLayoutEffect(() => { interactionBlockedRef.current = interactionBlocked; }, [interactionBlocked]);
  const [wasInteractionBlocked, setWasInteractionBlocked] = useState(interactionBlocked);
  if (wasInteractionBlocked !== interactionBlocked) {
    setWasInteractionBlocked(interactionBlocked);
    if (interactionBlocked) {
      setActiveTool(null);
      setIsDrawingPanelOpen(false);
      setIsObjectTreeOpen(false);
      setObjectTreeManager(null);
      setCanUndo(false);
      setCanRedo(false);
    }
  }
  const changeAbs = displayLivePrice !== null && displayDailyOpenPrice !== null ? displayLivePrice - displayDailyOpenPrice : null;
  const changePercent = displayLivePrice !== null && displayDailyOpenPrice !== null ? ((displayLivePrice - displayDailyOpenPrice) / displayDailyOpenPrice) * 100 : null;
  const isUp = changePercent !== null ? changePercent >= 0 : null;
  const displayedCandle = (hoveredCandle?.key === displayKey ? hoveredCandle.candle : null) || displayCandles[displayCandles.length - 1];
  const displaySymbol = displaySelection?.symbol;
  const displayIsBinance = displaySelection?.exchange === 'BINANCE';
  const baseSymbol = displaySymbol ? getBaseSymbol(displaySymbol) : '';

  const chartSurfaceRef = useRef<HTMLElement>(null);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled && typeof HTMLElement.prototype.requestFullscreen === 'function';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const toggleFullscreen = async () => {
    if (!chartSurfaceRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await chartSurfaceRef.current.requestFullscreen();
  };

  const shareChart = async () => {
    if (!displaySymbol || !canShare) return;
    await navigator.share({ title: document.title, url: window.location.href });
  };

  useEffect(() => {
    if (!active || !displaySymbol || !displaySelection) return;
    const name = displaySelection.productType ? `${displaySymbol}.P` : displaySymbol;
    const price = displayLivePrice !== null ? formatPrice(displayLivePrice, displayTickDecimals) : '—';
    const rate = changePercent !== null ? ` (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)` : '';
    document.title = `${name} ${price}${rate}`;
  }, [active, changePercent, displayLivePrice, displaySelection, displaySymbol, displayTickDecimals]);

  const displayFocusTracker = visiblePacket?.focusTracker ?? null;
  const displayHighlightTracker = visiblePacket?.highlightTracker ?? null;

  // 카드 클릭 시 해당 패턴 시간창으로 차트를 한 번 이동시킨다.
  // 패턴 자체는 자동 하모닉 지표가 그리고, 여기선 가시 영역만 맞춘다.
  // 라이브 캔들 갱신마다 다시 튀지 않도록 패턴 키가 바뀔 때만 스크롤한다.
  const lastFocusKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!displayFocusTracker || displayFocusTracker.symbol !== displaySymbol || !displayCandles.length || !displaySelection) return;
    const trackerTimeframe = timeframeForTracker(displayFocusTracker);
    if (pending || (trackerTimeframe && trackerTimeframe.value !== displaySelection.timeframe.value)) return;
    if (!highlightActive) return; // 수동 TF 변경(강조 off) 후엔 패턴 창으로 재스크롤하지 않음 — 하위 TF에서 옛 패턴 시작점으로 튀는 버그 방지
    const x = displayFocusTracker.xabc;
    if (!x) return;
    const startT = x.X?.time ?? x.A?.time;
    // 워커 xabc엔 D가 없음(예측 PRZ). 탐색(미터치)은 예측 D가 현재 근처에 그려지므로
    // 프레임 끝을 "마지막 캔들"까지 잡아 PRZ가 화면 밖으로 잘리지 않게 한다.
    const lastT = Number(displayCandles[displayCandles.length - 1].time);
    const frameEndT = displayFocusTracker.exitTime ?? displayFocusTracker.przHitTime ?? lastT;
    // 키는 패턴 식별용으로 "안정적인" 끝(C 또는 종료/신호 시각)을 쓴다 — 매 봉 lastT 변화로
    // 화면이 다시 튀지 않게. (signature는 종목 내 모든 패턴이 공유하므로 키에 못 씀)
    const anchorEndT = displayFocusTracker.exitTime ?? displayFocusTracker.przHitTime ?? x.C?.time;
    if (!startT || !anchorEndT) return;
    const key = `${displayFocusTracker.symbol}|${displaySelection.timeframe.value}|${startT}|${anchorEndT}`;
    if (lastFocusKeyRef.current === key) return;
    lastFocusKeyRef.current = key;
    // 패턴 시간 창을 넘기면 MarketChart가 현재 캔들 기준으로 인덱스를 계산해 맞춘다.
    chartRef.current?.focusTimeWindow(startT, frameEndT, 0.2);
  }, [displayCandles, displayFocusTracker, displaySelection, displaySymbol, highlightActive, pending]);

  function handleToolSelect(toolType: string | null) {
    if (interactionBlockedRef.current) return;
    setActiveTool(toolType);
  }

  return (
    <PullToRefresh onRefresh={async () => { setHighlightActive(false); await refreshCandles(); requestAnimationFrame(() => chartRef.current?.resetView()); }} excludeSelector=".chart-only-surface" indicatorTop="env(safe-area-inset-top, 0px)" fill>
    <main className="coin-chart-page" style={getThemeCssVars(chartTheme)}>
      <header className="chart-symbol-bar">
        <div className="chart-symbol-main">
          <div className="chart-symbol-left">
            {displaySymbol ? (
              <>
                <span className="chart-coin-logo" style={{ background: getChartLogoColor(baseSymbol) }}>
                  <span className="chart-coin-logo-fallback">{baseSymbol.slice(0, 1)}</span>
                  <img
                    key={displaySymbol}
                    src={getChartLogoUrl(baseSymbol)}
                    alt={baseSymbol}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                </span>
                <span className="chart-symbol-name">{displaySelection.productType ? `${displaySymbol}.P` : displaySymbol}</span>
                <span className={`chart-exchange-badge ${displayIsBinance ? 'is-binance' : 'is-bitget'}`}>
                  <img className="chart-exchange-logo" src={EXCHANGES[displaySelection.exchange].logo} alt="" aria-hidden="true" />
                  <span className="chart-exchange-name">{EXCHANGES[displaySelection.exchange].label}</span>
                </span>
              </>
            ) : <span className="chart-symbol-name">—</span>}
          </div>
        </div>
        <div className="chart-symbol-right">
          <span className="chart-live-price">
            {displayLivePrice !== null ? formatPrice(displayLivePrice, displayTickDecimals) : '—'}
          </span>
          {changeAbs !== null && changePercent !== null && (
            <span className={`chart-change-info ${isUp ? 'up' : 'down'}`}>
              {isUp ? '+' : ''}{formatPrice(changeAbs, displayTickDecimals)} {isUp ? '+' : ''}{changePercent.toFixed(2)}%
            </span>
          )}
        </div>
      </header>

      <section ref={chartSurfaceRef} className="chart-only-surface" style={{ position: 'relative' }}>
        {displayedCandle && (
          <div className="chart-overlay-ohlc">
            <div className="ohlc-values-row">
              <span>시 <em>{formatPrice(displayedCandle.open, displayTickDecimals)}</em></span>
              <span>고 <em>{formatPrice(displayedCandle.high, displayTickDecimals)}</em></span>
              <span>저 <em>{formatPrice(displayedCandle.low, displayTickDecimals)}</em></span>
              <span>종 <em>{formatPrice(displayedCandle.close, displayTickDecimals)}</em></span>
            </div>
            {(() => {
              const change = displayedCandle.close - displayedCandle.open;
              const changePercent = (change / displayedCandle.open) * 100;
              const isBull = change >= 0;
              return (
                <div className={`ohlc-change-row ${isBull ? 'up' : 'down'}`}>
                  {isBull ? '+' : ''}{formatPrice(change, displayTickDecimals)} ({isBull ? '+' : ''}{changePercent.toFixed(2)}%)
                </div>
              );
            })()}
          </div>
        )}
        <MarketChart
          ref={chartRef}
          candles={displayCandles}
          symbol={chartSymbol}
          period={displaySelection?.timeframe.value}
          marketKey={displaySelection ? `${displaySelection.exchange}-${displaySelection.productType ?? 'spot'}` : undefined}
          variant="light"
          className={`full-chart${visiblePacket ? '' : ' chart-entry-blank'}`}
          isLogScale={isLogScale}
          showPriceLine
          activeTool={visiblePacket ? activeTool : null}
          onToolChange={visiblePacket ? setActiveTool : undefined}
          drawingStorageKey={drawingStorage?.key}
          legacyDrawingStorageKey={drawingStorage?.legacyKey}
          interactionBlocked={interactionBlocked}
          chartTheme={chartTheme}
          tickDecimals={displayTickDecimals}
          indicatorSettings={visiblePacket?.indicatorSettings ?? indicatorSettings}
          indicatorLayers={
            (['1M', '1W', '3D', '1D'] as TFKey[])
              .filter(tf => !!displayMtfCandles[tf])
              .map(tf => ({ tf, candles: displayMtfCandles[tf]! } satisfies IndicatorLayer))
          }
          currentTfSeconds={displaySelection ? getIntervalSeconds(displaySelection.timeframe.granularity) : 0}
          active={active}
          obOptions={obOptions}
          onCrosshairMove={(candle) => setHoveredCandle({ key: displayKey, candle })}
          onVisibleRangeChange={pending ? undefined : handleVisibleRangeChange}
          onHistoryChange={visiblePacket ? (status) => {
            setCanUndo(status.canUndo);
            setCanRedo(status.canRedo);
          } : undefined}
          maSettings={visiblePacket?.maSettings ?? maSettings}
          bbSetting={visiblePacket?.bbSetting ?? bbSetting}
          pivotSetting={visiblePacket?.pivotSetting ?? pivotSetting}
          focusTracker={displayFocusTracker}
          highlightTracker={displayHighlightTracker}
        />
        <ChartLoadStatus
          pending={pending}
          error={candleStatus === 'error'}
          missing={mtfStatus === 'settled' && mtfKey === desiredPriceKey ? missingMtf : undefined}
          target={`${symbol} ${timeframe.label}`}
          onRetry={() => { retryCandles(); retryMtf(); }}
        />
      </section>

      <DrawingSheet
        isOpen={isDrawingPanelOpen && !interactionBlocked}
        onClose={() => setIsDrawingPanelOpen(false)}
        activeTool={activeTool}
        onSelectTool={handleToolSelect}
        onClearAll={() => { if (!interactionBlocked) chartRef.current?.clearAll(); }}
      />

      <IndicatorSheet
        isOpen={isIndicatorSheetOpen}
        onClose={() => setIsIndicatorSheetOpen(false)}
        settings={indicatorSettings}
        onChange={setIndicatorSettings}
        maSettings={maSettings}
        onMaSettingsChange={setMaSettings}
        bbSetting={bbSetting}
        onBbSettingChange={setBbSetting}
        pivotSetting={pivotSetting}
        onPivotSettingChange={setPivotSetting}
      />

      <div className="chart-tool-strip">
        <div className="tool-fixed-area">
          <div className="tool-group symbol-time">
            <strong onClick={() => setIsSymbolSearchOpen(true)}>{displaySymbol ? (displaySelection?.productType ? `${displaySymbol}.P` : displaySymbol) : '—'}</strong>
            <span onClick={() => setIsSheetOpen(true)}>{displaySelection?.timeframe.label ?? '—'}</span>
          </div>
          <div className="tool-divider tool-divider--flush" />
        </div>

        <div className="tool-icons-wrapper">
          <div className="tool-scroll-container">
            {/* 그리기 */}
            <button
              className={`tool-btn ${isDrawingPanelOpen || (activeTool && activeTool !== 'cursor') ? 'active' : ''}`}
              title="그리기"
              disabled={interactionBlocked}
              onClick={() => { if (!interactionBlocked) setIsDrawingPanelOpen(prev => !prev); }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                <path d="m15 5 4 4"/>
              </svg>
            </button>


            {/* 보조지표 */}
            <button
              className={`tool-btn ${isIndicatorSheetOpen || Object.values(indicatorSettings).some(s => isRecord(s) && (s.showOB || s.showOBBox || s.showFVG || s.showCE || s.showEQ)) ? 'active' : ''}`}
              title="보조지표"
              onClick={() => setIsIndicatorSheetOpen(prev => !prev)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4v16h16" strokeWidth="1.5"/>
                <path d="M6.5 15.5 11 11l3 2.2 5-6v8.3z" fill="currentColor" fillOpacity="0.7"/>
              </svg>
            </button>

            {/* 더보기 (분석 허브) */}
            <button className={`tool-btn ${isAnalysisHubOpen ? 'active' : ''}`} title="더보기" disabled={interactionBlocked} onClick={() => setIsAnalysisHubOpen(prev => !prev)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
              </svg>
            </button>

            <div className="tool-divider" />

            {/* 되돌리기 */}
            <button 
              className={`tool-btn history-tool-btn ${!canUndo ? 'disabled' : ''}`} 
              title="되돌리기" 
              onClick={() => { if (!interactionBlocked) chartRef.current?.undo(); }}
              disabled={interactionBlocked || !canUndo}
              aria-disabled={interactionBlocked || !canUndo}
            >
              <svg width="20" height="20" style={{ transform: 'translateY(-1px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 7.5 4.5 12 9 16.5"/>
                <path d="M4.5 12h8.8c4.1 0 6.2 2.7 6.2 6.2"/>
              </svg>
            </button>

            {/* 전체화면 */}
            <button className="tool-btn" title={canFullscreen ? '전체화면' : '이 브라우저는 전체화면을 지원하지 않습니다.'} disabled={!canFullscreen} onClick={() => void toggleFullscreen().catch(() => {})}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H6a3 3 0 0 0-3 3v3"/>
                <path d="M21 9V6a3 3 0 0 0-3-3h-3"/>
                <path d="M3 15v3a3 3 0 0 0 3 3h3"/>
                <path d="M15 21h3a3 3 0 0 0 3-3v-3"/>
              </svg>
            </button>

            {/* 앞으로 */}
            <button 
              className={`tool-btn history-tool-btn ${!canRedo ? 'disabled' : ''}`} 
              title="앞으로" 
              onClick={() => { if (!interactionBlocked) chartRef.current?.redo(); }}
              disabled={interactionBlocked || !canRedo}
              aria-disabled={interactionBlocked || !canRedo}
            >
              <svg width="20" height="20" style={{ transform: 'translateY(-1px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 7.5 19.5 12 15 16.5"/>
                <path d="M19.5 12h-8.8c-4.1 0-6.2 2.7-6.2 6.2"/>
              </svg>
            </button>

            <div className="tool-divider" />

            {/* 공유하기 */}
            <button className="tool-btn" title={canShare ? '공유하기' : '이 브라우저는 공유를 지원하지 않습니다.'} disabled={!canShare || !visiblePacket} onClick={() => void shareChart().catch(() => {})}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v6.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V12"/>
                <polyline points="16 7 12 3.5 8 7"/>
                <line x1="12" y1="3.5" x2="12" y2="15"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <TimeframeSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        selectedTimeframe={timeframe.value}
        exchange={exchange}
        onSelect={(tf) => { setHighlightActive(false); setTimeframe(tf); }}
      />

      <ChartSettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={chartTheme}
        onThemeChange={setChartTheme}
        isLogScale={isLogScale}
        onLogScaleToggle={() => setIsLogScale(!isLogScale)}
      />

      <AnalysisHubSheet
        isOpen={isAnalysisHubOpen}
        onClose={() => setIsAnalysisHubOpen(false)}
        onOpenIndicators={() => setIsIndicatorSheetOpen(true)}
        onOpenChartSettings={() => setIsSettingsOpen(true)}
        onOpenObjectTree={() => {
          if (!visiblePacket) return;
          setObjectTreeManager(chartRef.current?.getDrawingManager() ?? null);
          setIsObjectTreeOpen(true);
        }}
      />

      <ObjectTreeSheet
        isOpen={isObjectTreeOpen}
        onClose={closeObjectTree}
        manager={objectTreeManager}
        onSelectDrawing={(id) => {
          chartRef.current?.selectDrawing(id);
          closeObjectTree();
        }}
      />

      <SymbolSearchSheet
        isOpen={isSymbolSheetOpen}
        onClose={() => setIsSymbolSearchOpen(false)}
        onSelect={onSelectSymbol}
        onSelectFixed={handleSelectFixed}
        exchange={isBinance ? 'BINANCE' : 'BITGET'}
        isFutures={isFutures}
      />
    </main>
    </PullToRefresh>
  );
}
