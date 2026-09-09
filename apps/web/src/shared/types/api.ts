// 백엔드·거래소 응답의 원시 형태 — 화면은 이 타입을 직접 쓰지 않고 api/ 계층이 CoinTicker·Candle 등으로 정규화한다.
// 값은 거래소마다 문자열·숫자가 섞여 오므로 unknown으로 받고 toNumber/String으로 좁힌다 (: no-explicit-any, as-cast 없이).

/** 거래소 티커 한 행 — Bitget(lastPr·baseCoin…)·Binance(lastPrice·priceChangePercent…)·KRW 거래소 필드를 모두 optional로. */
export type RawTickerRow = Partial<Record<
  'symbol' | 'baseCoin' | 'quoteCoin' | 'lastPr' | 'lastPrice' | 'last' | 'close' | 'openUtc' | 'changeUtc24h' | 'change24h'
  | 'priceChangePercent' | 'priceChange' | 'usdtVolume' | 'quoteVolume' | 'baseVolume' | 'turnover24h', unknown>>;

/** 캔들 한 행 — [time, open, high, low, close, volume, …] 위치 기반 배열. */
export type CandleRow = unknown[];

/** 목록 응답 — 배열 그대로 오거나 { data: [...] }로 감싸여 온다(백엔드 프록시·Bitget 원형). */
export type ListEnvelope<T> = T[] | { data?: T[] | null } | null | undefined;

export function unwrapList<T>(payload: ListEnvelope<T>): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

/** /coin/api/extra-stats — CoinGecko 프록시. 배열·{data:[…]}·단일 객체 모두 관측됐다. */
export type ExtraStat = { market_cap?: unknown };
export type ExtraStatsResponse = ExtraStat[] | { data?: ExtraStat[] } | ExtraStat | null;

/** 오류 응답 본문 { error: string } */
export type ApiErrorBody = { error?: unknown };

/** Binance exchangeInfo */
export type BinanceExchangeInfo = { symbols?: Array<{ symbol?: unknown; contractType?: unknown; status?: unknown; quoteAsset?: unknown }> };

/** Bitget 공개 API 공통 봉투 { code: '00000', data: [...] } */
export type BitgetEnvelope<T> = { code?: unknown; data?: T[] };
export type BitgetContractRow = { symbol?: unknown };
