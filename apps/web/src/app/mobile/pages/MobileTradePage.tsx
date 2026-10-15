import { useState, type ComponentProps } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import { PaperTradingPanel } from '../../shared/paper/PaperTradingPanel';
import OrderPage from './OrderPage';
import './MobileTradePage.css';

type Props = ComponentProps<typeof OrderPage> & { user: AuthUser };

export default function MobileTradePage({ user, ...props }: Props) {
  const [paper, setPaper] = useState(false);
  return (
    <div className="mobile-trade-page">
      <nav className="mobile-trade-mode" aria-label="거래 모드">
        <button type="button" aria-pressed={!paper} onClick={() => setPaper(false)}>계좌 조회</button>
        <button type="button" aria-pressed={paper} onClick={() => { props.onTabBar?.(null); setPaper(true); }}>모의투자</button>
      </nav>
      {paper ? (
        <section className="mobile-paper-trading">
          {props.active && <PaperTradingPanel user={user} symbol={props.symbol} exchange="BITGET" market={props.tradeMarketReq?.market ?? 'futures'} />}
        </section>
      ) : <OrderPage {...props} />}
    </div>
  );
}
