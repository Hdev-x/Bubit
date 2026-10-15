import { useEffect, useState } from 'react';
import { fetchRecentTrades, type RecentTrade } from '../../api/server/recentTradesApi';
import type { ExchangeId } from '../../shared/constants/exchanges';

type State = { key: string; trades: RecentTrade[]; status: 'loading' | 'ready' | 'error' };

export function useRecentTrades(exchange: ExchangeId, symbol: string, futures: boolean, active: boolean) {
  const key = `${exchange}|${futures}|${symbol}`;
  const [state, setState] = useState<State>({ key, trades: [], status: 'loading' });
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const result = await fetchRecentTrades(exchange, symbol, futures, controller.signal);
        if (!controller.signal.aborted) setState({ key, trades: result.trades, status: result.stale ? 'error' : 'ready' });
      } catch {
        if (!controller.signal.aborted) setState(previous => ({ key, trades: previous.key === key ? previous.trades : [], status: 'error' }));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => { void load(); }, 2_000);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [exchange, symbol, futures, active, key]);
  return state.key === key ? state : { key, trades: [], status: 'loading' as const };
}
