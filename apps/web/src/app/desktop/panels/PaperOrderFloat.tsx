import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePersistentState } from '../../../hooks/ui/usePersistentState';
import { snapFloat } from './snapFloat';

const WIDTH = 280;
const FOOTER = 27;

/** 원본 WebPaperOrder의 작은 드래그 창. 계좌와 주문 상태는 내투자 섹션에서 공유한다. */
export function PaperOrderFloat({ children, busy, onClose }: { children: ReactNode; busy: boolean; onClose: () => void }) {
  const [position, setPosition] = usePersistentState('web_paper_order_pos', { x: 120, y: 140 });
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const clamp = (x: number, y: number) => ({
    x: Math.max(0, Math.min(window.innerWidth - WIDTH, Number.isFinite(x) ? x : 120)),
    y: Math.max(0, Math.min(window.innerHeight - FOOTER - (element.current?.offsetHeight ?? 400), Number.isFinite(y) ? y : 140)),
  });

  useEffect(() => {
    const resize = () => setPosition((previous) => {
      const x = Math.max(0, Math.min(window.innerWidth - WIDTH, Number.isFinite(previous?.x) ? previous.x : 120));
      const y = Math.max(0, Math.min(window.innerHeight - FOOTER - (element.current?.offsetHeight ?? 400), Number.isFinite(previous?.y) ? previous.y : 140));
      return previous?.x === x && previous?.y === y ? previous : { x, y };
    });
    const observer = new ResizeObserver(resize);
    if (element.current) observer.observe(element.current);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [setPosition]);

  return createPortal(
    <div ref={element} className="paper-order paper-invest-float" role="dialog" aria-label="모의 주문" style={{ left: position?.x ?? 120, top: position?.y ?? 140 }}>
      <div className="paper-invest-float-head" onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        drag.current = { x: event.clientX - (position?.x ?? 120), y: event.clientY - (position?.y ?? 140) };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => {
        if (!drag.current) return;
        const snapped = snapFloat(event.clientX - drag.current.x, event.clientY - drag.current.y, WIDTH, element.current?.offsetHeight ?? 400, element.current);
        setPosition(clamp(snapped.x, snapped.y));
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <strong>모의 주문</strong>
        <button type="button" disabled={busy} onClick={onClose} aria-label="모의 주문창 닫기">×</button>
      </div>
      <div className="paper-panel paper-invest-float-body">{children}</div>
    </div>, document.body,
  );
}
