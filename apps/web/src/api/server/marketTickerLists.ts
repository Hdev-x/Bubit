import { fetchCoinFuturesTickers, fetchCoinTickers, fetchBinanceSpotTickers, fetchBinanceFuturesTickers } from './marketApi';
import { fetchUpbitSpotTickers, fetchBithumbSpotTickers } from '../exchange/krw/krwTickers';
import type { CoinTicker } from '../../shared/types/market';
import type { ExchangeId } from '../../shared/constants/exchanges';

export type TickerMarket = 'spot' | 'futures';
export type TickerListKey = `${ExchangeId}|${TickerMarket}`;
export type TickerList = { tickers: CoinTicker[]; status: 'loading' | 'ready' | 'error'; refreshedAt: number };
export const TICKER_REFRESH_MS = 5_000;

let snapshot: Partial<Record<TickerListKey, TickerList>> = {};
const listeners = new Set<() => void>();
const pending = new Map<TickerListKey, Promise<void>>();

export const getTickerLists = () => snapshot;
export function subscribeTickerLists(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(key: TickerListKey, list: TickerList) {
  snapshot = { ...snapshot, [key]: list };
  listeners.forEach(listener => listener());
}

async function fetchMarketTickers(key: TickerListKey): Promise<CoinTicker[]> {
  const [exchange, market] = key.split('|');
  const strict = { throwOnError: true };
  if (exchange === 'BITGET') {
    const tickers = market === 'spot' ? await fetchCoinTickers(strict) : await fetchCoinFuturesTickers({ ...strict, quote: 'USDT' });
    // 기존 목록 정책: 거래량이 큰 변동 0% 토큰화 주식은 제외한다.
    return tickers.filter(t => t.quoteSymbol === 'USDT' && !(Math.abs(t.changeRate) < 1e-9 && t.volume > 1e6));
  }
  if (exchange === 'BINANCE') {
    const tickers = market === 'spot' ? await fetchBinanceSpotTickers(strict) : await fetchBinanceFuturesTickers(strict);
    return tickers.filter(t => t.quoteSymbol === 'USDT');
  }
  if (market === 'spot' && exchange === 'UPBIT') return fetchUpbitSpotTickers();
  if (market === 'spot' && exchange === 'BITHUMB') return fetchBithumbSpotTickers();
  return [];
}

/** 시장·관심 패널이 결과와 진행 중 요청을 공유한다. 실패해도 마지막 정상 목록은 유지한다. */
export function refreshTickerList(key: TickerListKey, force = false): Promise<void> {
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const previous = snapshot[key];
  if (!force && previous && Date.now() - previous.refreshedAt < TICKER_REFRESH_MS) return Promise.resolve();
  publish(key, { tickers: previous?.tickers ?? [], status: 'loading', refreshedAt: previous?.refreshedAt ?? 0 });
  const request = fetchMarketTickers(key).then(tickers => {
    // 상류 장애가 빈 응답으로 내려와도 이미 표시한 종목은 사라지지 않는다.
    const keepPrevious = !tickers.length && !!previous?.tickers.length;
    publish(key, { tickers: keepPrevious ? previous.tickers : tickers, status: keepPrevious ? 'error' : 'ready', refreshedAt: Date.now() });
  }).catch(() => {
    publish(key, { tickers: previous?.tickers ?? [], status: 'error', refreshedAt: Date.now() });
  }).finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}
