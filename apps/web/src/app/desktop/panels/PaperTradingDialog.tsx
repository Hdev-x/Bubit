import { useEffect, useRef } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import { PaperTradingPanel } from '../../shared/paper/PaperTradingPanel';
import type { DesktopExchange } from '../hooks/useDesktopCandles';
import './PaperTradingDialog.css';

export function PaperTradingDialog({ user, symbol, exchange, isFutures, price, onClose }: {
  user: AuthUser;
  symbol: string;
  exchange: DesktopExchange;
  isFutures: boolean;
  price: number | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog className="paper-trading-dialog" ref={dialog} aria-labelledby="paper-dialog-title" onCancel={onClose}>
      <header className="paper-dialog-header">
        <h2 id="paper-dialog-title">모의투자</h2>
        <button type="button" onClick={onClose} aria-label="모의투자 닫기">닫기</button>
      </header>
      <PaperTradingPanel user={user} symbol={symbol} exchange={exchange} market={isFutures ? 'futures' : 'spot'} price={price} />
    </dialog>
  );
}
