import type { PaperPositionRaw } from '../../../api/server/paperApi';
import { useLivePrice } from '../../../hooks/market/useLivePrice';

export function PaperPositionRow({ position, busy, onClose }: {
  position: PaperPositionRaw;
  busy: boolean;
  onClose: (id: number) => Promise<boolean>;
}) {
  const live = useLivePrice({ symbol: position.symbol, exchange: 'BITGET', isFutures: true });
  const pnl = live.ready && live.price !== null
    ? (live.price - position.entryPrice) * position.size * (position.direction === 'long' ? 1 : -1)
    : null;
  return (
    <li className="paper-position">
      <div><strong>{position.symbol}</strong><span>{position.direction === 'long' ? '롱' : '숏'} · {position.leverage}x</span></div>
      <dl>
        <div><dt>진입가</dt><dd>{position.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })}</dd></div>
        <div><dt>증거금</dt><dd>{position.margin.toLocaleString()} USDT</dd></div>
        <div><dt>평가손익</dt><dd className={pnl === null ? '' : pnl >= 0 ? 'up' : 'down'}>
          {pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT`}
        </dd></div>
      </dl>
      <button type="button" disabled={busy} onClick={() => void onClose(position.id)} aria-label={`${position.symbol} ${position.direction === 'long' ? '롱' : '숏'} 포지션 청산`}>시장가 청산</button>
    </li>
  );
}
