import { useCallback } from 'react';
import { fetchBinanceCandles, fetchCoinCandles } from '../../api/server/marketApi';
import { fetchUpbitCandles, fetchBithumbCandles } from '../../api/exchange/krw/krwTickers';
import type { Candle } from '../../shared/types/market';
import { loadWithTimeout } from './loadWithTimeout';

type Params = {
  symbol: string;
  productType?: string;
  exchange: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';
};

const inFlight = new Map<string, Promise<Candle[]>>();

function sharedRequest(key: string, request: () => Promise<Candle[]>): Promise<Candle[]> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const shared = loadWithTimeout(Promise.resolve().then(request), new AbortController().signal).finally(() => {
    if (inFlight.get(key) === shared) inFlight.delete(key);
  });
  inFlight.set(key, shared);
  return shared;
}

export function useCandleLoader({ symbol, productType, exchange }: Params) {
  const isFutures = !!productType;

  return useCallback(
    (granularity: string, limit: number, endTime?: string) => {
      const key = JSON.stringify([exchange, productType ?? null, symbol, granularity, limit, endTime ?? null]);
      return sharedRequest(key, () => {
        switch (exchange) {
          case 'BINANCE': return fetchBinanceCandles(symbol, granularity, limit, endTime, isFutures);
          case 'UPBIT':   return fetchUpbitCandles(symbol, granularity, limit, endTime);
          case 'BITHUMB': return fetchBithumbCandles(symbol, granularity, limit, endTime);
          default:        return fetchCoinCandles(symbol, granularity, limit, endTime, productType);
        }
      });
    },
    [exchange, isFutures, productType, symbol],
  );
}
