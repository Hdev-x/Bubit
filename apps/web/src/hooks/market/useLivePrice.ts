import { useEffect, useState } from 'react';
import { fetchHeaderTicker } from '../../api/exchange/headerTicker';
import {
  subscribeBinanceFuturesTickers, subscribeBinanceSpotTickers,
  subscribeBitgetFuturesTickers, subscribeBitgetSpotTickers,
} from '../../api/server/coinRealtime';
import type { RealtimeTicker, Subscription } from '../../api/server/coinRealtime';
import { subscribeKrwTickers } from '../../api/exchange/krw/krwRealtime';
import { EMPTY_LIVE_PRICE, applyDailyOpen, applySeed, applyTick, isReady, livePriceKey, msUntilNextUtcMidnight, readySymbolOf } from './livePriceState';
import type { LivePriceExchange, LivePriceState } from './livePriceState';
import { loadWithTimeout } from '../../chart/hooks/loadWithTimeout';

// 현재가 전용 훅 . 차트 TF·캔들 로드와 무관하게 거래소 티커에서 현재가를 받는다.
//  - seed: fetchHeaderTicker(REST) → last. 등락 기준(dailyOpen)은 loadDailyOpen(캔들 1Dutc 시가)이 있으면 그것, 없으면 티커 openUtc.
//    현재가가 오면 새 키로 커밋하고, 늦은 일봉시가는 같은 요청에서만 보강한다. Binance의 rolling 24h 시가는 대체값으로 쓰지 않는다.
//  - 갱신: 서버 STOMP 중계(Bitget·Binance) 또는 업비트·빗썸 직결 WS의 티커 price
//  - 전환 직후엔 옛 종목 값을 유지하다 새 seed가 오면 한 번에 교체(스테이지드 스왑). 규칙은 livePriceState.ts.
// - ready: 현재 키(거래소|현선물|심볼)의 seed 완료 여부 — 소비처는 readySymbol 대신 이것을 쓴다.
//    seed 실패·빈 응답이면 3초→30초 백오프로 재시도(전환·비활성·언마운트 시 취소). 다음 00:00 UTC + 5초에 loadDailyOpen을 다시 실행해 등락 기준을 갱신.
// Mobile 차트는 이 훅을 쓰지 않는다(현재가 = 차트 TF 종가, useCoinCandles).
const SEED_RETRY_BASE_MS = 3_000;
const SEED_RETRY_MAX_MS = 30_000;
const ROLLOVER_GRACE_MS = 5_000;

export function useLivePrice({ symbol, exchange, isFutures, enabled = true, loadDailyOpen, reloadKey = 0 }: {
  symbol: string;
  exchange: LivePriceExchange;
  isFutures: boolean;
  enabled?: boolean;
  loadDailyOpen?: () => Promise<number | null>; // 등락 기준 시가 로더. 대기·실패 시 Binance는 null, 그 외 거래소는 티커 openUtc.
  reloadKey?: number;
}): { price: number | null; dailyOpen: number | null; readySymbol: string | null; ready: boolean; status: 'loading' | 'ready' | 'error' } {
  const [state, setState] = useState<LivePriceState>(EMPTY_LIVE_PRICE);
  const [request, setRequest] = useState<{ key: string; reloadKey: number; status: 'loading' | 'ready' | 'error' }>(() => ({
    key: livePriceKey(exchange, symbol, isFutures), reloadKey, status: 'loading',
  }));
  const currentKey = livePriceKey(exchange, symbol, isFutures);
  let requestView = request;
  if (request.key !== currentKey || request.reloadKey !== reloadKey) {
    requestView = { key: currentKey, reloadKey, status: 'loading' };
    setRequest(requestView);
  }

  useEffect(() => {
    if (!enabled || !symbol) return;
    const key = livePriceKey(exchange, symbol, isFutures);
    const controller = new AbortController();
    let cancelled = false;
    let retryTimer: number | undefined;
    let rolloverTimer: number | undefined;
    let attempt = 0;
    let seedAttempt = 0;

    const scheduleRetry = () => {
      const delay = Math.min(SEED_RETRY_MAX_MS, SEED_RETRY_BASE_MS * 2 ** attempt);
      attempt += 1;
      retryTimer = window.setTimeout(seed, delay);
    };
    // 일봉 롤오버 — 다음 00:00 UTC + 5초에 등락 기준 시가를 다시 받는다(그 뒤 다음 자정에 또).
    const scheduleRollover = () => {
      if (!loadDailyOpen) return;
      rolloverTimer = window.setTimeout(() => {
        loadDailyOpen()
          .then((v) => { if (!cancelled) setState((s) => applyDailyOpen(s, key, v)); })
          .catch(() => { /* 다음 자정에 재시도 */ })
          .finally(() => { if (!cancelled) scheduleRollover(); });
      }, msUntilNextUtcMidnight(Date.now()) + ROLLOVER_GRACE_MS);
    };
    const seed = () => {
      const currentAttempt = ++seedAttempt;
      let dailyOpen: number | null = null;
      let dailySettled = !loadDailyOpen;
      let tickerReady = false;
      if (loadDailyOpen) {
        loadWithTimeout(loadDailyOpen(), controller.signal)
          .catch(() => null)
          .then((value) => {
            dailyOpen = value;
            dailySettled = true;
            if (!cancelled && currentAttempt === seedAttempt && tickerReady) {
              setState((state) => applyDailyOpen(state, key, value));
            }
          });
      }
      loadWithTimeout(fetchHeaderTicker(exchange, symbol, isFutures), controller.signal).then((ticker) => {
        if (cancelled || currentAttempt !== seedAttempt) return; // 전환·같은 키 재시도 중 늦은 응답
        if (!ticker || !ticker.last) { setRequest({ key, reloadKey, status: 'error' }); scheduleRetry(); return; } // 빈 응답 — 예전엔 여기서 영구 정지
        tickerReady = true;
        const seedTicker = exchange === 'BINANCE' ? { ...ticker, openUtc: 0 } : ticker;
        setState((state) => applySeed(state, key, key, seedTicker, dailySettled ? dailyOpen : null));
        setRequest({ key, reloadKey, status: 'ready' });
        scheduleRollover();
      }).catch(() => { if (!cancelled) { setRequest({ key, reloadKey, status: 'error' }); scheduleRetry(); } }); // 실패 — 옛 값 유지, WS 틱은 readyKey 가드로 막힘, 백오프 재시도
    };
    seed();

    const onTicker = (t: RealtimeTicker) => {
      if (cancelled || t.symbol !== symbol) return;
      setState((s) => applyTick(s, key, t.price));
    };
    const sub = subscribeTickers(exchange, isFutures, symbol, onTicker);
    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
      if (rolloverTimer) window.clearTimeout(rolloverTimer);
      sub.close();
    };
  }, [symbol, exchange, isFutures, enabled, loadDailyOpen, reloadKey]);

  const ready = requestView.key === currentKey && requestView.reloadKey === reloadKey
    && requestView.status === 'ready' && isReady(state, currentKey);
  return { price: state.price, dailyOpen: state.dailyOpen, readySymbol: readySymbolOf(state), ready, status: ready ? 'ready' : requestView.status };
}

function subscribeTickers(exchange: LivePriceExchange, isFutures: boolean, symbol: string, onTicker: (t: RealtimeTicker) => void): Subscription {
  switch (exchange) {
    case 'UPBIT':
    case 'BITHUMB':
      return subscribeKrwTickers(exchange, [symbol], onTicker);
    case 'BINANCE':
      return isFutures ? subscribeBinanceFuturesTickers([symbol], onTicker) : subscribeBinanceSpotTickers([symbol], onTicker);
    default:
      return isFutures ? subscribeBitgetFuturesTickers([symbol], onTicker) : subscribeBitgetSpotTickers([symbol], onTicker);
  }
}
