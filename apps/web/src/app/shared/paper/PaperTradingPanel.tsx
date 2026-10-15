import { useState } from 'react';
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

function PaperAccountPanel({ symbol, exchange = 'BITGET', market = 'futures', price }: Props) {
  const paper = usePaperTrade();
  const [confirmReset, setConfirmReset] = useState(false);
  const supported = exchange === 'BITGET' && market === 'futures' && /^[A-Z0-9]+USDT$/.test(symbol);
  const live = useLivePrice({ symbol, exchange: 'BITGET', isFutures: true, enabled: supported && price === undefined });
  const currentPrice = price === undefined ? (live.ready ? live.price : null) : price;
  const locked = [...paper.account.positions, ...paper.account.orders].reduce((sum, item) => sum + item.margin, 0);

  return (
    <section className="paper-panel" aria-label="모의투자">
      <header className="paper-panel-header"><div><h2>모의투자</h2><span className="paper-muted">가상 자금 · 실거래와 별도</span></div>
        <button type="button" disabled={!paper.ready || paper.busy} onClick={() => setConfirmReset(true)}>초기화</button>
      </header>
      {paper.error && <div role="alert" className="paper-error">{paper.error} <button type="button" disabled={paper.busy} onClick={() => void paper.refetch()}>다시 시도</button></div>}
      {!paper.ready ? !paper.error && <p role="status">모의계좌를 불러오는 중…</p> : <>
        <dl className="paper-balances">
          <div><dt>가용 잔고</dt><dd>{paper.account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>USDT</small></dd></div>
          <div><dt>사용 증거금</dt><dd>{locked.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>USDT</small></dd></div>
        </dl>
        {confirmReset && <div className="paper-reset-confirm" role="group" aria-label="모의계좌 초기화 확인">
          <p>모든 모의 포지션과 주문을 지우고 10,000 USDT로 초기화할까요?</p>
          <button type="button" disabled={paper.busy} onClick={() => void paper.reset().then((done) => { if (done) setConfirmReset(false); })}>초기화 확인</button>
          <button type="button" disabled={paper.busy} onClick={() => setConfirmReset(false)}>돌아가기</button>
        </div>}
        {supported ? <PaperOrderTicket key={symbol} symbol={symbol} price={currentPrice} balance={paper.account.balance} busy={paper.busy} onPlace={paper.place} />
          : <p className="paper-muted">모의 주문은 Bitget USDT 선물 종목에서 지원합니다. 기존 포지션은 아래에서 관리할 수 있습니다.</p>}
        <p className="paper-muted paper-terms">수수료·펀딩·강제청산은 반영하지 않습니다. 시장가 주문은 서버가 확인한 시세로 체결되어 화면 가격과 다를 수 있습니다.</p>
        <h3>포지션 <span>{paper.account.positions.length}</span></h3>
        {paper.account.positions.length ? <ul className="paper-positions">{paper.account.positions.map((position) => (
          <PaperPositionRow key={position.id} position={position} busy={paper.busy} onClose={paper.close} />
        ))}</ul> : <p className="paper-muted">보유한 모의 포지션이 없습니다.</p>}
        <h3>미체결 주문 <span>{paper.account.orders.length}</span></h3>
        {paper.account.orders.length ? <ul className="paper-orders">{paper.account.orders.map((order) => (
          <li key={order.id}><div><strong>{order.symbol}</strong><span>{order.direction === 'long' ? '롱' : '숏'} · {order.leverage}x · {order.limitPrice.toLocaleString()} USDT</span></div>
            <button type="button" disabled={paper.busy} onClick={() => void paper.cancel(order.id)} aria-label={`${order.symbol} 지정가 주문 취소`}>취소</button>
          </li>
        ))}</ul> : <p className="paper-muted">대기 중인 모의 주문이 없습니다.</p>}
      </>}
    </section>
  );
}
