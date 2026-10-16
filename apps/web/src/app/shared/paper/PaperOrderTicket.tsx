import { useState } from 'react';
import type { placePaperOrder, PaperPositionRaw } from '../../../api/server/paperApi';
import { EXCHANGES } from '../../../shared/constants/exchanges';
import { getOfficialLogo } from '../../../shared/utils/coinFormatters';
import { PaperPositionRow } from './PaperPositions';

type Order = Parameters<typeof placePaperOrder>[0];
const LEVERAGES = [5, 10, 20, 50, 75, 100];

/** AutoTrade 6708f771의 WebPaperOrder 주문 티켓. 미연결 컨트롤은 제외하고 수동 paper API에 연결한다. */
export function PaperOrderTicket({ symbol, price, balance, positions, busy, onPlace, onClose }: {
  symbol: string;
  price: number | null;
  balance: number;
  positions: PaperPositionRaw[];
  busy: boolean;
  onPlace: (order: Order) => Promise<boolean>;
  onClose: (id: number) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'open' | 'close'>('open');
  const [type, setType] = useState<Order['type']>('market');
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [error, setError] = useState('');
  const [typeHover, setTypeHover] = useState(false);
  const base = symbol.replace(/USDT$/, '');
  const logo = getOfficialLogo(base);
  const isLimit = type === 'limit';
  const fillPrice = isLimit ? Number(limitPrice) : (price ?? 0);
  const amount = Number(margin);
  const notional = Number.isFinite(amount * leverage) ? amount * leverage : 0;
  const place = async (direction: Order['direction']) => {
    if (!Number.isFinite(amount * leverage) || amount <= 0 || amount > balance) {
      setError('가용 잔고 이내의 증거금을 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
      setError(isLimit ? '유효한 지정가를 입력해 주세요.' : '현재가를 기다려 주세요.');
      return;
    }
    setError('');
    if (await onPlace({ type, symbol, direction, marginUsdt: amount, leverage, price: fillPrice })) setMargin('');
  };

  return (
    <div className="paper-ticket">
      <div className="paper-ticket-symbol">
        <span className="paper-ticket-logo">{logo ? <img src={logo} alt="" /> : base.slice(0, 2)}</span>
        <strong>{symbol}.P</strong><span className="paper-ticket-perp">Perp</span>
        <span className="paper-ticket-exchange"><img src={EXCHANGES.BITGET.logo} alt="" />Bitget</span>
      </div>
      <div className="paper-ticket-pills">
        <span>모의 · USDT</span>
        <button type="button" disabled={busy} onClick={() => setLeverage((value) => LEVERAGES[(LEVERAGES.indexOf(value) + 1) % LEVERAGES.length])}
          aria-label={`레버리지 ${leverage}배, 클릭하면 변경`} title="클릭하면 레버리지 변경">{leverage}x</button>
      </div>
      <div className="paper-ticket-tabs" role="group" aria-label="주문 또는 청산">
        <button type="button" className={mode === 'open' ? 'active' : ''} aria-pressed={mode === 'open'} onClick={() => setMode('open')}>Open</button>
        <button type="button" className={mode === 'close' ? 'active' : ''} aria-pressed={mode === 'close'} onClick={() => setMode('close')}>Close <span>{positions.length}</span></button>
      </div>
      {mode === 'open' ? <form className="paper-ticket-form" onSubmit={(event) => event.preventDefault()}>
        <div className="paper-ticket-price-line">
          <button type="button" className={`paper-ticket-price-type${(typeHover ? isLimit : !isLimit) ? ' active' : ''}`}
            disabled={busy} aria-label={`주문 방식: ${isLimit ? '지정가' : '시장가'}. ${isLimit ? '시장가' : '지정가'}로 변경`}
            onClick={() => {
              setType(isLimit ? 'market' : 'limit');
              if (!isLimit && !limitPrice && price) setLimitPrice(String(price));
              setTypeHover(false);
            }} onMouseEnter={() => setTypeHover(true)} onMouseLeave={() => setTypeHover(false)}>
            {(typeHover ? isLimit : !isLimit) ? '시장가' : '지정가'}
          </button>
          <div className={`paper-ticket-input${isLimit ? '' : ' locked'}`}>
            <input inputMode="decimal" aria-label="모의 주문 가격" value={isLimit ? limitPrice : price ?? ''}
              disabled={busy || !isLimit} onChange={(event) => setLimitPrice(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="지정가" />
            <span>USDT</span>
          </div>
        </div>
        <label className="paper-ticket-input"><span className="paper-ticket-input-label">Cost</span>
          <input inputMode="decimal" aria-label="모의 주문 증거금" value={margin}
            onChange={(event) => setMargin(event.target.value.replace(/[^0-9.]/g, ''))} disabled={busy} placeholder="0" /><span>USDT</span>
        </label>
        <div className="paper-percentages">{[25, 50, 75, 100].map((percent) => (
          <button key={percent} type="button" disabled={busy} onClick={() => setMargin((balance * percent / 100).toFixed(8))}>{percent}%</button>
        ))}</div>
        <dl className="paper-ticket-balances">
          <div><dt>Available</dt><dd>{balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT</dd></div>
          <div><dt>Max open</dt><dd>{(balance * leverage).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT</dd></div>
        </dl>
        {error && <p role="alert" className="paper-error">{error}</p>}
        <button type="button" className="paper-long" disabled={busy} onClick={() => void place('long')}>
          <strong>{busy ? '처리 중…' : 'Open long'}</strong><span>{notional.toFixed(2)} USDT</span>
        </button>
        <button type="button" className="paper-short" disabled={busy} onClick={() => void place('short')}>
          <strong>{busy ? '처리 중…' : 'Open short'}</strong><span>{notional.toFixed(2)} USDT</span>
        </button>
      </form> : positions.length ? <ul className="paper-positions">{positions.map((position) => (
        <PaperPositionRow key={position.id} position={position} busy={busy} onClose={onClose} />
      ))}</ul> : <p className="paper-muted paper-ticket-empty">청산할 모의 포지션이 없습니다.</p>}
    </div>
  );
}
