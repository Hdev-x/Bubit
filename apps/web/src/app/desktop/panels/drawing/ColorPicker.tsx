import { useEffect, useRef, useState } from 'react';
// 드로잉 도구 공용 — 색 유틸·색 선택 팝오버·선 미리보기. DrawingToolbar.tsx에서 분리 .
import { PALETTE } from './palette';
import '../panels.css';

function toRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// rgba/hex → {hex, alpha}
function parseColor(color: string | undefined): { hex: string; alpha: number } {
  if (!color) return { hex: '#2962ff', alpha: 1 };
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
    return { hex, alpha: m[4] != null ? parseFloat(m[4]) : 1 };
  }
  return { hex: color, alpha: 1 };
}

// ── 색 선택 팝오버(그리드 + 불투명도) ────────────────────
export function ColorPicker({ value, showOpacity = true, onPick }: {
  value?: string;
  showOpacity?: boolean;
  onPick: (color: string) => void; // 불투명도 반영된 rgba/hex
}) {
  const parsed = parseColor(value);
  const [hex, setHex] = useState(parsed.hex);
  const [opacity, setOpacity] = useState(Math.round(parsed.alpha * 100));
  const emit = (h: string, o: number) => onPick(o >= 100 ? h : toRgba(h, o / 100));
  return (
    <div className="wdt-colorpicker" onPointerDown={(e) => e.stopPropagation()}>
      {PALETTE.map((row, i) => (
        <div key={i} className="wdt-color-row">
          {row.map((c) => (
            <button
              key={c}
              className={`wdt-color-cell${hex.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => { setHex(c); emit(c, opacity); }}
            />
          ))}
        </div>
      ))}
      {showOpacity && (
        <div className="wdt-opacity">
          <span>불투명성</span>
          <input
            type="range" min={0} max={100} value={opacity}
            onChange={(e) => { const o = Number(e.target.value); setOpacity(o); emit(hex, o); }}
          />
          <em>{opacity}%</em>
        </div>
      )}
    </div>
  );
}

// 색 스와치 버튼(팝오버 토글)
// 팝오버는 position:fixed — 다이얼로그 본문(overflow:auto)에 잘리지 않고 TV처럼 바깥으로 넘친다.
// 화면 경계 클램프: 아래 공간이 부족하면 위로 뒤집고, 좌우는 8px 여백 안으로 이동.
const PICKER_W = 258;
export function ColorSwatch({ value, showOpacity = true, onPick }: { value?: string; showOpacity?: boolean; onPick: (c: string) => void }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null); // null=닫힘
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPos(null); };
    const close = () => setPos(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', close); };
  }, [pos]);
  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const pickerH = showOpacity ? 240 : 200;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - PICKER_W / 2, window.innerWidth - PICKER_W - 8));
    const top = r.bottom + pickerH + 8 > window.innerHeight
      ? Math.max(8, r.top - pickerH - 8)  // 아래 공간 부족 → 위로
      : r.bottom + 6;
    setPos({ left, top });
  };
  return (
    <div className="wdt-swatch-wrap" ref={ref}>
      <button ref={btnRef} className="wdt-swatch" style={{ background: value ?? '#2962ff' }} onClick={toggle} />
      {pos && (
        <div className="wdt-popover wdt-popover-fixed" style={{ left: pos.left, top: pos.top }}>
          <ColorPicker value={value} showOpacity={showOpacity} onPick={onPick} />
        </div>
      )}
    </div>
  );
}

export function LinePreview({ dash, width = 2 }: { dash: string; width?: number }) {
  return (
    <svg width="34" height="10" viewBox="0 0 34 10">
      <line x1="1" y1="5" x2="33" y2="5" stroke="currentColor" strokeWidth={width} strokeDasharray={dash === 'none' ? undefined : dash} />
    </svg>
  );
}

