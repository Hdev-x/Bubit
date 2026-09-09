import { useCallback, useEffect, useState } from 'react';
import { fetchPricePrecision } from '../../api/server/marketApi';

export function usePricePrecision(defaultDecimals = 4) {
  const [precisionMap, setPrecisionMap] = useState<Map<string, number>>(new Map());

  // 서버가 차단·시간 초과로 빈 결과를 주면 60초 뒤 다시 받는다(최대 5회) — 예전엔 mount 시 1회뿐이라 기본 소수 자릿수로 굳었다
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let tries = 0;
    const load = () => {
      fetchPricePrecision().then((m) => {
        if (cancelled) return;
        if (m.size > 0) { setPrecisionMap(m); return; }
        if (++tries < 5) timer = window.setTimeout(load, 60_000);
      });
    };
    load();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, []);

  const getTickDecimals = useCallback((symbol: string) => {
    return precisionMap.get(symbol) ?? defaultDecimals;
  }, [defaultDecimals, precisionMap]);

  return {
    precisionMap,
    getTickDecimals,
  };
}
