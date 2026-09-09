import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBinanceFuturesTickers,
  fetchBinanceSpotTickers,
  fetchCoinFuturesTickers,
  fetchCoinTickers,
} from '../../api/server/marketApi';
import { fetchUpbitSpotTickers, fetchBithumbSpotTickers } from '../../api/exchange/krw/krwTickers';
import {
  subscribeBinanceFuturesTickers,
  subscribeBinanceSpotTickers,
  subscribeBitgetFuturesTickers,
  subscribeBitgetSpotTickers,
} from '../../api/server/coinRealtime';
import type { RealtimeTicker } from '../../api/server/coinRealtime';
import type { CoinTicker } from '../../shared/types/market';
import type { ExchangeId } from '../../shared/constants/exchanges';

type ExchangeFilter = ExchangeId;
type ProductFilter = 'SPOT' | 'FUTURES';

type UseMarketTickersParams = {
  exchangeFilter: ExchangeFilter;
  productFilter: ProductFilter;
  realtimeSymbols: string[];
  active?: boolean; // 화면 밖이면 실시간 flush·WS 구독 중단
};

// 업비트/빗썸은 KRW 현물뿐이라 productFilter 무시(항상 현물)
const KRW_EXCHANGES: ExchangeFilter[] = ['UPBIT', 'BITHUMB'];
const isKrwExchange = (ex: ExchangeFilter) => KRW_EXCHANGES.includes(ex);

function getTickerLoader(exchangeFilter: ExchangeFilter, productFilter: ProductFilter) {
  if (exchangeFilter === 'BINANCE') {
    const loader = productFilter === 'FUTURES' ? fetchBinanceFuturesTickers : fetchBinanceSpotTickers;
    return (_signal?: AbortSignal) => loader();
  }

  if (exchangeFilter === 'BITGET') {
    const loader = productFilter === 'FUTURES' ? fetchCoinFuturesTickers : fetchCoinTickers;
    return (_signal?: AbortSignal) => loader();
  }

  if (exchangeFilter === 'UPBIT') return fetchUpbitSpotTickers;
  if (exchangeFilter === 'BITHUMB') return fetchBithumbSpotTickers;

  return async (_signal?: AbortSignal) => [];
}

export function useMarketTickers({ exchangeFilter, productFilter, realtimeSymbols, active = true }: UseMarketTickersParams) {
  const queryKey = `${exchangeFilter}|${productFilter}`;
  const [tickerState, setTickerState] = useState<{ queryKey: string; tickers: CoinTicker[] }>({ queryKey, tickers: [] });
  const [sortSnapshot, setSortSnapshot] = useState<CoinTicker[]>([]);
  const [loadingState, setLoadingState] = useState({ queryKey, loading: true });
  const pendingRef = useRef<Map<string, { queryKey: string; ticker: RealtimeTicker }>>(new Map());
  const requestRef = useRef({ queryKey: null as string | null, generation: 0, settled: false });
  const successfulGenerationRef = useRef<number | null>(null);
  const previousActiveRef = useRef<boolean | undefined>(undefined);
  if (loadingState.queryKey !== queryKey) setLoadingState({ queryKey, loading: true });
  const isTickerLoading = loadingState.queryKey === queryKey ? loadingState.loading : true;

  useEffect(() => {
    pendingRef.current.clear();
    if (!active) return; // 화면 밖이면 실시간 반영 flush 중단(숨은 리스트 재렌더 방지)
    const id = setInterval(() => {
      if (pendingRef.current.size === 0) return;
      const updates = pendingRef.current;
      pendingRef.current = new Map();
      setTickerState(prev => prev.queryKey !== queryKey ? prev : { ...prev, tickers: prev.tickers.map(t => {
        const update = updates.get(t.symbol);
        if (!update || update.queryKey !== queryKey) return t;
        const live = update.ticker;
        const changeRate = live.changeRate ?? t.changeRate;
        return { ...t, last: live.price, changeRate, change: live.change ?? live.price * changeRate, volume: live.volume ?? t.volume };
      }) });
    }, 800);

    return () => {
      clearInterval(id);
      pendingRef.current.clear();
    };
  }, [active, queryKey]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let pollTimer: number | undefined;
    const isKrw = isKrwExchange(exchangeFilter);
    const loader = getTickerLoader(exchangeFilter, productFilter);
    const sameQuery = requestRef.current.queryKey === queryKey;
    const previousActive = previousActiveRef.current;
    previousActiveRef.current = active;
    if (!sameQuery) requestRef.current = { queryKey, generation: requestRef.current.generation + 1, settled: false };
    const generation = requestRef.current.generation;

    async function load() {
      try {
        const tickersData = await loader(controller.signal);
        if (cancelled) return;
        requestRef.current = { queryKey, generation, settled: true };
        setTickerState({ queryKey, tickers: tickersData });
        if (successfulGenerationRef.current !== generation) {
          if (tickersData.length) {
            successfulGenerationRef.current = generation;
            setSortSnapshot(tickersData);
          } else {
            setSortSnapshot([]);
          }
          setLoadingState({ queryKey, loading: false });
        }
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        requestRef.current = { queryKey, generation, settled: true };
        if (successfulGenerationRef.current !== generation) {
          setTickerState({ queryKey, tickers: [] });
          setSortSnapshot([]);
          setLoadingState({ queryKey, loading: false });
        }
      } finally {
        if (!cancelled && active && isKrw) pollTimer = window.setTimeout(load, 3000);
      }
    }

    if (sameQuery && requestRef.current.settled) {
      if (active && isKrw) pollTimer = window.setTimeout(load, 3000);
    } else if (sameQuery && !active && previousActive !== active) {
      // 활성 화면에서 취소된 요청은 비활성 동안 재시작하지 않고, 다시 활성화될 때 복구한다.
    } else {
      void load();
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [active, exchangeFilter, productFilter, queryKey]);

  const queueTickerUpdate = useCallback((live: RealtimeTicker) => {
    pendingRef.current.set(live.symbol, { queryKey, ticker: live });
  }, [queryKey]);

  useEffect(() => {
    if (!active) return; // 화면 밖이면 티커 WS 구독 안 함(열린 소켓 정리)
    if (isKrwExchange(exchangeFilter)) return; // KRW 거래소는 위 REST 폴링이 담당
    if (!realtimeSymbols.length) return;
    let subscribed = true;
    const onTicker = (ticker: RealtimeTicker) => {
      if (subscribed) queueTickerUpdate(ticker);
    };

    if (exchangeFilter === 'BINANCE') {
      const subscribe = productFilter === 'FUTURES'
        ? subscribeBinanceFuturesTickers
        : subscribeBinanceSpotTickers;
      const sub = subscribe(realtimeSymbols, onTicker);
      return () => {
        subscribed = false;
        sub.close();
      };
    }

    const subscribe = productFilter === 'FUTURES'
      ? subscribeBitgetFuturesTickers
      : subscribeBitgetSpotTickers;
    const sub = subscribe(realtimeSymbols, onTicker);
    return () => {
      subscribed = false;
      sub.close();
    };
  }, [active, exchangeFilter, productFilter, queueTickerUpdate, realtimeSymbols]);

  return {
    allTickers: tickerState.tickers,
    sortSnapshot,
    isTickerLoading,
  };
}
