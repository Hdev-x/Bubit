import { useEffect, useState } from 'react';
import { subscribeBitgetFuturesTickers, subscribeBitgetSpotTickers } from '../../api/server/coinRealtime';
import type { RealtimeTicker } from '../../api/server/coinRealtime';

// isFutures=true → 선물 티커(/topic/coin-futures), false → 현물 티커(/topic/coin).
// 현물/선물은 베이시스로 가격이 달라서 탭에 맞는 채널을 구독해야 현재가·평가가 정확하다.
export function useRealtimePrices(symbols: string[], isFutures = true, active = true) {
  const [priceState, setPriceState] = useState<{ key: string; prices: Record<string, number> }>({ key: '', prices: {} });
  const symbolsKey = symbols.join(',');
  const subscriptionKey = `${active ? 'active' : 'inactive'}|${isFutures ? 'futures' : 'spot'}|${symbolsKey}`;
  const [currentKey, setCurrentKey] = useState(subscriptionKey);
  if (currentKey !== subscriptionKey) {
    setCurrentKey(subscriptionKey);
    setPriceState({ key: subscriptionKey, prices: {} });
  }

  useEffect(() => {
    if (!active || symbols.length === 0) return;
    let cancelled = false;

    const subscribe = isFutures ? subscribeBitgetFuturesTickers : subscribeBitgetSpotTickers;
    const sub = subscribe(symbols, (ticker) => {
      if (cancelled) return;
      setPriceState(prev => {
        const prices = prev.key === subscriptionKey ? prev.prices : {};
        if (prices[ticker.symbol] === ticker.price) return prev;
        return { key: subscriptionKey, prices: { ...prices, [ticker.symbol]: ticker.price } };
      });
    });

    return () => {
      cancelled = true;
      sub.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- symbols 대신 내용 키 symbolsKey로 재구독 여부를 정한다(배열 참조만 바뀌면 WS 유지)
  }, [symbolsKey, isFutures, active]);

  return active && symbols.length > 0 && priceState.key === subscriptionKey ? priceState.prices : {};
}

export function useRealtimeTickers(symbols: string[], isFutures = true) {
  const symbolsKey = symbols.join(',');
  const subscriptionKey = `${isFutures ? 'futures' : 'spot'}|${symbolsKey}`;
  const [tickerState, setTickerState] = useState<{ key: string; tickers: Record<string, RealtimeTicker> }>(() => ({ key: subscriptionKey, tickers: {} }));
  if (tickerState.key !== subscriptionKey) setTickerState({ key: subscriptionKey, tickers: {} });

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;

    const subscribe = isFutures ? subscribeBitgetFuturesTickers : subscribeBitgetSpotTickers;
    const sub = subscribe(symbols, (ticker) => {
      if (cancelled) return;
      setTickerState(prev => {
        const tickers = prev.key === subscriptionKey ? prev.tickers : {};
        return { key: subscriptionKey, tickers: { ...tickers, [ticker.symbol]: ticker } };
      });
    });

    return () => {
      cancelled = true;
      sub.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- symbols 대신 내용 키 symbolsKey로 재구독 여부를 정한다(배열 참조만 바뀌면 WS 유지)
  }, [symbolsKey, isFutures]);

  return tickerState.key === subscriptionKey ? tickerState.tickers : {};
}
