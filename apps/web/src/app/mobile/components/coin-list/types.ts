// 코인 목록 화면의 필터·시트 상태 타입 — CoinListPage와 필터 바·바텀시트가 공유 (: no-explicit-any).
export type MarketFilter = 'USDT' | 'USDC' | 'KRW';
export type SortFilter = 'VOLUME' | 'TOP' | 'BOTTOM';
export type CoinListSheet = 'EXCHANGE' | 'MARKET' | 'SORT' | 'WATCHLIST';

const MARKET_FILTERS: readonly MarketFilter[] = ['USDT', 'USDC', 'KRW'];
const SORT_FILTERS: readonly SortFilter[] = ['VOLUME', 'TOP', 'BOTTOM'];
export const isMarketFilter = (v: string): v is MarketFilter => MARKET_FILTERS.some((m) => m === v);
export const isSortFilter = (v: string): v is SortFilter => SORT_FILTERS.some((m) => m === v);
