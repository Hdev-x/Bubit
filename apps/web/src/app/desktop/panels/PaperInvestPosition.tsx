import type { PaperPositionRaw } from '../../../api/server/paperApi';

export type ValuedPaperPosition = PaperPositionRaw & {
  markPrice: number | null;
  pnl: number | null;
  roe: number | null;
};

export function PaperInvestPosition({ position, currencyLabel, formatAmount, busy, onClose, onSelect }: {
  position: ValuedPaperPosition;
  currencyLabel: string;
  formatAmount: (amount: number) => string;
  busy: boolean;
  onClose: (id: number) => Promise<boolean>;
  onSelect: () => void;
}) {
  const { pnl, roe } = position;
  const color = pnl === null ? '' : pnl >= 0 ? 'up' : 'down';
  const base = position.symbol.replace(/USDT$/, '');
  return (
    <div className="pos-card">
      <button type="button" className="pos-sym paper-invest-symbol" onClick={onSelect}>{position.symbol} &nbsp;›</button>
      <div className="pos-badges">
        <span className={`tas-mkt-badge dir ${position.direction}`}>{position.direction === 'long' ? 'Long' : 'Short'}</span>
        <span className="tas-mkt-badge lev">{position.leverage}x</span>
        <span className="tas-mkt-badge lev">USDT</span>
      </div>
      <div className="pos-row">
        <div><div className="pos-k">Unrealized PnL ({currencyLabel})</div>
          <div className={`pos-v ${color}`}>{pnl === null ? '—' : `${pnl >= 0 ? '+' : '-'}${formatAmount(Math.abs(pnl))}`}</div>
          <div className="pos-vsub">{pnl === null ? '현재가 수신 대기' : `≈ ${pnl.toFixed(2)} USDT`}</div>
        </div>
        <div className="paper-invest-right"><div className="pos-k">ROE</div>
          <div className={`pos-v ${color}`}>{roe === null ? '—' : `${roe >= 0 ? '+' : ''}${roe.toFixed(2)}%`}</div>
        </div>
      </div>
      <div className="pos-grid3">
        <div><div className="pos-k">Size ({base})</div><div className="pos-v2">{position.size.toLocaleString(undefined, { maximumFractionDigits: 8 })}</div></div>
        <div><div className="pos-k">Margin (USDT)</div><div className="pos-v2">{position.margin.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div></div>
      </div>
      <div className="pos-grid3">
        <div><div className="pos-k">Entry price</div><div className="pos-v2">{position.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })}</div></div>
        <div><div className="pos-k">Mark price</div><div className="pos-v2">{position.markPrice?.toLocaleString(undefined, { maximumFractionDigits: 8 }) ?? '—'}</div></div>
      </div>
      <div className="paper-invest-position-actions">
        <button type="button" disabled={busy} onClick={() => void onClose(position.id)} aria-label={`${position.symbol} 모의 포지션 청산`}>{busy ? '처리 중…' : 'Close'}</button>
      </div>
    </div>
  );
}
