// 사이드바 '관심' 섹션 — 마켓에서 별표로 담은 즐겨찾기 목록.
// 즐겨찾기 키(거래소|마켓|심볼)별로 해당 거래소 종목을 로드해 시세를 붙이고, 비트겟/바이낸스는 WS로 실시간 갱신.
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  subscribeBitgetSpotTickers, subscribeBitgetFuturesTickers,
  subscribeBinanceSpotTickers, subscribeBinanceFuturesTickers,
  type RealtimeTicker,
} from '../../../api/server/coinRealtime';
import { usePricePrecision } from '../../../hooks/market/usePricePrecision';
import { useMarketTickerLists } from '../../../hooks/market/useMarketTickerLists';
import { refreshTickerList, type TickerListKey } from '../../../api/server/marketTickerLists';
import { subscribeKrwTickers } from '../../../api/exchange/krw/krwRealtime';
import type { CoinTicker } from '../../../shared/types/market';
import type { ExchangeId } from '../../../shared/constants/exchanges';
import { parseFav, isDivider, dividerType, dividerLabel, withDividerLabel, useDesktopFavorites, useCoinLogos, type Market } from './marketShared';
import { SymbolRow } from './MarketRow';
import './panels.css';

// 드래그한 키를 타깃 키 위치로 이동(필터 무관하게 키 기준으로 favs 재배치)
function moveKey(arr: string[], fromKey: string, toKey: string): string[] {
  if (fromKey === toKey) return arr;
  const next = arr.filter((k) => k !== fromKey);
  const ti = next.indexOf(toKey);
  if (ti < 0) return arr;
  next.splice(ti, 0, fromKey);
  return next;
}

function pendingTicker(symbol: string, exchange: ExchangeId): CoinTicker {
  const quoteSymbol = exchange === 'UPBIT' || exchange === 'BITHUMB' ? 'KRW' : 'USDT';
  const baseSymbol = symbol.endsWith(quoteSymbol) ? symbol.slice(0, -quoteSymbol.length) : symbol;
  return { symbol, baseSymbol, quoteSymbol, name: symbol, last: NaN, change: NaN, changeRate: NaN, volume: NaN, tickDecimals: 2 };
}

export function FavoritesPanel({ active, onSelect, editMode = false }: { active: boolean; onSelect?: (symbol: string, market: Market, exchange: ExchangeId) => void; editMode?: boolean }) {
  const { favs, isFav, toggleFav, setOrder, removeKey } = useDesktopFavorites();
  const dragKeyRef = useRef<string | null>(null);
  const logos = useCoinLogos();
  const [liveMap, setLiveMap] = useState<Record<string, RealtimeTicker>>({});
  const [wasActive, setWasActive] = useState(active);
  const { precisionMap } = usePricePrecision();
  const getDecimals = useCallback((t: CoinTicker) => precisionMap.get(t.symbol) ?? t.tickDecimals, [precisionMap]);

  const favsKey = favs.join(',');

  if (wasActive !== active) {
    setWasActive(active);
    setLiveMap({});
  }

  // 거래소|마켓 → 심볼[] 그룹 (WS 구독 단위)
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    favs.forEach(f => { if (isDivider(f)) return; const { exchange, market } = parseFav(f); const k = `${exchange}|${market}`; (g[k] ||= []).push(parseFav(f).symbol); });
    Object.values(g).forEach(symbols => symbols.sort());
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- favs 배열 참조 대신 favsKey 내용 키가 바뀔 때 그룹을 다시 계산한다.
  }, [favsKey]);
  const groupsKey = JSON.stringify(groups);
  const tickerLists = useMarketTickerLists(Object.keys(groups) as TickerListKey[], active);
  const failedKeys = (Object.keys(groups) as TickerListKey[]).filter(key => tickerLists[key]?.status === 'error');
  const tickerMap = useMemo(() => {
    const map: Record<string, CoinTicker> = {};
    Object.entries(tickerLists).forEach(([key, list]) => {
      list?.tickers.forEach(ticker => { map[`${key}|${ticker.symbol}`] = ticker; });
    });
    return map;
  }, [tickerLists]);

  // 저장된 종목 키로 즉시 구독하므로 REST 목록보다 먼저 받은 가격도 표시할 수 있다.
  useEffect(() => {
    if (!active) return;
    const subs: Array<{ close: () => void }> = [];
    let current = true;
    Object.entries(groups).forEach(([k, symbols]) => {
      if (!symbols.length) return;
      const [ex, market] = k.split('|');
      const cb = (tk: RealtimeTicker) => {
        if (current) setLiveMap(prev => ({ ...prev, [`${ex}|${market}|${tk.symbol}`]: tk }));
      };
      if (ex === 'BITGET') subs.push(market === 'spot' ? subscribeBitgetSpotTickers(symbols, cb) : subscribeBitgetFuturesTickers(symbols, cb));
      else if (ex === 'BINANCE') subs.push(market === 'spot' ? subscribeBinanceSpotTickers(symbols, cb) : subscribeBinanceFuturesTickers(symbols, cb));
      else if ((ex === 'UPBIT' || ex === 'BITHUMB') && market === 'spot') subs.push(subscribeKrwTickers(ex, symbols, cb));
    });
    return () => { current = false; subs.forEach(s => s.close()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groups 객체 참조 대신 groupsKey 내용 키가 바뀔 때만 WS를 재구독한다.
  }, [active, groupsKey]);

  // 종목 행은 즉시 표시하고, 캐시·REST·WS가 도착하면 알려진 값만 채운다.
  type Item =
    | { type: 'divider'; key: string; label: string; dtype: ReturnType<typeof dividerType> }
    | { type: 'symbol'; key: string; exchange: ExchangeId; market: Market; t: CoinTicker };
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const key of favs) {
      if (isDivider(key)) { out.push({ type: 'divider', key, label: dividerLabel(key), dtype: dividerType(key) }); continue; }
      const { exchange, market, symbol } = parseFav(key);
      const mapKey = `${exchange}|${market}|${symbol}`;
      const base = tickerMap[mapKey] ?? pendingTicker(symbol, exchange);
      const live = liveMap[mapKey];
      // 거래대금은 REST(24h) 유지 — WS volume은 kline UTC누적이라 24h와 충돌(가격·등락만 실시간)
      const t: CoinTicker = live ? { ...base, last: live.price ?? base.last, changeRate: live.changeRate ?? base.changeRate } : base;
      out.push({ type: 'symbol', key, exchange, market, t });
    }
    return out;
  }, [favs, tickerMap, liveMap]);

  if (favs.length === 0) {
    return <p className="wm-empty">관심종목이 없어요.<br />마켓에서 별표를 눌러 추가하세요.</p>;
  }

  return (
    <div className="wm">
      {failedKeys.length > 0 && <p className="wm-list-status" role="status">일부 시세를 갱신하지 못했어요.
        <button type="button" className="wm-retry" onClick={() => { failedKeys.forEach(key => { void refreshTickerList(key, true); }); }}>다시 시도</button>
      </p>}
      <div className="wm-list" style={{ paddingTop: 4 }}>
        <div className="wm-list-fade">
          {/* eslint-disable-next-line react-hooks/refs -- dragKeyRef는 실제 drag event callback에서만 접근하며 protected dataTransfer에 의존하지 않는다. */}
          {items.map((item) => {
            const key = item.key;
            const dragProps = editMode ? {
              draggable: true,
              onDragStart: () => { dragKeyRef.current = key; },
              onDragOver: (e: React.DragEvent) => e.preventDefault(),
              onDragEnter: (e: React.DragEvent<HTMLDivElement>) => { if (dragKeyRef.current && dragKeyRef.current !== key) e.currentTarget.classList.add('wm-row-dragover'); },
              onDragLeave: (e: React.DragEvent<HTMLDivElement>) => e.currentTarget.classList.remove('wm-row-dragover'),
              onDrop: (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.classList.remove('wm-row-dragover'); const from = dragKeyRef.current; if (from) setOrder(moveKey(favs, from, key)); dragKeyRef.current = null; },
              onDragEnd: () => { dragKeyRef.current = null; },
            } : undefined;
            if (item.type === 'divider') {
              // 라벨 편집이 가능해야 하므로 행 전체 draggable 대신 드롭 핸들러만 행에, 드래그 소스는 ≡ 핸들에.
              const dropProps = dragProps ? { onDragOver: dragProps.onDragOver, onDragEnter: dragProps.onDragEnter, onDragLeave: dragProps.onDragLeave, onDrop: dragProps.onDrop } : undefined;
              const hasText = item.dtype !== 'line'; // text · both
              const hasRule = item.dtype === 'line';  // line만 가로 줄(both은 border-top)
              return (
                <div key={key} className={`wm-divider wm-divider-${item.dtype}${editMode ? ' wm-divider-edit' : ''}`} {...(dropProps ?? {})}>
                  {editMode && (
                    <span className="wm-drag" aria-hidden="true" draggable onDragStart={() => { dragKeyRef.current = key; }} onDragEnd={() => { dragKeyRef.current = null; }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
                    </span>
                  )}
                  {hasText && (
                    <span
                      className="wm-divider-label"
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      spellCheck={false}
                      onBlur={(e) => { const v = e.currentTarget.textContent?.trim() || '구분선'; if (v !== item.label) setOrder(favs.map((k) => (k === key ? withDividerLabel(key, v) : k))); }}
                    >{item.label}</span>
                  )}
                  {hasRule && <span className="wm-divider-rule" aria-hidden="true" />}
                  {editMode && (
                    <button type="button" className="wm-row-remove" onClick={() => removeKey(key)} aria-label="구분선 삭제">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  )}
                </div>
              );
            }
            const { exchange, market, t } = item;
            return (
              <SymbolRow
                key={key}
                ticker={t}
                market={market}
                decimals={getDecimals(t)}
                faved={isFav(exchange, t.symbol, market)}
                onToggleFav={() => toggleFav(exchange, t.symbol, market)}
                onClick={() => onSelect?.(t.symbol, market, exchange)}
                logoUrl={logos[t.baseSymbol]}
                editMode={editMode}
                onRemove={() => toggleFav(exchange, t.symbol, market)}
                dragProps={dragProps}
                hideStar
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
