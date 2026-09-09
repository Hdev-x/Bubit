import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchBinanceCandles, fetchCoinCandles } from '../../api/server/marketApi';
import { fetchBithumbCandles, fetchUpbitCandles } from '../../api/exchange/krw/krwTickers';
import type { Candle } from '../../shared/types/market';
import type { ExchangeId } from '../../shared/constants/exchanges';

type ExchangeFilter = ExchangeId;
type ProductFilter = 'SPOT' | 'FUTURES';
export type ChartPeriod = '4H' | '1D' | '1W' | '1M';
type ChartType = 'candle' | 'line';

type UseCoinDetailChartParams = {
  detailOpen: boolean;
  selectedSymbol?: string;
  exchangeFilter: ExchangeFilter;
  productFilter: ProductFilter;
};

const PERIOD_GRANULARITY: Record<ChartPeriod, string> = {
  '4H': '4h',
  '1D': '1Dutc',
  '1W': '1Wutc',
  '1M': '1Mutc',
};

export function useCoinDetailChart({
  detailOpen,
  selectedSymbol,
  exchangeFilter,
  productFilter,
}: UseCoinDetailChartParams) {
  const [miniCandles, setMiniCandles] = useState<Candle[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1W');
  const [chartType, setChartType] = useState<ChartType>('candle');

  const chartExchange = exchangeFilter;
  const chartIsFutures = productFilter === 'FUTURES';
  const chartProductType = useMemo(() => {
    if (!chartIsFutures || exchangeFilter === 'UPBIT' || exchangeFilter === 'BITHUMB') return undefined;
    return 'USDT-FUTURES';
  }, [chartIsFutures, exchangeFilter]);
  const queryKey = detailOpen && selectedSymbol
    ? `${chartExchange}|${chartIsFutures}|${chartProductType ?? ''}|${selectedSymbol}|${chartPeriod}`
    : null;
  const [previousQuery, setPreviousQuery] = useState(queryKey);
  if (previousQuery !== queryKey) {
    setPreviousQuery(queryKey);
    if (queryKey) setMiniCandles([]);
  }

  useEffect(() => {
    if (!detailOpen || !selectedSymbol) return;
    let cancelled = false;
    const limit = chartExchange === 'BINANCE' ? 120 : 90;
    const granularity = PERIOD_GRANULARITY[chartPeriod];
    const loader = chartExchange === 'BINANCE'
      ? fetchBinanceCandles(selectedSymbol, granularity, limit, undefined, chartIsFutures)
      : chartExchange === 'UPBIT'
        ? fetchUpbitCandles(selectedSymbol, granularity, limit)
        : chartExchange === 'BITHUMB'
          ? fetchBithumbCandles(selectedSymbol, granularity, limit)
          : fetchCoinCandles(selectedSymbol, granularity, limit, undefined, chartProductType);

    loader
      .then(candles => { if (!cancelled && candles.length) setMiniCandles(candles); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [detailOpen, selectedSymbol, chartPeriod, chartExchange, chartIsFutures, chartProductType, queryKey]);

  const resetDetailChart = useCallback(() => {
    setMiniCandles([]);
    setChartPeriod('1W');
  }, []);

  const selectChartPeriod = useCallback((period: ChartPeriod) => {
    setMiniCandles([]);
    setChartPeriod(period);
  }, []);

  const toggleChartType = useCallback(() => {
    setChartType(type => type === 'candle' ? 'line' : 'candle');
  }, []);

  return {
    miniCandles,
    chartPeriod,
    chartType,
    chartExchange,
    chartProductType,
    resetDetailChart,
    selectChartPeriod,
    toggleChartType,
  };
}
