import type { ExchangeId } from '../../shared/constants/exchanges';
import { isRecord } from '../../shared/utils/guards';

export type RecentTrade = { id: string; price: number; size: number; side: 'buy' | 'sell'; time: number };
export type RecentTrades = { trades: RecentTrade[]; stale: boolean };

export async function fetchRecentTrades(exchange: ExchangeId, symbol: string, futures: boolean, signal: AbortSignal): Promise<RecentTrades> {
  const query = new URLSearchParams({ exchange, symbol, futures: String(futures) });
  const response = await fetch(`/coin/api/recent-trades?${query}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  });
  if (!response.ok) throw new Error('최근 체결을 불러오지 못했습니다.');
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.trades) || typeof body.stale !== 'boolean') throw new Error('잘못된 체결 응답입니다.');
  const trades = body.trades.filter((row): row is RecentTrade => isRecord(row)
    && typeof row.id === 'string' && row.id.length > 0
    && typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0
    && typeof row.size === 'number' && Number.isFinite(row.size) && row.size > 0
    && typeof row.time === 'number' && Number.isSafeInteger(row.time) && row.time > 0 && row.time <= 8_640_000_000_000_000
    && (row.side === 'buy' || row.side === 'sell'));
  if (body.trades.length && !trades.length) throw new Error('잘못된 체결 응답입니다.');
  return { trades: trades.slice(0, 50), stale: body.stale };
}
