import { useState } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import { usePaperTrade } from '../../../hooks/account/usePaperTrade';
import { useLivePrice } from '../../../hooks/market/useLivePrice';
import { useRealtimePrices } from '../../../hooks/market/useRealtimePrices';
import { PaperOrderTicket } from '../../shared/paper/PaperOrderTicket';
import type { DesktopExchange } from '../hooks/useDesktopCandles';
import { fmtAsset, logoClass } from '../lib/format';
import { INVEST_TABS, type InvestTab } from '../lib/sections';
import { SidebarAssetSkeleton } from './SidebarBits';
import { PaperInvestPosition, type ValuedPaperPosition } from './PaperInvestPosition';
import { PaperOrderFloat } from './PaperOrderFloat';
import './panels.css';
import '../../shared/paper/PaperTradingPanel.css';
import './PaperInvestSection.css';

type Props = {
  user: AuthUser;
  symbol: string;
  exchange: DesktopExchange;
  isFutures: boolean;
  price: number | null;
  krw: boolean;
  usdKrw: number;
  orderOpen: boolean;
  active?: boolean;
  visible?: boolean;
  onCloseOrder: () => void;
  onSelectChart: (symbol: string, market: string, exchange: string) => void;
};

export function PaperInvestSection(props: Props) {
  return <PaperAccountInvest key={props.user.username} {...props} />;
}

/** AutoTrade 6708f771 WebApp의 내투자 화면에 수동 모의계좌를 연결한다. */
function PaperAccountInvest({ symbol, krw, usdKrw, orderOpen, active = true, visible = true, onCloseOrder, onSelectChart }: Props) {
  const paper = usePaperTrade(active);
  const [investTab, setInvestTab] = useState<InvestTab>('선물');
  const [portfolioOn, setPortfolioOn] = useState(true);
  const [positionsOn, setPositionsOn] = useState(true);
  const [walletOpen, setWalletOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<'positions' | 'orders'>('positions');
  const [showCurrent, setShowCurrent] = useState(false);
  const chartOrderSymbol = /^[A-Z0-9]+USDT$/.test(symbol) ? symbol : null;
  const [lastOrderSymbol, setLastOrderSymbol] = useState(chartOrderSymbol ?? 'BTCUSDT');
  if (chartOrderSymbol && chartOrderSymbol !== lastOrderSymbol) setLastOrderSymbol(chartOrderSymbol);
  const orderSymbol = chartOrderSymbol ?? lastOrderSymbol;
  const quoteEnabled = active && (orderOpen || paper.account.positions.some((position) => position.symbol === orderSymbol));
  const quote = useLivePrice({ symbol: orderSymbol, exchange: 'BITGET', isFutures: true, enabled: quoteEnabled });
  // 차트 거래소와 무관하게 Bitget의 해당 종목 가격이 준비된 뒤에만 주문한다.
  const orderPrice = quoteEnabled && quote.ready && quote.readySymbol === orderSymbol
    && quote.price !== null && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
  const realtime = useRealtimePrices([...new Set(paper.account.positions.map((position) => position.symbol))], true, active);
  const positions: ValuedPaperPosition[] = paper.account.positions.map((position) => {
    const current = (position.symbol === orderSymbol ? orderPrice : null) ?? realtime[position.symbol] ?? null;
    const markPrice = current !== null && Number.isFinite(current) && current > 0 ? current : null;
    const pnl = markPrice === null ? null : (markPrice - position.entryPrice) * position.size * (position.direction === 'long' ? 1 : -1);
    return { ...position, markPrice, pnl, roe: pnl === null || position.margin <= 0 ? null : pnl / position.margin * 100 };
  });
  const pendingPrices = positions.filter((position) => position.pnl === null).length;
  const unrealized = positions.reduce((sum, position) => sum + (position.pnl ?? 0), 0);
  const reserved = paper.account.orders.reduce((sum, order) => sum + order.margin, 0);
  const equity = paper.account.balance + reserved + positions.reduce((sum, position) => sum + position.margin, 0) + unrealized;
  const visiblePositions = showCurrent ? positions.filter((position) => position.symbol === symbol) : positions;
  const visibleOrders = showCurrent ? paper.account.orders.filter((order) => order.symbol === symbol) : paper.account.orders;
  const selected = visiblePositions.find((position) => position.id === selectedId) ?? visiblePositions[0];
  const currencyLabel = krw ? '원' : 'USDT';
  const formatAmount = (value: number) => krw ? `${Math.round(value * usdKrw).toLocaleString()}원` : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const approx = (value: number) => krw ? `≈ ${fmtAsset(value)} USDT` : `≈ ${Math.round(value * usdKrw).toLocaleString()}원`;
  const mainValue = krw ? Math.round(equity * usdKrw).toLocaleString() : fmtAsset(equity);
  const select = (position: ValuedPaperPosition) => { setSelectedId(position.id); onSelectChart(position.symbol, 'futures', 'BITGET'); };

  return <>
    <div className={`sidebar-section paper-invest${portfolioOn && positionsOn ? ' both-on' : ''}`} id="paper-invest" hidden={!visible}>
      <div className="invest-tabs">{INVEST_TABS.map((tab) => <button key={tab} type="button" className={`invest-tab${investTab === tab ? ' active' : ''}`} onClick={() => setInvestTab(tab)}>{tab}</button>)}</div>
      <div className="view-filters">
        <button type="button" className={`view-chip${portfolioOn ? ' on' : ''}`} aria-pressed={portfolioOn} onClick={() => { if (!portfolioOn || positionsOn) setPortfolioOn(!portfolioOn); }}>포트폴리오</button>
        <button type="button" className={`view-chip${positionsOn ? ' on' : ''}`} aria-pressed={positionsOn} onClick={() => { if (!positionsOn || portfolioOn) setPositionsOn(!positionsOn); }}>포지션</button>
      </div>
      {investTab === '현물' || investTab === '주식' ? <p className="paper-invest-message">모의 {investTab}은 준비 중이에요.<br />현재는 Bitget USDT 선물만 지원합니다.</p> : !paper.ready ? (
        paper.error ? <div role="alert" className="paper-invest-message">{paper.error}<button type="button" onClick={() => void paper.refetch()}>다시 시도</button></div> : <SidebarAssetSkeleton />
      ) : <div className="assets-scroll">
        {paper.error && <p role="alert" className="paper-invest-message">{paper.error}</p>}
        <div className="tas-hero">
          <span className="tas-hero-label">{pendingPrices ? '총자산 · 평가 대기' : '총자산'}</span>
          <div className="tas-hero-row">
            <strong className={`tas-hero-val${mainValue.length > 11 ? ' tas-hero-val--compact' : ''}`}>{pendingPrices ? '≈ ' : ''}{mainValue}</strong><span className="tas-cur">{currencyLabel}</span>
            <button type="button" className={`tas-wallet-toggle${walletOpen ? ' open' : ''}`} aria-label="모의 지갑 상세" aria-expanded={walletOpen} onClick={() => setWalletOpen(!walletOpen)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          </div>
          <span className="tas-hero-approx">{approx(equity)}</span>
          {pendingPrices > 0 && <span className="paper-invest-price-wait" role="status">{pendingPrices}개 종목의 현재가를 기다리는 중 · 평가금액은 잠정값입니다.</span>}
          <div className={`tas-wallet-wrap${walletOpen ? ' open' : ''}`}><div className="tas-wallet-detail">
            <div className="tas-wallet-col"><span className="tas-wallet-k">지갑 잔고</span><span className="tas-wallet-v">{formatAmount(paper.account.balance)}</span><span className="tas-wallet-approx">{approx(paper.account.balance)}</span></div>
            <div className="tas-wallet-col"><span className="tas-wallet-k">미실현 손익</span><span className={`tas-wallet-v ${pendingPrices ? '' : unrealized >= 0 ? 'up' : 'down'}`}>{pendingPrices ? '—' : `${unrealized >= 0 ? '+' : '-'}${formatAmount(Math.abs(unrealized))}`}</span><span className="tas-wallet-approx">{pendingPrices ? '현재가 수신 대기' : approx(unrealized)}</span></div>
          </div></div>
        </div>
        {portfolioOn && <div className="view-group"><div className="tas-divider" /><div className="tas-pos-title"><span>포트폴리오</span><span className="cnt">{positions.length}개</span></div>
          <div className="tas-mkt-list">{positions.length ? positions.map((position) => {
            const base = position.symbol.replace(/USDT$/, '');
            const color = position.pnl === null ? '' : position.pnl >= 0 ? 'up' : 'down';
            return <button type="button" key={position.id} className="tas-mkt-row" onClick={() => select(position)}>
              <span className={`tas-mkt-logo ${logoClass(base)}`}>{base.slice(0, 1)}</span><span className="tas-mkt-sym">{base}</span>
              <span className={`tas-mkt-pnlval ${color}`}>{position.pnl === null ? '—' : `${position.pnl >= 0 ? '+' : '-'}${formatAmount(Math.abs(position.pnl))}`}</span>
              <span className="tas-mkt-badges"><span className={`tas-mkt-badge dir ${position.direction}`}>{position.direction === 'long' ? 'Long' : 'Short'}</span><span className="tas-mkt-badge lev">{position.leverage}x</span></span>
              <span className={`tas-mkt-roe ${color}`}>{position.roe === null ? '평가 대기' : `${position.roe >= 0 ? '+' : ''}${position.roe.toFixed(2)}%`}</span>
            </button>;
          }) : <p className="paper-invest-empty">보유 모의 포지션이 없습니다.</p>}</div>
        </div>}
        {positionsOn && <div className="view-group"><div className="tas-divider" /><div className="pos-tabs">
          <button type="button" className={`pos-tab${detailTab === 'positions' ? ' active' : ''}`} onClick={() => setDetailTab('positions')}>Positions <span className="cnt">({visiblePositions.length})</span></button>
          <button type="button" className={`pos-tab${detailTab === 'orders' ? ' active' : ''}`} onClick={() => setDetailTab('orders')}>Orders <span className="cnt">({visibleOrders.length})</span></button>
          <label className="pos-show"><input type="checkbox" checked={showCurrent} onChange={(event) => setShowCurrent(event.target.checked)} /> Show current</label>
        </div>
          {detailTab === 'positions' ? selected ? <PaperInvestPosition position={selected} currencyLabel={currencyLabel} formatAmount={formatAmount} busy={paper.busy} onClose={paper.close} onSelect={() => select(selected)} /> : <p className="paper-invest-empty">보유 모의 포지션이 없습니다.</p>
            : visibleOrders.length ? <ul className="paper-invest-orders">{visibleOrders.map((order) => <li key={order.id}><div><strong>{order.symbol}</strong><span>{order.direction === 'long' ? 'Long' : 'Short'} · {order.leverage}x · @{order.limitPrice.toLocaleString()}</span></div><button type="button" disabled={paper.busy} onClick={() => void paper.cancel(order.id)}>취소</button></li>)}</ul> : <p className="paper-invest-empty">미체결 모의 주문이 없습니다.</p>}
        </div>}
      </div>}
      <div className="tas-notice">모의투자 · 실제 자산과 별도로 관리됩니다</div>
    </div>
    {visible && orderOpen && <PaperOrderFloat busy={paper.busy} onClose={onCloseOrder}>
      {paper.error && <p role="alert" className="paper-error">{paper.error}</p>}
      {!chartOrderSymbol && <p className="paper-muted">현재 차트는 USDT 종목이 아니므로 {orderSymbol} Bitget 선물 주문을 유지합니다.</p>}
      {!paper.ready ? <p className="paper-muted">모의계좌를 불러오는 중…</p> : <>
        {orderPrice === null && <p role="status" className="paper-muted">{quote.status === 'error' ? 'Bitget 시세를 확인하지 못했습니다. 지원 종목인지 확인해 주세요.' : 'Bitget 선물 시세를 기다리는 중입니다.'}</p>}
        <PaperOrderTicket key={orderSymbol} symbol={orderSymbol} price={orderPrice} balance={paper.account.balance}
          positions={paper.account.positions} busy={paper.busy || orderPrice === null}
          onPlace={(order) => orderPrice !== null && order.symbol === orderSymbol ? paper.place(order) : Promise.resolve(false)} onClose={paper.close} />
      </>}
    </PaperOrderFloat>}
  </>;
}
