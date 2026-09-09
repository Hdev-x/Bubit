import { useEffect, useState } from 'react';
import { type BitgetTicker } from '../../../api/exchange/bitget/bitgetTicker';
import { fetchHeaderTicker } from '../../../api/exchange/headerTicker';
import { fetchCoinMarketCap } from '../../../api/server/marketApi';
import { EXCHANGES } from '../../../shared/constants/exchanges';
import type { useCandleLoader } from '../../../chart/hooks/useCandleLoader';
import type { DesktopExchange } from './useDesktopCandles';

// Desktop 종목 헤더 데이터 — 24h 티커·일봉 2개·시총 폴링과 통합 스냅샷(H). DesktopApp에서 옮김 .
// livePrice·dailyOpenPrice(캔들 1Dutc 시가)·priceReady(현재 키의 seed 완료 여부, 전엔 loadedSymbol 심볼 비교)는 useLivePrice 결과,
// loadCandles는 DesktopApp의 useCandleLoader(일봉 통계용), fmtPx는 DesktopApp의 가격 포맷터.
export function useHeaderSnapshot({ symbol, exchange, isFutures, base, loadCandles, livePrice, dailyOpenPrice, priceReady, fmtPx }: {
  symbol: string;
  exchange: DesktopExchange;
  isFutures: boolean;
  base: string;
  loadCandles: ReturnType<typeof useCandleLoader>;
  livePrice: number | null;
  dailyOpenPrice: number | null;
  priceReady: boolean;
  fmtPx: (n: number | null | undefined) => string;
}) {
  const marketKey = `${exchange}|${symbol}|${isFutures}`;

  // ── 헤더 정보 — 거래소별 24h 티커(고가/저가/거래량/거래대금) ──
  // 거래소·종목·상품 key로 조회 결과를 구분한다. 실패도 {key, t:null}로 완료해 스왑이 멈추지 않게 한다.
  const [tkr, setTkr] = useState<{ key: string; t: BitgetTicker | null } | null>(null);
  useEffect(() => {
    let ignore = false;
    const load = () => {
      fetchHeaderTicker(exchange, symbol, isFutures)
        .then((t) => { if (!ignore) setTkr({ key: marketKey, t: t ?? null }); })
        .catch(() => { if (!ignore) setTkr({ key: marketKey, t: null }); });
    };
    load();
    const id = setInterval(load, 4000);
    return () => { ignore = true; clearInterval(id); };
  }, [symbol, exchange, isFutures, marketKey]);
  const fmtVol = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  };

  // ── 헤더 정보 — 전날 종가/당일 시가(일봉 2개), 시가총액(백엔드 CoinGecko 프록시) ──
  // 실패/없음도 null 값으로 resolve(key/base는 채움) → 통합 스왑이 멈추지 않음
  const [dayStats, setDayStats] = useState<{ key: string; prevClose: number | null; todayOpen: number | null } | null>(null);
  const [marketCap, setMarketCap] = useState<{ base: string; cap: number | null } | null>(null);
  useEffect(() => {
    let ignore = false;
    // loadCandles는 거래소별 라우팅(Bitget/Binance/업비트/빗썸) — KRW도 일봉 2개로 전날종가/당일시가 산출
    const loadDay = () => {
      loadCandles('1Dutc', 2)
        .then((cs) => {
          if (ignore) return;
          if (cs.length < 1) { setDayStats({ key: marketKey, prevClose: null, todayOpen: null }); return; }
          const prev = cs[cs.length - 2] ?? cs[0];
          const today = cs[cs.length - 1];
          setDayStats({ key: marketKey, prevClose: prev.close, todayOpen: today.open });
        })
        .catch(() => { if (!ignore) setDayStats({ key: marketKey, prevClose: null, todayOpen: null }); });
    };
    const loadCap = () => {
      fetchCoinMarketCap(base)
        .then((mc) => { if (!ignore) setMarketCap({ base, cap: mc ?? null }); })
        .catch(() => { if (!ignore) setMarketCap({ base, cap: null }); });
    };
    loadDay(); loadCap();
    const idDay = setInterval(loadDay, 60000);   // 일봉 60초
    const idCap = setInterval(loadCap, 300000);  // 시총 5분(백엔드 10분 캐시)
    return () => { ignore = true; clearInterval(idDay); clearInterval(idCap); };
  }, [symbol, base, loadCandles, marketKey]);

  // 현재 선택의 가격 seed가 준비되면 primary identity·가격을 교체한다.
  // 티커·일봉 통계·시총은 chart core를 막지 않고, 각 결과의 key가 현재 선택과 맞을 때만 채운다.
  const primaryReady =
    priceReady && livePrice != null;
  const [lastHeader, setLastHeader] = useState<{
    symbol: string; title: string; isFutures: boolean;
    exchange: DesktopExchange; base: string;
    px: string; chg: { abs: string; pct: string; up: boolean } | null;
    prevClose: string; todayOpen: string; high: string; low: string;
    baseLabel: string; quoteLabel: string; baseVol: string; quoteVol: string; cap: string;
  } | null>(null);
  let H = lastHeader;
  if (primaryReady) {
    const open = dailyOpenPrice;
    const abs = open == null ? null : livePrice - open;
    const pct = abs != null && open != null && open !== 0 ? (abs / open) * 100 : null;
    const t = tkr?.key === marketKey ? tkr.t : null;
    const nextHeader = {
      symbol,
      title: isFutures ? `${symbol}.P` : symbol,
      isFutures,
      exchange,
      base,
      px: fmtPx(livePrice),
      chg: abs == null || pct == null ? null : { abs: fmtPx(abs), pct: pct.toFixed(2), up: pct >= 0 },
      prevClose: dayStats?.key === marketKey && dayStats.prevClose != null ? fmtPx(dayStats.prevClose) : '—',
      todayOpen: dayStats?.key === marketKey && dayStats.todayOpen != null ? fmtPx(dayStats.todayOpen) : dailyOpenPrice != null ? fmtPx(dailyOpenPrice) : '—',
      high: t ? fmtPx(t.high24h) : '—',
      low: t ? fmtPx(t.low24h) : '—',
      baseLabel: base,
      quoteLabel: EXCHANGES[exchange].quote,
      baseVol: t ? fmtVol(t.baseVolume) : '—',
      quoteVol: t ? fmtVol(t.quoteVolume) : '—',
      cap: marketCap?.base === base && marketCap.cap != null ? '$' + fmtVol(marketCap.cap) : '—',
    };
    // 포맷된 작은 스냅샷 값이 바뀔 때만 저장한다. formatter 함수 참조는 매 렌더 달라도 된다.
    if (JSON.stringify(lastHeader) !== JSON.stringify(nextHeader)) {
      setLastHeader(nextHeader);
      H = nextHeader;
    }
  }

  return { H, fmtVol, primaryReady, marketKey };
}
