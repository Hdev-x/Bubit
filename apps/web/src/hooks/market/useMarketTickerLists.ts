import { useEffect, useSyncExternalStore } from 'react';
import { getTickerLists, refreshTickerList, subscribeTickerLists, TICKER_REFRESH_MS, type TickerListKey } from '../../api/server/marketTickerLists';

export function useMarketTickerLists(keys: TickerListKey[], active: boolean) {
  const lists = useSyncExternalStore(subscribeTickerLists, getTickerLists, getTickerLists);
  const keysString = [...new Set(keys)].sort().join(',');
  useEffect(() => {
    if (!active || !keysString) return;
    let current = true;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const load = async (key: TickerListKey) => {
      await refreshTickerList(key);
      if (current) timers.set(key, setTimeout(() => { void load(key); }, TICKER_REFRESH_MS));
    };
    // 각 시장은 완료되는 즉시 표시하며, 느린 거래소가 다른 관심종목을 막지 않는다.
    keysString.split(',').forEach(key => { void load(key as TickerListKey); });
    return () => { current = false; timers.forEach(clearTimeout); };
  }, [active, keysString]);
  return lists;
}
