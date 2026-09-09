import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser } from '../../api/server/authApi';
import { useCoinLogos } from './panels/marketShared';
import { WatchlistPanel } from './panels/WatchlistPanel';
import { useMainTrade } from '../../hooks/account/useMainTrade';
import { useUsdKrw } from '../../hooks/market/useUsdKrw';
import { useRealtimePrices } from '../../hooks/market/useRealtimePrices';
import { useDelayedReady } from '../../hooks/ui/useDelayedReady';

import type { TrackerState } from '../../shared/types/bot';
import { DEFAULT_RSI_SETTINGS } from '../../shared/utils/rsiCandles';
import type { RsiSettings } from '../../shared/utils/rsiCandles';
import { usePersistentState } from '../../hooks/ui/usePersistentState';
import { useMtfCandles } from '../../chart/hooks/useMtfCandles';
import { DEFAULT_OB_OPTIONS } from '../../chart/analysis/chartIndicators';
import type { OBOptions } from '../../chart/overlays/ChartOverlay';
import { useSpotTrade } from '../../hooks/account/useSpotTrade';
import type { MainPosition } from '../../api/server/mainTradeApi';
import type { SpotHolding } from '../../api/server/spotTradeApi';
import type { Candle } from '../../shared/types/market';
import { TF, UNSUPPORTED_TF } from './lib/timeframes';
import { fmtAsset } from './lib/format';
import { DesktopHeader } from './panels/DesktopHeader';
import { IconRail } from './panels/IconRail';
import { Sidebar } from './panels/Sidebar';
import { type Section, type InvestTab } from './lib/sections';
import { useDesktopCandles } from './hooks/useDesktopCandles';
import { useLivePrice } from '../../hooks/market/useLivePrice';
import { useCandleLoader } from '../../chart/hooks/useCandleLoader';
import { chartKey, priceKey } from '../../chart/hooks/marketKey';
import { useOrderbookSnapshot } from './hooks/useOrderbookSnapshot';
import { useHeaderSnapshot } from './hooks/useHeaderSnapshot';
import { useDrawingState } from './hooks/useDrawingState';
import { useIndicatorState } from './hooks/useIndicatorState';
import { useChartViewState } from './hooks/useChartViewState';
import type { MarketChartRef } from '../../chart/MarketChart';
import { SymbolHeader } from './panels/SymbolHeader';
import { ChartToolbar } from './panels/ChartToolbar';
import { ChartStage } from './panels/ChartStage';
import { OrderbookPanel } from './panels/OrderbookPanel';
import { RightPanel } from './panels/RightPanel';
import './DesktopApp.css';

// ── 데스크톱 웹 — 모바일 훅/컴포넌트를 그대로 재사용해 같은 데이터를 다룸(화면만 다름) ──
// 실데이터: 내 투자(선물=useMainTrade, 현물=useSpotTrade) · 호가(useOrderbook) · 차트(useCoinCandles)
//           · 마켓 리스트(useMarketTickers, BITGET 현물).
// 목업: 커뮤니티 채팅 / 헤더 검색(요청상 보류).

export default function DesktopApp({ user, onLoginClick, onLogout }: { user: AuthUser | null; onLoginClick: () => void; onLogout: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mountOpenRaf = useRef(0);
  // 새로고침 시 닫힌 상태로 1프레임 그린 뒤 열어 width 트랜지션(열림 모션)을 재생
  useEffect(() => {
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setSidebarOpen(true));
      mountOpenRaf.current = r2;
    });
    mountOpenRaf.current = r1;
    return () => cancelAnimationFrame(mountOpenRaf.current);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // 로그인 시 내투자, 비로그인 시 공개 섹션(실시간 마켓)으로 시작
  const [section, setSection] = useState<Section>(user ? 'invest' : 'market');
  const [krw, setKrw] = useState(true);
  const [investTab, setInvestTab] = useState<InvestTab>('선물');
  const [walletOpen, setWalletOpen] = useState(false);
  const [portfolioOn, setPortfolioOn] = useState(true);
  const [positionsOn, setPositionsOn] = useState(true);
  const [selPosIdx, setSelPosIdx] = useState(0);
  // ── 차트 상태 훅 : 드로잉 · 지표 · 보기. 툴바·무대 컴포넌트가 이 묶음을 그대로 받는다 ──
  const isAdmin = user?.role === 'ADMIN';
  const draw = useDrawingState();
  const { drawOpen, setDrawOpen, drawRef } = draw; // 드롭다운 바깥 클릭 effect용
  const indi = useIndicatorState({ indiOff: !isAdmin });
  const { indiOpen, setIndiOpen, indiRef, effIndicatorSettings } = indi; // effIndicatorSettings는 useMtfCandles 입력
  const view = useChartViewState({ loggedIn: !!user });
  const { activeTf, setActiveTf, chartSetOpen, setChartSetOpen, chartSetRef } = view;
  // RSI 캔들 지표(하단 페인) 토글 + 설정 — 새로고침에도 유지
  const [rsiOn, setRsiOn] = usePersistentState('web_rsi_candles', false);
  // 신뢰도 랭킹 선(임시) — 마스터 + 체급별 토글
  const [rankMasterOn, setRankMasterOn] = usePersistentState('web_rank_lines', false);
  const [rankTiers, setRankTiers] = usePersistentState<Record<string, boolean>>('web_rank_tiers', { '1M': true, '1W': true, '3D': false, '1d': false });
  const [rsiSettings, setRsiSettings] = usePersistentState<RsiSettings>('web_rsi_settings', DEFAULT_RSI_SETTINGS);
  const [rsiSettingsOpen, setRsiSettingsOpen] = useState(false);
  const chartRef = useRef<MarketChartRef>(null);

  const bothOn = portfolioOn && positionsOn;

  // 프로필 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // 차트 드롭다운(그리기/지표/차트설정) 바깥 클릭 시 닫기
  useEffect(() => {
    if (!indiOpen && !chartSetOpen && !drawOpen) return;
    const onDown = (e: MouseEvent) => {
      if (indiRef.current && !indiRef.current.contains(e.target as Node)) setIndiOpen(false);
      if (chartSetRef.current && !chartSetRef.current.contains(e.target as Node)) setChartSetOpen(false);
      if (drawRef.current && !drawRef.current.contains(e.target as Node)) setDrawOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [indiOpen, chartSetOpen, drawOpen, indiRef, chartSetRef, drawRef, setIndiOpen, setChartSetOpen, setDrawOpen]);

  // ── 실데이터 — 총자산/포지션 (모바일과 동일 세션) ──
  const { data: trade } = useMainTrade(section === 'invest' && sidebarOpen);
  const usdKrw = useUsdKrw();
  const { hasKey, positions, available, equity } = trade;
  // 모바일과 동일: 데이터(equity>0) 도착 전까지 스켈레톤, 빈 계정은 1500ms 폴백
  const mainReady = useDelayedReady(equity > 0);
  const unrealTotal = positions.reduce((s, p) => s + p.unrealizedPl, 0);

  const curLabel = krw ? '원' : 'USDT';
  const mainVal = !hasKey ? '—' : krw ? Math.round(equity * usdKrw).toLocaleString() : fmtAsset(equity);
  const approx = !hasKey ? '' : krw
    ? `≈ ${fmtAsset(equity)} USDT`
    : `≈ ${Math.round(equity * usdKrw).toLocaleString()}원`;
  // 통화 연동 금액 포맷
  const fmtCur = (usdt: number) => krw
    ? `${Math.round(usdt * usdKrw).toLocaleString()}원`
    : `${usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const approxCur = (usdt: number) => krw
    ? `≈ ${usdt.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`
    : `≈ ${Math.round(usdt * usdKrw).toLocaleString()}원`;
  const selPos: MainPosition | undefined = positions[selPosIdx] ?? positions[0];

  // ── 차트/호가 선택 종목 (실시간 마켓 클릭 시 변경). 지원: BITGET/BINANCE/UPBIT/BITHUMB ──
  const [chartSel, setChartSel] = useState<{ symbol: string; exchange: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB'; isFutures: boolean }>({
    symbol: 'BTCUSDT', exchange: 'BINANCE', isFutures: true,
  });
  const CHART_SYMBOL = chartSel.symbol;
  const chartIsBinance = chartSel.exchange === 'BINANCE';
  const chartIsKrw = chartSel.exchange === 'UPBIT' || chartSel.exchange === 'BITHUMB';
  const chartIsFutures = chartSel.isFutures;

  // (탭 타이틀 effect는 pxDecimals 선언 뒤 — livePrice(거래소 티커 WS) 기반으로 실시간 갱신)

  const CHART_PRODUCT = (chartIsFutures && !chartIsKrw) ? 'USDT-FUTURES' : undefined; // KRW 거래소는 현물만
  const chartBase = CHART_SYMBOL.replace(/USDT$|USDC$|KRW$/, '');
  const coinLogos = useCoinLogos(); // 백엔드 gecko 로고맵(실시간 마켓과 동일 소스)
  // ── 모니터링 패턴 solo 포커스 ──
  // 클릭한 패턴만 원색, 나머지 흐림. TF 바꿔도 유지, 종목 바꾸거나 직접 끌 때만 해제.
  const [focusTracker, setFocusTracker] = useState<TrackerState | null>(null);
  const [soloActive, setSoloActive] = useState(false);
  // 사용자가 solo에서 수동으로 팬/줌한 시간범위(raw 캔들시간 도메인). TF 바뀔 때 이게 있으면
  // 패턴(X~D) 자동 프레이밍 대신 이 범위를 복원 — "움직인 위치가 고정되어 TF 넘어가도 유지".
  // 새 패턴 클릭·solo 종료 시 초기화(그 패턴은 기본 프레이밍부터 다시 시작).
  const soloUserViewRef = useRef<{ from: number; to: number } | null>(null);
  // 종목이 포커스 패턴과 달라지면(수동 종목 변경) 해제. 거래소·마켓·TF만 바뀌면 유지.
  const handleSelectChart = useCallback((symbol: string, market: string, exchange: string) => {
    const ex = exchange as 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';
    if (soloActive && focusTracker && focusTracker.symbol !== symbol) {
      setSoloActive(false);
      setFocusTracker(null);
      soloUserViewRef.current = null;
      chartRef.current?.resetPriceAutoScale();
    }
    setChartSel({ symbol, exchange: ex, isFutures: (ex === 'UPBIT' || ex === 'BITHUMB') ? false : market === 'futures' });
  }, [focusTracker, setFocusTracker, setSoloActive, soloActive]);
  const soloOn = soloActive && focusTracker?.symbol === CHART_SYMBOL;
  const highlightTracker = soloOn ? focusTracker : null;
  const focusScrollKeyRef = useRef<string>('');

  // ── 실데이터 — 로더 → 현재가 → 차트 캔들 → 호가 → 헤더 (: 현재가는 차트 TF·캔들 로드와 무관한 useLivePrice에서) ──
  // livePrice: 거래소 티커 seed(REST last) + 티커 WS. dailyOpenPrice: 캔들 1Dutc 시가(Binance 티커 openPrice는 24h 롤링이라 쓰지 않음, 사용자 결정).
  // priceReady: 현재 선택(거래소|현선물|심볼)의 현재가·일봉 시가 seed 완료 여부(스테이지드 스왑, : 심볼 → 키).
  const loadCandles = useCandleLoader({ symbol: CHART_SYMBOL, productType: CHART_PRODUCT, exchange: chartSel.exchange });
  const loadDailyOpen = useCallback(() => loadCandles('1Dutc', 2).then((cs) => cs[cs.length - 1]?.open ?? null), [loadCandles]);
  const [priceReloadKey, setPriceReloadKey] = useState(0);
  const { price: livePrice, dailyOpen: dailyOpenPrice, ready: priceReady, status: priceStatus } = useLivePrice({
    symbol: CHART_SYMBOL, exchange: chartSel.exchange, isFutures: chartIsFutures, loadDailyOpen,
    reloadKey: priceReloadKey,
  });
  const candleLoad = useDesktopCandles({
    activeTf, symbol: CHART_SYMBOL, productType: CHART_PRODUCT, exchange: chartSel.exchange, isBinance: chartIsBinance, isFutures: chartIsFutures, loadCandles,
  });
  const { timeframe, candles, candlesKey, handleVisibleRangeChange } = candleLoad;
  // 현재 선택의 마켓 키 — 캔들·지표 스테이징이 '내 데이터가 이 선택 것인지'를 이 키로 판정한다
  const currentPriceKey = priceKey(chartSel.exchange, chartIsFutures, CHART_SYMBOL);
  const currentChartKey = chartKey(chartSel.exchange, chartIsFutures, CHART_SYMBOL, timeframe.granularity);
  const [depthOpen, setDepthOpen] = useState(false); // 자릿수(묶음) 선택 드롭다운
  const ob = useOrderbookSnapshot({
    symbol: CHART_SYMBOL, exchange: chartSel.exchange, isFutures: chartIsFutures, isKrw: chartIsKrw, livePrice, priceReady,
  });
  const { krwDec, getTickDecimals } = ob; // 차트 소수점 스테이징·fmtPx가 씀
  // solo 포커스: 그 패턴 TF에서 "한 단계 아래"까지만 TF 선택 허용 (drill-down 노이즈 방지)
  // 1D→4H / 4H→30m / 30m→5m / 1W→1D / 1M→1W. 범위=[하한 ~ 패턴TF] 인덱스 구간.
  const soloTfRange = useMemo<string[] | null>(() => {
    if (!soloOn || !focusTracker) return null;
    const kind = String(focusTracker.monitorKind ?? '');
    const patTf = kind.endsWith('_30m') ? '30m' : kind.endsWith('_4h') ? '4H'
      : kind.endsWith('_1d') ? '1D' : kind.endsWith('_1w') ? '1W' : kind.endsWith('_1M') ? '1M' : null;
    if (!patTf) return null;
    const lowerMap: Record<string, string> = { '30m': '5m', '4H': '30m', '1D': '4H', '1W': '1D', '1M': '1W' };
    const lo = TF.indexOf(lowerMap[patTf]); const hi = TF.indexOf(patTf);
    if (lo < 0 || hi < 0) return null;
    return TF.slice(lo, hi + 1);
  }, [soloOn, focusTracker]);
  // 거래소가 지원하는 TF만 노출 + (solo면) 패턴 drill-down 범위로 제한 + 현재 선택이 벗어나면 폴백
  const visibleTFs = TF.filter((t) =>
    !(UNSUPPORTED_TF[chartSel.exchange] ?? []).includes(t) && (!soloTfRange || soloTfRange.includes(t)));
  useEffect(() => {
    if (!visibleTFs.includes(activeTf)) setActiveTf(soloTfRange ? soloTfRange[soloTfRange.length - 1] : '1D');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 거래소·solo 범위가 바뀔 때만 TF를 보정하며 수동 TF 선택은 유지한다.
  }, [chartSel.exchange, soloTfRange]);

  // solo: 시간축 프레이밍 계산+적용을 한 함수로. 기본은 패턴 구간(X~D)으로 TF 바뀔 때마다 다시 맞춤
  // (같은 자리·크기 고정). 사용자가 solo에서 팬/줌해뒀으면(soloUserViewRef) 그 위치를 그대로 복원.
  // 표시 packet이 교체된 뒤 그 packet의 tracker와 TF로 적용한다.
  const frameForTf = useCallback((tracker: TrackerState, tf: string) => {
    const x = tracker.xabc;
    if (!x?.X) return;
    const key = `${tracker.symbol}|${tracker.signature ?? tracker.obTime}|${tf}`;
    focusScrollKeyRef.current = key;
    if (soloUserViewRef.current) {
      const { from, to } = soloUserViewRef.current;
      chartRef.current?.focusTimeWindow(from, to, 0);
      return;
    }
    const fromT = Number(x.X.time);
    const toT = Number(tracker.exitTime ?? tracker.przHitTime ?? x.D?.time ?? x.C?.time ?? fromT);
    if (fromT && toT) chartRef.current?.focusTimeWindow(fromT, toT, 0.3);
  }, []);
  // 차트 소수점도 "표시 중인 캔들(candlesKey)"과 함께만 바뀌게 스테이징 — 데이터보다 소수점이 먼저 바뀌어
  // 옛 캔들이 새 소수점으로 재포맷되며 가격축 폭이 흔들리는 것 방지. KRW는 원(정수)=0.
  // 계산된 자릿수도 아래 완성 packet에 담아 주요 헤더·차트와 함께 표시한다.
  const chartDecimalsTarget = chartIsKrw ? krwDec : getTickDecimals(CHART_SYMBOL);
  const [chartTickDecimals, setChartTickDecimals] = useState(chartDecimalsTarget);
  if (candlesKey === currentChartKey && chartTickDecimals !== chartDecimalsTarget) {
    setChartTickDecimals(chartDecimalsTarget);
  }

  // 관심 미니 시세창 — hidden(숨김) / float(떠있는 창) / dock(왼쪽 사이드바). 비로그인은 관심 잠금이라 항상 숨김.
  const [watchMode, setWatchMode] = usePersistentState<'hidden' | 'float' | 'dock'>('web_watch_mode', 'hidden');
  const effWatchMode = user ? watchMode : 'hidden';
  // dock 슬라이드 애니메이션(사이드바처럼): dock이면 마운트→다음 프레임에 펼침, 벗어나면 접은 뒤 언마운트.
  const dockOpen = effWatchMode === 'dock';
  const [dockRender, setDockRender] = useState(dockOpen);
  const [dockExpanded, setDockExpanded] = useState(dockOpen);
  const [previousDockOpen, setPreviousDockOpen] = useState(dockOpen);
  if (previousDockOpen !== dockOpen) {
    setPreviousDockOpen(dockOpen);
    if (dockOpen) setDockRender(true);
    else setDockExpanded(false);
  }
  useEffect(() => {
    if (dockOpen) {
      let expandRaf = 0;
      const mountRaf = requestAnimationFrame(() => {
        expandRaf = requestAnimationFrame(() => setDockExpanded(true));
      });
      return () => {
        cancelAnimationFrame(mountRaf);
        cancelAnimationFrame(expandRaf);
      };
    }
    const t = setTimeout(() => setDockRender(false), 440); // width transition(0.42s) 후 언마운트
    return () => clearTimeout(t);
  }, [dockOpen]);

  const [obOptions] = useState<OBOptions>(DEFAULT_OB_OPTIONS);
  // atomic: 활성 TF 전부 로드 후 한번에 커밋 + 그 마켓 키(mtfKey) 반환. 표시 중인 차트 캔들(candlesKey)과 같은 선택일 때만 그림.
  const mtfLoad = useMtfCandles(CHART_SYMBOL, effIndicatorSettings, loadCandles, true, currentPriceKey);
  const { mtfCandles, mtfKey } = mtfLoad;

  // 크로스헤어가 가리키는 캔들의 OHLC (없으면 마지막 캔들)
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const pxDecimals = chartIsKrw ? krwDec : getTickDecimals(CHART_SYMBOL);
  const fmtPx = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: pxDecimals, maximumFractionDigits: pxDecimals }));

  // ── 헤더 정보·통합 스냅샷(H) — useHeaderSnapshot ──
  const { H, fmtVol, primaryReady } = useHeaderSnapshot({
    symbol: CHART_SYMBOL, exchange: chartSel.exchange, isFutures: chartIsFutures, base: chartBase,
    loadCandles, livePrice, dailyOpenPrice, priceReady, fmtPx,
  });

  const desiredPacketKey = `${currentChartKey}|${mtfLoad.settingsKey}`;
  const packetReady = candleLoad.status === 'ready' && candleLoad.requestKey === currentChartKey
    && candlesKey === currentChartKey && candles.length > 0
    && priceStatus === 'ready' && priceReady && primaryReady
    && mtfLoad.status === 'settled' && mtfLoad.requestKey === currentPriceKey;
  const nextPacket = packetReady ? {
    key: desiredPacketKey, sel: { ...chartSel, productType: CHART_PRODUCT }, activeTf, visibleTFs, timeframe, candles, candlesKey,
    handleVisibleRangeChange, mtfCandles, mtfKey, missing: mtfLoad.missing,
    chartTickDecimals, header: H, fmtPx, indicatorSettings: effIndicatorSettings,
    maSettings: indi.effMaSettings, bbSetting: indi.effBbSetting, pivotSetting: indi.effPivotSetting,
    soloOn, focusTracker, highlightTracker,
  } : null;
  const [displayPacket, setDisplayPacket] = useState(nextPacket);
  if (nextPacket && (displayPacket?.key !== nextPacket.key
    || displayPacket.candles !== nextPacket.candles || displayPacket.mtfCandles !== nextPacket.mtfCandles
    || JSON.stringify(displayPacket.header) !== JSON.stringify(nextPacket.header)
    || JSON.stringify(displayPacket.indicatorSettings) !== JSON.stringify(nextPacket.indicatorSettings)
    || JSON.stringify(displayPacket.maSettings) !== JSON.stringify(nextPacket.maSettings)
    || JSON.stringify(displayPacket.bbSetting) !== JSON.stringify(nextPacket.bbSetting)
    || JSON.stringify(displayPacket.pivotSetting) !== JSON.stringify(nextPacket.pivotSetting)
    || displayPacket.soloOn !== nextPacket.soloOn || displayPacket.focusTracker !== nextPacket.focusTracker
    || displayPacket.highlightTracker !== nextPacket.highlightTracker
    || displayPacket.chartTickDecimals !== nextPacket.chartTickDecimals)) {
    const selectionChanged = displayPacket?.key !== nextPacket.key;
    setDisplayPacket(nextPacket);
    if (selectionChanged && hoveredCandle) setHoveredCandle(null);
  }
  const shown = displayPacket ?? nextPacket;
  const chartError = candleLoad.status === 'error' || priceStatus === 'error';
  const chartPending = !packetReady && !chartError;
  const retryChart = () => {
    candleLoad.retryCandles();
    mtfLoad.retryMtf();
    setPriceReloadKey((key) => key + 1);
  };
  useEffect(() => {
    if (!shown?.header) return;
    const change = shown.header.chg
      ? ` (${shown.header.chg.up ? '+' : ''}${shown.header.chg.pct}%)`
      : '';
    document.title = `${shown.header.title} ${shown.header.px}${change}`;
  }, [shown?.header]);
  useEffect(() => {
    if (!shown?.soloOn || !shown.focusTracker || !shown.candles.length) {
      focusScrollKeyRef.current = '';
      return;
    }
    const tracker = shown.focusTracker;
    const key = `${tracker.symbol}|${tracker.signature ?? tracker.obTime}|${shown.activeTf}`;
    if (focusScrollKeyRef.current === key) return;
    frameForTf(tracker, shown.activeTf);
  }, [shown, frameForTf]);
  const handleCaptureChart = () => {
    const canvas = chartRef.current?.captureImage();
    if (!canvas || !shown) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
      a.href = url;
      a.download = `${shown.sel.symbol}_${shown.timeframe.value}_${stamp}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // ── 마켓 — 모바일 거래탭 종목 시트 디자인 그대로(MarketPanel이 자체 데이터/필터 관리) ──
  const marketActive = section === 'market' && sidebarOpen;

  // ── 실데이터 — 현물 보유자산 (투자탭 '현물' 선택 시) ──
  const spotActive = section === 'invest' && investTab === '현물' && sidebarOpen;
  const { data: spot } = useSpotTrade(spotActive);
  const spotPriceSymbols = spot.holdings
    .filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC')
    .map((h) => `${h.coin}USDT`);
  const spotPrices = useRealtimePrices(spotPriceSymbols, false, spotActive);
  const spotPriceOf = (coin: string) => (coin === 'USDT' || coin === 'USDC' ? 1 : spotPrices[`${coin}USDT`] ?? 0);
  const spotValueOf = (h: SpotHolding) => (h.available + h.frozen) * spotPriceOf(h.coin);
  const spotTotal = spot.holdings.reduce((s, h) => s + spotValueOf(h), 0);
  const spotSorted = [...spot.holdings].sort((a, b) => spotValueOf(b) - spotValueOf(a));

  // 현물 시세 평가 도착 전까지 스켈레톤(보유 없으면 즉시 ready)
  const spotReady = useDelayedReady(spot.holdings.length === 0 || spotTotal > 0);

  // 사이드바 자산 스켈레톤 표시 여부
  const mainSkeleton = section === 'invest' && sidebarOpen && !mainReady && investTab === '선물';
  const spotSkeleton = spotActive && !spotReady;

  // 아이콘 클릭 → 섹션 선택 + 패널 열기
  // 로그인 필요한 섹션 — 내투자/전략/관심. (실시간 마켓은 공개) 섹션은 열리되 오버레이로 막는다.
  const GATED: Section[] = ['invest', 'strategy'];
  const sectionLocked = !user && GATED.includes(section);
  function openSection(id: Section) {
    // 같은 활성 섹션 아이콘 재클릭 → 접기. 다른 섹션이면 전환(열림 유지). 닫혀 있으면 열기.
    if (sidebarOpen && section === id) { setSidebarOpen(false); return; }
    setSection(id);
    setSidebarOpen(true);
  }
  // 표시 필터 — 마지막 하나는 끌 수 없음
  function togglePortfolio() {
    if (portfolioOn && !positionsOn) return;
    setPortfolioOn((v) => !v);
  }
  function togglePositions() {
    if (positionsOn && !portfolioOn) return;
    setPositionsOn((v) => !v);
  }

  // ── 차트 컴포넌트 props 묶음 : rsi·rank·solo·data·sel. draw·indi·view는 d04a 훅 반환 객체 그대로 ──
  const rsi = { rsiOn, setRsiOn, rsiSettings, setRsiSettings, rsiSettingsOpen, setRsiSettingsOpen };
  const rank = { rankMasterOn, setRankMasterOn, rankTiers, setRankTiers };
  const solo = { soloOn, focusTracker, setFocusTracker, setSoloActive, soloUserViewRef, highlightTracker };
  const chartData = shown
    ? { candles: shown.candles, timeframe: shown.timeframe, candlesKey: shown.candlesKey,
        handleVisibleRangeChange: packetReady ? shown.handleVisibleRangeChange : (() => {}),
        mtfCandles: shown.mtfCandles, mtfKey: shown.mtfKey, chartTickDecimals: shown.chartTickDecimals, obOptions,
        indicatorSettings: shown.indicatorSettings,
        pending: chartPending, error: chartError, missing: shown.missing, target: `${CHART_SYMBOL} ${activeTf}`, onRetry: retryChart }
    : { candles: [], timeframe, candlesKey: null, handleVisibleRangeChange: () => {}, mtfCandles: {}, mtfKey: null,
        chartTickDecimals, obOptions, indicatorSettings: effIndicatorSettings, pending: true, error: chartError, missing: [], target: `${CHART_SYMBOL} ${activeTf}`, onRetry: retryChart };
  const sel = shown?.sel ?? { ...chartSel, productType: CHART_PRODUCT };
  const chartSolo = shown
    ? { ...solo, soloOn: shown.soloOn, focusTracker: shown.focusTracker, highlightTracker: shown.highlightTracker }
    : solo;
  const chartIndi = shown
    ? { ...indi, effIndicatorSettings: shown.indicatorSettings, effMaSettings: shown.maSettings,
        effBbSetting: shown.bbSetting, effPivotSetting: shown.pivotSetting }
    : indi;

  return (
    <div className="app">
      <div className="main-area">

        {/* 메인 컬럼 (헤더 + 본문) */}
        <div className="app-main">
          <DesktopHeader
            user={user} onLoginClick={onLoginClick} onLogout={onLogout}
            menuOpen={menuOpen} setMenuOpen={setMenuOpen} menuRef={menuRef}
            effWatchMode={effWatchMode} setWatchMode={setWatchMode}
          />

          {/* 탑바(헤더)는 고정 — 그 아래 본문(sub-header+차트)만 dock 컬럼과 가로로 묶어 오른쪽으로 민다 */}
          <div className="app-body-row">
          {dockRender && (
            <aside className={`watch-dock${dockExpanded ? ' open' : ''}`}>
              <WatchlistPanel
                mode="dock"
                onSelect={handleSelectChart}
                onClose={() => setWatchMode('hidden')}
                onToggleDock={() => setWatchMode('float')}
              />
            </aside>
          )}
          <div className="app-body-col">

          {/* 차트 헤더 — 거래탭 종목 헤더 디자인 이식 */}
          <SymbolHeader H={shown?.header ?? null} symbol={sel.symbol} chartSel={sel} base={sel.symbol.replace(/USDT$|USDC$|KRW$/, '')} isFutures={sel.isFutures} coinLogos={coinLogos} />

          <div className="body">
            <main className="main-layout">

              {/* 차트 패널 — 실데이터(비트겟 BTCUSDT 선물) */}
              <section className="panel panel-chart">
                <ChartToolbar
                  draw={draw} indi={indi} view={view} rsi={rsi} rank={rank} solo={solo}
                  user={user} onLoginClick={onLoginClick} isAdmin={isAdmin} visibleTFs={shown?.visibleTFs ?? visibleTFs}
                  displayedActiveTf={shown?.activeTf ?? activeTf}
                  chartRef={chartRef} handleCaptureChart={handleCaptureChart} interactionBlocked={!packetReady}
                />
                <ChartStage
                  draw={draw} indi={chartIndi} view={view} rsi={rsi} rank={rank} solo={chartSolo} data={chartData} sel={sel}
                  user={user} chartRef={chartRef} ohlc={hoveredCandle ?? shown?.candles[shown.candles.length - 1]} setHoveredCandle={setHoveredCandle} fmtPx={shown?.fmtPx ?? fmtPx} fmtVol={fmtVol}
                />
              </section>

              {/* 가운데: 호가 + Market/Community */}
              <section className="panel-middle">
                <OrderbookPanel ob={ob} depthOpen={depthOpen} setDepthOpen={setDepthOpen} exchange={chartSel.exchange} />

                <RightPanel user={user} />
              </section>

            </main>
          </div>
          </div>{/* app-body-col */}
          </div>{/* app-body-row */}
        </div>

        {/* tpm 스타일 사이드바 패널 */}
        <Sidebar
          sidebarOpen={sidebarOpen} section={section} sectionLocked={sectionLocked}
          krw={krw} setKrw={setKrw} marketActive={marketActive} handleSelectChart={handleSelectChart}
          invest={{
            main: { trade, hasKey, positions, available, unrealTotal, mainVal, approx, mainSkeleton, selPos },
            spot: { spot, spotSorted, spotTotal, spotValueOf, spotPriceOf, spotSkeleton },
            currency: { krw, usdKrw, curLabel, fmtCur, approxCur },
            view: { investTab, setInvestTab, portfolioOn, positionsOn, togglePortfolio, togglePositions, bothOn, walletOpen, setWalletOpen },
            actions: { handleSelectChart, setSelPosIdx },
          }}
        />

        {/* 아이콘 레일 (항상 보임) */}
        <IconRail section={section} openSection={openSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      </div>

      <footer className="app-footer">
        <span>© 2026 Bubit · Desktop</span>
        <span>v0.1</span>
      </footer>

      {/* 관심 미니 시세창 — float 모드: 화면 위에 떠있는 드래그 창 */}
      {effWatchMode === 'float' && (
        <WatchlistPanel
          mode="float"
          onSelect={handleSelectChart}
          onClose={() => setWatchMode('hidden')}
          onToggleDock={() => setWatchMode('dock')}
        />
      )}
    </div>
  );
}
