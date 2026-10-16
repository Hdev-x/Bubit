import { useState } from 'react';
import { useRecentTrades } from '../../../hooks/market/useRecentTrades';
import { EXCHANGES } from '../../../shared/constants/exchanges';
import { formatRate } from '../../../shared/utils/coinFormatters';
import type { DesktopExchange } from '../hooks/useDesktopCandles';
import './OrderbookCompanion.css';

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 8 });
const time = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function OrderbookCompanion({ exchange, symbol, isFutures, price, funding, changeRate }: {
  exchange: DesktopExchange;
  symbol: string;
  isFutures: boolean;
  price: number | null;
  funding?: string;
  changeRate?: number | null;
}) {
  const [tab, setTab] = useState<'trades' | 'market'>('trades');
  const supported = !isFutures || EXCHANGES[exchange].supportsFutures;
  const { trades, status } = useRecentTrades(exchange, symbol, isFutures, tab === 'trades' && supported);
  const quote = EXCHANGES[exchange].quote;
  const base = symbol.endsWith(quote) ? symbol.slice(0, -quote.length) : symbol;

  return <section className="ob-companion" aria-label="호가 보조 정보">
    <div className="ob-companion-tabs" role="group" aria-label="호가 보조 보기">
      <button type="button" aria-pressed={tab === 'trades'} onClick={() => setTab('trades')}>최근 체결</button>
      <button type="button" aria-pressed={tab === 'market'} onClick={() => setTab('market')}>시장 정보</button>
      {tab === 'trades' && supported && <span>2초 갱신</span>}
    </div>
    {tab === 'trades' ? <div className="ob-companion-trades">
      {!supported ? <p className="ob-companion-status">이 시장의 최근 체결은 지원하지 않습니다.</p> : <>
        <div className="ob-companion-row ob-companion-head"><span>시간</span><span>가격 ({quote})</span><span>수량 ({base})</span><span>방향</span></div>
        {status === 'loading' && <p className="ob-companion-status" role="status">체결 내역을 불러오는 중입니다.</p>}
        {status === 'error' && <p className="ob-companion-status" role="status">체결 갱신이 지연되고 있습니다.</p>}
        {status === 'ready' && !trades.length && <p className="ob-companion-status">최근 체결이 없습니다.</p>}
        <div className="ob-companion-list" aria-label="최근 체결 목록">
          {trades.map(trade => <div className="ob-companion-row" key={trade.id}>
            <time dateTime={new Date(trade.time).toISOString()}>{time.format(trade.time)}</time>
            <span className={trade.side === 'buy' ? 'up' : 'down'} aria-label={`${trade.side === 'buy' ? '매수' : '매도'} ${number.format(trade.price)}`}>{number.format(trade.price)}</span>
            <span>{number.format(trade.size)}</span>
            <span className={trade.side === 'buy' ? 'up' : 'down'}>{trade.side === 'buy' ? '매수' : '매도'}</span>
          </div>)}
        </div>
      </>}
    </div> : <dl className="ob-companion-market">
      <div><dt>현재가 ({quote})</dt><dd>{price != null && Number.isFinite(price) ? number.format(price) : '—'}</dd></div>
      <div><dt>{quote === 'KRW' ? '전일 대비' : 'UTC 일봉 대비'}</dt><dd className={changeRate != null && changeRate >= 0 ? 'up' : 'down'}>{changeRate != null && Number.isFinite(changeRate) ? formatRate(changeRate) : '—'}</dd></div>
      {isFutures && <div><dt>펀딩 / 다음 정산</dt><dd>{funding || '—'}</dd></div>}
      <div><dt>거래소 · 시장</dt><dd>{EXCHANGES[exchange].label} · {isFutures ? '선물' : '현물'}</dd></div>
    </dl>}
  </section>;
}
