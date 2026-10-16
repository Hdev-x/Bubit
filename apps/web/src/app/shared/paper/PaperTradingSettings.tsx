import { useState } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import { usePaperTrade } from '../../../hooks/account/usePaperTrade';
import './PaperTradingPanel.css';

export function PaperTradingSettings({ user }: { user: AuthUser }) {
  return <AccountSettings key={user.username} />;
}

function AccountSettings() {
  const paper = usePaperTrade();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const locked = [...paper.account.positions, ...paper.account.orders].reduce((sum, item) => sum + item.margin, 0);

  return (
    <section className="paper-panel paper-settings" aria-label="모의투자 설정">
      {paper.error && <p role="alert" className="paper-error">{paper.error} <button type="button" disabled={paper.busy} onClick={() => void paper.refetch()}>다시 시도</button></p>}
      {!paper.ready ? !paper.error && <p role="status">모의계좌를 불러오는 중…</p> : <>
        <dl className="paper-balances">
          <div><dt>가용 잔고</dt><dd>{paper.account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>USDT</small></dd></div>
          <div><dt>사용 증거금</dt><dd>{locked.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>USDT</small></dd></div>
        </dl>
        <dl className="paper-settings-details">
          <div><dt>가상 자산</dt><dd>{(paper.account.balance + locked).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT <small>평가손익 제외</small></dd></div>
          <div><dt>포지션 / 미체결</dt><dd>{paper.account.positions.length}개 / {paper.account.orders.length}개</dd></div>
          <div><dt>지원 시장</dt><dd>Bitget USDT 선물</dd></div>
          <div><dt>주문</dt><dd>시장가·지정가 / 롱·숏</dd></div>
        </dl>
        <p className="paper-muted paper-terms">수수료·펀딩·강제청산·TP/SL은 반영하지 않습니다. 시장가 주문은 서버가 확인한 시세로 체결되어 화면 가격과 다를 수 있습니다.</p>
        <div className="paper-settings-reset">
          <h3>모의계좌 초기화</h3>
          <p className="paper-muted">모든 모의 포지션과 주문을 삭제하고 가상 잔고를 10,000 USDT로 되돌립니다.</p>
          {confirmReset ? <div className="paper-reset-confirm" role="group" aria-label="모의계좌 초기화 확인">
            <p>초기화하면 이전 모의 포지션과 주문을 복구할 수 없습니다.</p>
            <button type="button" disabled={paper.busy} onClick={() => void paper.reset().then((done) => {
              if (done) { setConfirmReset(false); setResetDone(true); }
            })}>초기화 확인</button>
            <button type="button" disabled={paper.busy} onClick={() => setConfirmReset(false)}>돌아가기</button>
          </div> : <button type="button" disabled={paper.busy} onClick={() => { setConfirmReset(true); setResetDone(false); }}>모의계좌 초기화</button>}
          {resetDone && <p role="status" className="paper-muted">가상 잔고를 10,000 USDT로 초기화했습니다.</p>}
        </div>
      </>}
    </section>
  );
}
