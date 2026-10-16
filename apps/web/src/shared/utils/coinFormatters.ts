import type { ExchangeId } from '../constants/exchanges';

export type ProductFilter = 'SPOT' | 'FUTURES';

export function formatPriceWithDecimals(value: number, decimals: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  });
}

// 메타데이터가 없을 때만 실제 가격의 유효 소수 자릿수를 사용한다.
export function priceDecimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
}

export function getMarketPriceDecimals(
  precisionMap: ReadonlyMap<string, number>, exchange: ExchangeId,
  market: 'spot' | 'futures', symbol: string, fallback: number,
): number {
  return precisionMap.get(`${exchange}:${market.toUpperCase()}:${symbol}`) ?? fallback;
}

export function formatRate(rate: number) {
  return `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(2)}%`;
}

export function formatDisplaySymbol(symbol: string, productFilter: ProductFilter) {
  return productFilter === 'FUTURES' ? `${symbol}.P` : symbol;
}

export function getOfficialLogo(symbol: string) {
  const mapping: Record<string, string> = {
    'BTC': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    'ETH': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    'XRP': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
    'SOL': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    'DOGE': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
    'ADA': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
    'AVAX': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
    'DOT': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
    'LINK': 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
    'TRX': 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png'
  };
  return mapping[symbol.toUpperCase().trim()] || null;
}

export function coinColor(symbol: string) {
  const colors = ['#f59f2f', '#5d6fbd', '#12a594', '#36a3d9', '#3f67ff', '#d6aa32'];
  return colors[symbol.charCodeAt(0) % colors.length];
}

/** 자산 금액 표시 — 1 미만은 소수 4자리, 그 외 1자리. (Desktop lib/format·Mobile 자산 요약 3곳에 복사돼 있던 것을 통합, 2026-09-05) */
export function fmtAsset(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n > 0 && n < 1 ? 4 : 1,
    maximumFractionDigits: n > 0 && n < 1 ? 4 : 1,
  });
}

/** 거래 가격 표시 — 100 이상 2자리, 1 이상 4자리, 그 외 6자리(최소 2자리). Mobile 거래 카드 4곳 복사본 통합. */
export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const dec = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}
