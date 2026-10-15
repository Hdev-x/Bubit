import { useState } from 'react';
import type { placePaperOrder } from '../../../api/server/paperApi';

type Order = Parameters<typeof placePaperOrder>[0];

export function PaperOrderTicket({ symbol, price, balance, busy, onPlace }: {
  symbol: string;
  price: number | null;
  balance: number;
  busy: boolean;
  onPlace: (order: Order) => Promise<boolean>;
}) {
  const [type, setType] = useState<Order['type']>('market');
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [error, setError] = useState('');
  const fillPrice = type === 'limit' ? Number(limitPrice) : (price ?? 0);
  const amount = Number(margin);
  const place = async (direction: Order['direction']) => {
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setError('가용 잔고 이내의 증거금을 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
      setError(type === 'limit' ? '유효한 지정가를 입력해 주세요.' : '현재가를 기다려 주세요.');
      return;
    }
    setError('');
    if (await onPlace({ type, symbol, direction, marginUsdt: amount, leverage, price: fillPrice })) setMargin('');
  };

  return (
    <form className="paper-ticket" onSubmit={(event) => event.preventDefault()}>
      <div className="paper-ticket-heading"><strong>{symbol}</strong><span>Bitget · USDT 선물</span></div>
      <div className="paper-ticket-fields">
        <label>주문 방식<select value={type} onChange={(event) => {
          setType(event.target.value as Order['type']);
          if (!limitPrice && price) setLimitPrice(String(price));
        }} disabled={busy}>
          <option value="market">시장가</option><option value="limit">지정가</option>
        </select></label>
        <label>레버리지<select value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} disabled={busy}>
          {[1, 2, 5, 10, 20, 50, 75, 100].map((value) => <option key={value} value={value}>{value}x</option>)}
        </select></label>
      </div>
      <label>가격 (USDT)<input type="number" min="0" step="any" inputMode="decimal" aria-label="모의 주문 가격"
        value={type === 'limit' ? limitPrice : price ?? ''} disabled={busy || type === 'market'}
        onChange={(event) => setLimitPrice(event.target.value)} placeholder="현재가 확인 중" /></label>
      <label>증거금 (USDT)<input type="number" min="0" max={balance} step="any" inputMode="decimal" aria-label="모의 주문 증거금"
        value={margin} onChange={(event) => setMargin(event.target.value)} disabled={busy} placeholder="0" /></label>
      <div className="paper-percentages">{[25, 50, 75, 100].map((percent) => (
        <button key={percent} type="button" disabled={busy} onClick={() => setMargin((balance * percent / 100).toFixed(8))}>{percent}%</button>
      ))}</div>
      <p className="paper-muted">주문 규모 {Number.isFinite(amount) ? (amount * leverage).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'} USDT</p>
      {error && <p role="alert" className="paper-error">{error}</p>}
      <div className="paper-order-actions">
        <button type="button" className="paper-long" disabled={busy} onClick={() => void place('long')}>롱 진입</button>
        <button type="button" className="paper-short" disabled={busy} onClick={() => void place('short')}>숏 진입</button>
      </div>
    </form>
  );
}
