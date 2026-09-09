import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { subscribeBinanceCandle, subscribeBinanceKline, subscribeCoinCandle } from '../../api/server/coinRealtime';
import { subscribeKrwCandle } from '../../api/exchange/krw/krwRealtime';
import { subscribeBitgetKline } from '../../api/exchange/bitget/klineRealtime';
import type { CandleMessage } from '../../api/server/coinRealtime';
import type { Candle } from '../../shared/types/market';
import { chartKey, resolveExchange } from './marketKey';
import { INTERVAL_SECONDS, canApplyCandle, canApplyPrice, classifyIncomingBar, mergeRefresh, shouldDropResponse } from './candleState';
import { loadWithTimeout } from './loadWithTimeout';

type TimeframeOption = {
  granularity: string;
  channel: string;
};

type LoadCandles = (granularity: string, limit: number, endTime?: string) => Promise<Candle[]>;

// 과거 페이징 버퍼 상한(봉 개수). 10000봉 = 1H ~13.7개월 / 4H ~4.6년 / 1D ~27년.
// 이 이상은 더 불러오지 않아 메모리·렌더 비용을 일정하게 유지한다.
const MAX_CANDLES = 10000;

type Ticker = {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Params = {
  symbol: string;
  productType?: string;
  isBinance: boolean;
  isFutures: boolean;
  timeframe: TimeframeOption;
  loadCandles: LoadCandles;
  fallbackCandles: Candle[];
  getBucketTime: (timestamp: number, granularity: string) => number;
  initialLimit?: number;
  active?: boolean; // 차트 화면이 떠 있을 때만 실시간 캔들 WS 구독
  clearOnSymbolChange?: boolean; // 종목/TF 변경 시 즉시 비울지(기본 true). false면 새 데이터 도착까지 이전 캔들 유지(깜빡임 방지)
  exchange?: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB'; // KRW는 업비트/빗썸 직결 WS로 현재가 구독(미지정 시 isBinance 기준)
  // priceFromTicker 옵션 제거 — 거래소 티커 기반 현재가는 hooks/market/useLivePrice가 담당한다. 이 훅의 livePrice는 '차트 TF 마지막 종가'(Mobile 차트 헤더용)만 뜻한다.
  liveCandle?: boolean; // Binance/Bitget=kline WS(현재 캔들 OHLCV 실시간), KRW=REST 폴링으로 거래량 갱신(기본 false=모바일 티커 경로)
};

export function useCoinCandles({
  symbol,
  productType,
  isBinance,
  isFutures,
  timeframe,
  loadCandles,
  fallbackCandles,
  getBucketTime,
  initialLimit = 60,
  active = true,
  clearOnSymbolChange = true,
  exchange,
  liveCandle = false,
}: Params) {
  // 현재 선택의 마켓 키(거래소|현선물|심볼|TF). 모든 가드·ref가 이 키를 쓴다(— 예전 `${symbol}|${tf}`는 거래소·현선물을 구분하지 못했다).
  const marketKey = chartKey(resolveExchange(exchange, isBinance), isFutures, symbol, timeframe.granularity);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [dailyOpenPrice, setDailyOpenPrice] = useState<number | null>(null);
  // 메인 캔들 로드가 끝난 심볼. 일봉시가가 아직 없으면 새 종목에는 null을 표시한다.
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(null);
  // 화면 candles 배열이 어느 마켓 키 것인지 — candlesKeyRef를 state로 미러(렌더 중 ref 접근 금지 규칙).
  // Desktop 차트 소수점·지표 스테이징이 쓴다 (→ : 심볼에서 키로). candlesKeyRef를 설정하는 곳에서 함께 갱신.
  const [candlesKey, setCandlesKey] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [request, setRequest] = useState<{ key: string; version: number; status: 'loading' | 'ready' | 'error' }>(() => ({ key: marketKey, version: 0, status: 'loading' }));
  let requestView = request;
  if (request.key !== marketKey || request.version !== retryVersion) {
    requestView = { key: marketKey, version: retryVersion, status: 'loading' };
    if (request.key !== marketKey && clearOnSymbolChange) setCandles([]);
    setRequest(requestView);
  }
  const requestRef = useRef(requestView);
  useLayoutEffect(() => { requestRef.current = requestView; }, [requestView]);
  const candlesSnapshotRef = useRef(candles);
  useLayoutEffect(() => { candlesSnapshotRef.current = candles; }, [candles]);
  const pagingRef = useRef<{ key: string; controller: AbortController } | null>(null);
  const prevSymbolKeyRef = useRef<string | null>(null);
  // "로드가 끝난 심볼|TF" 키. WS 틱은 이 키가 현재와 일치할 때만 반영한다.
  // → 전환 직후(로드 전)엔 잔존 WS 틱이나 새 종목 WS가 livePrice를 먼저 바꾸지 못하게 막아,
  //   현재가·일봉시가가 옛 종목끼리 일관 유지되다가 로드 시 한 번에 새 값으로 교체(등락 깜빡임/섞임 방지).
  const loadedKeyRef = useRef('');
  // 화면의 candles 배열이 어느 마켓 것인지 별도로 추적해 다른 요청의 WS 봉·과거 봉 병합을 막는다.
  const candlesKeyRef = useRef('');
  // 자동 재조회(WS 갭 감지·탭 복귀) 레이트리밋용 마지막 실행 시각(ms)
  const lastAutoRefreshRef = useRef(0);
  const refreshRef = useRef<{ controller: AbortController; prices: Set<number>; volumes: Set<number> } | null>(null);
  const volumePollRef = useRef<AbortController | null>(null);
  // WS 콜백에서 refresh를 부르기 위한 ref(구독 effect deps에 refreshCandles를 넣으면 재구독 유발)
  const autoRefreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    refreshRef.current?.controller.abort();
    volumePollRef.current?.abort();
    pagingRef.current?.controller.abort();
    pagingRef.current = null;
    const symbolKey = marketKey;
    prevSymbolKeyRef.current = symbolKey;
    async function loadChart() {
      try {
        // 메인 캔들이 준비되면 먼저 화면을 교체한다. 일봉시가는 새 key에 옛 값을 섞지 않도록
        // 아직 대기 중이면 null로 함께 커밋하고, 같은 요청 세대에서 도착했을 때만 보강한다.
        let dailySettled = timeframe.granularity === '1Dutc';
        let dailyCandles: Candle[] = [];
        const mainPromise = loadWithTimeout(
          loadCandles(timeframe.granularity, initialLimit),
          controller.signal,
        );
        const dailyPromise = timeframe.granularity === '1Dutc'
          ? null
          : loadWithTimeout(loadCandles('1Dutc', 2), controller.signal).then(
              (candles) => { dailySettled = true; dailyCandles = candles; return candles; },
              () => { dailySettled = true; return [] as Candle[]; },
            );
        const nextCandles = await mainPromise;
        if (controller.signal.aborted) return;
        // 차트 캔들
        if (nextCandles.length) {
          setCandles(nextCandles);
          candlesKeyRef.current = symbolKey; // 캔들 배열이 이 심볼|TF 것임 → WS 봉 반영 허용
          setCandlesKey(symbolKey);
        } else {
          setCandles(prev => prev.length ? prev : fallbackCandles);
        }
        // 현재가 = 차트 TF 마지막 종가(Mobile). 캔들이 비면(미지원 TF) 현재가도 갱신하지 않는다.
        const px = nextCandles.length ? nextCandles[nextCandles.length - 1].close : null;
        if (px != null) {
          setLivePrice(px);
          loadedKeyRef.current = symbolKey; // 로드 완료 → 이후 WS 틱(=최신가) 반영 허용
          setLoadedSymbol(symbol);          // 헤더 스테이지드 스왑용
          const dailyOpen = timeframe.granularity === '1Dutc'
            ? nextCandles[nextCandles.length - 1].open
            : dailySettled && dailyCandles.length > 0
              ? dailyCandles[dailyCandles.length - 1].open
              : null;
          setDailyOpenPrice(dailyOpen);
          setRequest({ key: symbolKey, version: retryVersion, status: 'ready' });
          if (dailyPromise) {
            dailyPromise.then((daily) => {
              const current = requestRef.current;
              if (controller.signal.aborted || current.key !== symbolKey
                || current.version !== retryVersion) return;
              setDailyOpenPrice(daily.length > 0 ? daily[daily.length - 1].open : null);
            });
          }
        } else {
          setRequest({ key: symbolKey, version: retryVersion, status: 'error' });
        }
      } catch {
        if (!controller.signal.aborted) {
          setCandles(prev => prev.length ? prev : fallbackCandles);
          setRequest({ key: symbolKey, version: retryVersion, status: 'error' });
        }
      }
    }
    // 첫 진입·재시도도 바로 요청한다. 동일한 진행 중 요청은 useCandleLoader가 공유한다.
    loadChart();
    return () => { controller.abort(); };
  }, [fallbackCandles, initialLimit, loadCandles, productType, symbol, timeframe.granularity, clearOnSymbolChange, marketKey, retryVersion]);

  // 일봉시가는 메인 캔들과 함께 교체하거나 같은 요청의 응답으로 보강한다.

  useEffect(() => {
    const currentKey = marketKey;
    let subscriptionActive = true;
    const intervalSec = INTERVAL_SECONDS[timeframe.granularity];
    const onTick = (ticker: Ticker) => {
      if (!subscriptionActive) return;
      if (requestRef.current.key !== currentKey || requestRef.current.status !== 'ready') return;
      // 이 심볼/TF 로드가 끝나기 전(전환 직후)이나 잔존 WS 틱은 무시 — 옛 현재가가 새 종목 일봉시가와
      // 섞여 등락이 깜빡이거나 다른 종목 가격이 순간 보이는 것 방지.
      if (!canApplyPrice(loadedKeyRef.current, currentKey)) return;
      setLivePrice(ticker.close);
      const KST = 9 * 3600;
      let bucketTime = exchange === 'BITHUMB'
        ? getBucketTime(ticker.time + KST, timeframe.granularity) - KST
        : getBucketTime(ticker.time, timeframe.granularity);
      // 3D는 epoch 대신 마지막 REST 봉의 거래소별 앵커를 쓴다.
      const anchor = candlesSnapshotRef.current.at(-1);
      if (timeframe.granularity === '3Dutc' && intervalSec && anchor) {
        const lastTime = Number(anchor.time);
        bucketTime = lastTime + Math.floor((ticker.time - lastTime) / intervalSec) * intervalSec;
      }
      refreshRef.current?.prices.add(bucketTime);
      // 캔들 배열이 이전 선택 것(fetch 실패로 유지 중)이면 현재가만 갱신하고 봉은 건드리지 않음
      if (!canApplyCandle(loadedKeyRef.current, candlesKeyRef.current, currentKey)) return;
      setCandles(currentCandles => {
        if (!currentCandles.length) return currentCandles;
        const nextCandles = [...currentCandles];
        const last = nextCandles[nextCandles.length - 1];
        const lastTime = Number(last.time);
        if (lastTime === bucketTime) {
          nextCandles[nextCandles.length - 1] = {
            ...last,
            high: Math.max(last.high, ticker.high),
            low: Math.min(last.low, ticker.low),
            close: ticker.close,
            // ticker.volume은 24h 누적이라 캔들 거래량으로 쓰면 막대가 치솟음 → 로드된 캔들 거래량 유지
            volume: last.volume
          };
          return nextCandles;
        }
        const action = classifyIncomingBar(lastTime, bucketTime, timeframe.granularity);
        if (action === 'refresh') { window.setTimeout(() => autoRefreshRef.current(), 0); return currentCandles; } // 건너뛰거나 어긋난 봉은 직접 붙이지 않고 REST로 메꿈(30초 레이트리밋)
        if (action === 'append') {
          nextCandles.push({
            time: bucketTime, open: last.close,
            high: Math.max(last.close, ticker.high),
            low: Math.min(last.close, ticker.low),
            // 새 캔들 시작 — 거래량은 0부터(다음 REST 로드 때 실제값 반영)
            close: ticker.close, volume: 0
          });
          return nextCandles;
        }
        return currentCandles;
      });
    };
    // kline WS(Binance/Bitget): 현재 캔들 OHLCV를 통째로 받아 마지막 캔들 교체/추가 — 거래량까지 실시간.
    const onKline = (c: CandleMessage) => {
      if (!subscriptionActive) return;
      if (requestRef.current.key !== currentKey || requestRef.current.status !== 'ready') return;
      if (!canApplyPrice(loadedKeyRef.current, currentKey)) return;
      setLivePrice(c.close);
      refreshRef.current?.prices.add(c.time);
      refreshRef.current?.volumes.add(c.time);
      if (!canApplyCandle(loadedKeyRef.current, candlesKeyRef.current, currentKey)) return;
      setCandles(currentCandles => {
        if (!currentCandles.length) return currentCandles;
        const nextCandles = [...currentCandles];
        const last = nextCandles[nextCandles.length - 1];
        const lastTime = Number(last.time);
        if (lastTime === c.time) {
          nextCandles[nextCandles.length - 1] = { time: last.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
          return nextCandles;
        }
        const action = classifyIncomingBar(lastTime, c.time, timeframe.granularity);
        if (action === 'refresh') {
          // 간격이 어긋난 봉(다른 TF 잔존 소켓)이나 건너뛴 봉은 직접 붙이지 않고 재조회로 정리 — Bitget 주봉 갭
          window.setTimeout(() => autoRefreshRef.current(), 0);
          return currentCandles;
        }
        if (action === 'append') {
          nextCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
          return nextCandles;
        }
        return currentCandles;
      });
    };
    if (!active) return; // 차트 화면 밖이면 실시간 캔들 구독 안 함(열린 WS 정리)
    const isKrw = exchange === 'UPBIT' || exchange === 'BITHUMB';

    // liveCandle + Binance/Bitget: kline WS로 현재 캔들 OHLCV 실시간(거래량 포함).
    // Binance는 지역차단이라 브라우저 직결 대신 백엔드 릴레이 토픽(subscribeBinanceKline=STOMP)을 구독한다.
    if (liveCandle && !isKrw) {
      const subscription = isBinance
        ? subscribeBinanceKline(symbol, isFutures, timeframe.granularity, onKline)
        : subscribeBitgetKline(symbol, isFutures, timeframe.channel, onKline);
      return () => { subscriptionActive = false; subscription.close(); };
    }

    // 그 외(모바일 전 거래소 / liveCandle KRW): 기존 티커 경로로 OHLC·현재가 갱신(거래량은 동결)
    const subscription = isKrw
      ? subscribeKrwCandle(exchange as 'UPBIT' | 'BITHUMB', symbol, onTick)
      : isBinance
        ? subscribeBinanceCandle(symbol, isFutures, onTick)
        : subscribeCoinCandle(symbol, timeframe.channel, onTick, productType);

    // liveCandle KRW: 공개 캔들 WS가 없어 REST로 최신 캔들 거래량을 5초마다 보정
    let pollTimer: number | undefined;
    if (liveCandle && isKrw) {
      const poll = async () => {
        if (volumePollRef.current || refreshRef.current || requestRef.current.status !== 'ready') return;
        const requestVersion = requestRef.current.version;
        const controller = new AbortController();
        volumePollRef.current = controller;
        try {
          const cs = await loadWithTimeout(loadCandles(timeframe.granularity, 2), controller.signal);
          if (!subscriptionActive || controller.signal.aborted || requestRef.current.status !== 'ready'
            || requestRef.current.version !== requestVersion) return;
          // 캔들이 이전 종목 것이면 skip — 같은 TF는 버킷 time이 종목 불문 일치해 거래량이 섞임
          if (!canApplyCandle(loadedKeyRef.current, candlesKeyRef.current, currentKey)) return;
          const latest = cs[cs.length - 1];
          if (!latest) return;
          setCandles(currentCandles => {
            if (!currentCandles.length) return currentCandles;
            const last = currentCandles[currentCandles.length - 1];
            if (Number(last.time) !== Number(latest.time) || last.volume === latest.volume) return currentCandles;
            const nextCandles = [...currentCandles];
            nextCandles[nextCandles.length - 1] = { ...last, volume: latest.volume };
            return nextCandles;
          });
        } catch {
          // 다음 5초 주기에 재시도한다. timeout/종료된 요청의 늦은 응답은 반영하지 않는다.
        } finally {
          if (volumePollRef.current === controller) volumePollRef.current = null;
        }
      };
      pollTimer = window.setInterval(poll, 5000);
    }
    return () => {
      subscriptionActive = false;
      subscription.close();
      if (pollTimer) clearInterval(pollTimer);
      volumePollRef.current?.abort();
    };
  }, [active, getBucketTime, isBinance, isFutures, productType, symbol, timeframe.channel, timeframe.granularity, exchange, liveCandle, loadCandles, marketKey]);

  const refreshCandles = useCallback(async () => {
    const requestKey = marketKey;
    if (requestRef.current.key === requestKey && requestRef.current.status === 'loading') return;
    refreshRef.current?.controller.abort();
    // refresh와 volume poll도 같은 캔들 거래량을 쓰므로 동시에 반영하지 않는다.
    volumePollRef.current?.abort();
    const controller = new AbortController();
    const attempt = { controller, prices: new Set<number>(), volumes: new Set<number>() };
    refreshRef.current = attempt;
    try {
      const nextCandles = await loadWithTimeout(
        loadCandles(timeframe.granularity, initialLimit),
        controller.signal,
      );
      if (controller.signal.aborted || requestRef.current.key !== requestKey || requestRef.current.status !== 'ready') return;
      // 응답 대기 중 선택(거래소·현선물·종목·TF)이 바뀌었으면 폐기 — 옛 캔들이 새 차트를 덮어쓰는 것 방지
      if (shouldDropResponse(prevSymbolKeyRef.current, requestKey)) return;
      if (nextCandles.length) {
        // 응답 대기 중 변경된 봉만 보호한다. 값이 원래 가격으로 돌아온 경우도 포함한다.
        const updates = { prices: new Set(attempt.prices), volumes: new Set(attempt.volumes) };
        setCandles(prev => (candlesKeyRef.current !== requestKey ? nextCandles : mergeRefresh(prev, nextCandles, timeframe.granularity, updates)));
        candlesKeyRef.current = requestKey;
        setCandlesKey(requestKey);
        const last = nextCandles[nextCandles.length - 1];
        const latestTime = Math.max(Number(candlesSnapshotRef.current.at(-1)?.time ?? last.time), ...updates.prices);
        if (Number(last.time) >= latestTime && !updates.prices.has(Number(last.time))) setLivePrice(last.close);
      } else {
        setCandles(prev => prev.length ? prev : fallbackCandles);
      }
    } catch {
      if (!controller.signal.aborted && !shouldDropResponse(prevSymbolKeyRef.current, requestKey)) setCandles(prev => prev.length ? prev : fallbackCandles);
    } finally {
      if (refreshRef.current === attempt) refreshRef.current = null;
    }
  }, [fallbackCandles, initialLimit, loadCandles, timeframe.granularity, marketKey]);
  useEffect(() => () => refreshRef.current?.controller.abort(), []);

  // 자동 재조회(WS 갭 감지·탭 복귀) — 30초 레이트리밋으로 연쇄 refresh 폭주 방지
  const autoRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoRefreshRef.current < 30_000) return;
    lastAutoRefreshRef.current = now;
    refreshCandles();
  }, [refreshCandles]);
  useEffect(() => { autoRefreshRef.current = autoRefresh; }, [autoRefresh]);

  // 백그라운드 복귀(active false→true) 시 캔들 히스토리를 자동 재조회한다.
  // 안 하면 백그라운드 동안 마감된 봉들이 누락되고(WS는 한 봉만 bridge), 수동 새로고침 전까지 갭이 남는다.
  const prevActiveRef = useRef(active);
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;
    if (active && !wasActive) refreshCandles();
  }, [active, refreshCandles]);

  // 탭/창 복귀 시에도 재조회 — 웹은 active가 상수 true라 위 effect가 한 번도 안 돌아
  // 절전·네트워크 단절로 빠진 봉이 새로고침 전까지 남던 문제 보완(모바일은 레이트리밋이 중복 흡수).
  useEffect(() => {
    if (!active) return;
    const onVisible = () => { if (document.visibilityState === 'visible') autoRefreshRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);

  const loadMoreCandles = useCallback(async () => {
    if (pagingRef.current || !candles.length) return;
    if (candles.length >= MAX_CANDLES) return; // 버퍼 상한 도달 — 더 과거는 불러오지 않음
    const requestKey = marketKey;
    // 화면 캔들이 다른 선택 것(전환 직후 잔상)이면 백필 자체를 하지 않음
    if (candlesKeyRef.current !== requestKey) return;
    const controller = new AbortController();
    const attempt = { key: requestKey, controller };
    pagingRef.current = attempt;
    try {
      const oldestTime = candles[0].time;
      const endTimeMs = (Number(oldestTime)) * 1000 - 1000;
      const moreCandles = await loadWithTimeout(
        loadCandles(timeframe.granularity, 500, String(endTimeMs)),
        controller.signal,
      );
      // 응답 대기 중 종목/TF가 바뀌었으면 폐기 — 다른 종목/TF 캔들이 병합되는 것(가격 절벽) 방지
      if (controller.signal.aborted || requestRef.current.key !== requestKey || requestRef.current.status !== 'ready'
        || shouldDropResponse(prevSymbolKeyRef.current, requestKey) || candlesKeyRef.current !== requestKey) return;
      if (moreCandles.length > 0) {
        setCandles(prev => {
          const existingTimes = new Set(prev.map(c => c.time));
          const filteredMore = moreCandles.filter(c => !existingTimes.has(c.time));
          if (filteredMore.length === 0) return prev;
          return [...filteredMore, ...prev].sort((a, b) => Number(a.time) - Number(b.time));
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error('Failed to load more candles:', error);
    } finally {
      if (pagingRef.current === attempt) pagingRef.current = null;
    }
  }, [candles, loadCandles, timeframe.granularity, marketKey]);
  useEffect(() => () => {
    pagingRef.current?.controller.abort();
    pagingRef.current = null;
  }, []);

  const handleVisibleRangeChange = useCallback((range: { logicalRange: { from: number; to: number } | null }) => {
    if (!range.logicalRange || candles.length === 0) return;
    if (range.logicalRange.from < 5) loadMoreCandles();
  }, [candles.length, loadMoreCandles]);

  const clearCandles = useCallback(() => {
    setCandles([]);
  }, []);

  const retryCandles = useCallback(() => {
    setRetryVersion((version) => version + 1);
  }, []);

  return {
    candles,
    candlesKey,
    livePrice,
    openPrice: candlesKey ? candles.at(-1)?.open ?? null : null,
    dailyOpenPrice,
    loadedSymbol,
    requestKey: marketKey,
    status: requestView.status,
    retryCandles,
    clearCandles,
    refreshCandles,
    handleVisibleRangeChange,
  };
}
