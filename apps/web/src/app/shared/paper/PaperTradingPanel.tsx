import { usePaperTrade } from '../../../hooks/account/usePaperTrade';
import { useLivePrice } from '../../../hooks/market/useLivePrice';
import type { ExchangeId } from '../../../shared/constants/exchanges';
import { PaperOrderTicket } from './PaperOrderTicket';
import { PaperPositionRow } from './PaperPositions';
import './PaperTradingPanel.css';

type Props = {
  symbol: string;
  exchange?: ExchangeId;
  market?: 'spot' | 'futures';
  user?: { username: string } | null;
  price?: number | null;
  onLogin?: () => void;
  onOpenSettings?: () => void;
};

/** 계정 변경 시 내부 상태를 새로 만들어 이전 회원의 모의계좌를 남기지 않는다. */
export function PaperTradingPanel(props: Props) {
  if (!props.user) return (
    <section className="paper-panel"><h2>모의투자</h2><p>로그인하면 가상 잔고로 거래를 연습할 수 있습니다.</p>
      {props.onLogin && <button type="button" onClick={props.onLogin}>로그인</button>}
    </section>
  );
  return <PaperAccountPanel key={props.user.username} {...props} />;
}

function PaperAccountPanel({ symbol, exchange = 'BITGET', market = 'futures', price, onOpenSettings }: Props) {
  const paper = usePaperTrade();
  const supported = exchange === 'BITGET' && market === 'futures' && /^[A-Z0-9]+USDT$/.test(symbol);
  const live = useLivePrice({ symbol, exchange: 'BITGET', isFutures: true, enabled: supported && price === undefined });
  const currentPrice = price === undefined ? (live.ready ? live.price : null) : price;

  return (
    <section className="paper-panel" aria-label="모의투자">
      <header className="paper-panel-header"><div><h2>모의투자</h2><span className="paper-muted">가상 자금 · 실거래와 별도</span></div>
        {onOpenSettings && <button type="button" className="paper-settings-link" disabled={paper.busy} onClick={onOpenSettings}>설정</button>}
      </header>
      {paper.error && <div role="alert" className="paper-error">{paper.error} <button type="button" disabled={paper.busy} onClick={() => void paper.refetch()}>다시 시도</button></div>}
      {!paper.ready ? !paper.error && <p role="status">모의계좌를 불러오는 중…</p> : <>
        {supported ? <PaperOrderTicket key={symbol} symbol={symbol} price={currentPrice} balance={paper.account.balance} positions={paper.account.positions} busy={paper.busy} onPlace={paper.place} onClose={paper.close} />
          : <p className="paper-muted">모의 주문은 Bitget USDT 선물 종목에서 지원합니다. 기존 포지션은 아래에서 관리할 수 있습니다.</p>}
        {!supported && <>
          <h3>포지션 <span>{paper.account.positions.length}</span></h3>
          {paper.account.positions.length ? <ul className="paper-positions">{paper.account.positions.map((position) => (
            <PaperPositionRow key={position.id} position={position} busy={paper.busy} onClose={paper.close} />
          ))}</ul> : <p className="paper-muted">보유한 모의 포지션이 없습니다.</p>}
        </>}
        <h3>미체결 주문 <span>{paper.account.orders.length}</span></h3>
        {paper.account.orders.length ? <ul className="paper-orders">{paper.account.orders.map((order) => (
          <li key={order.id}><span className={order.direction === 'long' ? 'up' : 'down'}>{order.direction === 'long' ? '롱' : '숏'}</span>
            <strong>{order.symbol.replace(/USDT$/, '')}</strong><span className="paper-order-price">@ {order.limitPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
            <button type="button" disabled={paper.busy} onClick={() => void paper.cancel(order.id)} aria-label={`${order.symbol} 지정가 주문 취소`}>×</button>
          </li>
        ))}</ul> : <p className="paper-muted">대기 중인 모의 주문이 없습니다.</p>}
      </>}
    </section>
  );
}
