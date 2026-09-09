// 웹 마켓/관심 공용 행 컴포넌트 — 정렬 아이콘·로고·종목 1행. 헬퍼·훅은 marketShared.ts (분리).
import { useState } from 'react';
import type { HTMLAttributes } from 'react';
import { getOfficialLogo, formatPriceWithDecimals } from '../../../shared/utils/coinFormatters';
import type { CoinTicker } from '../../../shared/types/market';
import { formatVolume, formatVolumeKrw, type Market } from './marketShared';
import './panels.css';

export function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  const on = '#eaecef';
  const off = '#54565c';
  const up = active && dir === 'asc' ? on : off;
  const down = active && dir === 'desc' ? on : off;
  return (
    <svg width="6.5" height="9.75" viewBox="0 0 8 12" aria-hidden="true" style={{ display: 'block', flexShrink: 0, position: 'relative', top: '1px' }}>
      <path d="M4 1 L7.5 4.5 L0.5 4.5 Z" fill={up} stroke={up} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M4 11 L7.5 7.5 L0.5 7.5 Z" fill={down} stroke={down} strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}

function RowLogo({ base, logoUrl }: { base: string; logoUrl?: string }) {
  // 후보 순서: 공식(메이저) → 백엔드 gecko 맵(시총 상위 ~1500) → 유지되는 CDN(jsdelivr) → 글자.
  // onError마다 다음 후보로 넘어가고, 다 실패하면 컬러 글자 폴백.
  const candidates = [
    getOfficialLogo(base) || undefined,
    logoUrl,
    `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${base.toLowerCase()}.png`,
  ].filter(Boolean) as string[];
  const candidateKey = `${base}|${logoUrl ?? ''}`;
  const [selection, setSelection] = useState({ key: candidateKey, idx: 0 });
  // 새 종목/URL은 같은 렌더에서 첫 후보부터 표시한다.
  if (selection.key !== candidateKey) setSelection({ key: candidateKey, idx: 0 });
  const idx = selection.key === candidateKey ? selection.idx : 0;
  const url = candidates[idx];
  if (!url) return <span className="wm-row-logo wm-row-logo--fallback">{base.slice(0, 2)}</span>;
  return <span className="wm-row-logo"><img src={url} alt={base} onError={() => setSelection({ key: candidateKey, idx: idx + 1 })} /></span>;
}

/** 종목 1행 — 로고 + (이름/거래대금) + (현재가/등락%) + 별표. 마켓·관심 공용.
 *  editMode: 좌측 드래그 핸들(≡) + 우측 별표→✕(제거), 행 draggable(dragProps). 기본 off=마켓 패널 보존. */
export function SymbolRow({
  ticker, market, decimals, faved, onToggleFav, onClick, logoUrl, editMode, onRemove, dragProps, hideStar,
}: {
  ticker: CoinTicker;
  market: Market;
  decimals: number;
  faved: boolean;
  onToggleFav: () => void;
  onClick?: () => void;
  logoUrl?: string;
  editMode?: boolean;
  onRemove?: () => void;
  dragProps?: HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  hideStar?: boolean; // 보기 모드에서 별표 숨김(관심 목록은 이미 즐겨찾기라 불필요)
}) {
  // 원화 거래소(업비트·빗썸): 현재가에 '원' + 거래대금 조/억 표기
  const isKrw = ticker.quoteSymbol === 'KRW';
  return (
    <div className={`wm-row${editMode ? ' wm-row-edit' : ''}`} role="button" tabIndex={0} onClick={editMode ? undefined : onClick} {...(editMode ? dragProps : {})}>
      {editMode && (
        <span className="wm-drag" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
        </span>
      )}
      <RowLogo base={ticker.baseSymbol} logoUrl={logoUrl} />
      <div className="wm-row-info">
        <div className="wm-row-name">
          <strong>{isKrw ? (ticker.name || ticker.symbol) : (market === 'futures' ? `${ticker.symbol}.P` : ticker.symbol)}</strong>
          {market === 'futures' && <span className="wm-badge">Perp</span>}
        </div>
        <span>{isKrw ? formatVolumeKrw(ticker.volume) : formatVolume(ticker.volume)}</span>
      </div>
      <div className="wm-row-price">
        <strong>{formatPriceWithDecimals(ticker.last, decimals)}{isKrw ? '원' : ''}</strong>
        <span className={ticker.changeRate >= 0 ? 'up' : 'down'}>{ticker.changeRate >= 0 ? '+' : ''}{(ticker.changeRate * 100).toFixed(2)}%</span>
      </div>
      {editMode ? (
        <button type="button" className="wm-row-remove" onClick={(ev) => { ev.stopPropagation(); onRemove?.(); }} aria-label="관심 해제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      ) : hideStar ? null : (
        <button type="button" className={`wm-row-star${faved ? ' on' : ''}`} onClick={(ev) => { ev.stopPropagation(); onToggleFav(); }} aria-label="관심종목">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z" />
          </svg>
        </button>
      )}
    </div>
  );
}
