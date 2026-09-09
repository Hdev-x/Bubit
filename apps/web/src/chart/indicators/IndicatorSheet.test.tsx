// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../test/renderComponent';
import IndicatorSheet from './IndicatorSheet';
import type { IndicatorSettings } from '../overlays/ChartOverlay';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ onDragEnd, ...props }: React.HTMLAttributes<HTMLDivElement> & { onDragEnd?: (event: unknown, info: { offset: { y: number }; velocity: { y: number } }) => void }) => (
    <div {...props} onDoubleClick={() => onDragEnd?.({}, { offset: { y: -100 }, velocity: { y: 0 } })} />
  ) },
}));
vi.mock('./SmcSection', () => ({ default: () => <div /> }));
vi.mock('./HarmonicSection', () => ({ default: () => <div /> }));
vi.mock('./AbcSection', () => ({ default: () => <div /> }));
vi.mock('./MaSection', () => ({ default: () => <div /> }));
vi.mock('./BbSection', () => ({ default: () => <div /> }));
vi.mock('./PivotSection', () => ({ default: () => <div /> }));
vi.mock('./ElliottSection', () => ({ default: () => <div /> }));

describe('IndicatorSheet', () => {
  afterEach(async () => { await cleanupRenderComponents(); document.body.style.overflow = ''; });

  it('재열면 compact로 돌아오되 열린 group 상태는 보존한다', async () => {
    const props = { onClose: vi.fn(), settings: {} as IndicatorSettings, onChange: vi.fn() };
    const view = await renderComponent(<IndicatorSheet {...props} isOpen />);
    const sheet = () => view.container.querySelector('.interval-sheet') as HTMLElement;
    const custom = [...view.container.querySelectorAll('.indicator-group-label')].find((node) => node.textContent?.includes('커스텀')) as HTMLElement;
    act(() => { custom.click(); sheet().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(sheet().classList.contains('full')).toBe(true);
    await view.rerender(<IndicatorSheet {...props} isOpen={false} />);
    expect(document.body.style.overflow).toBe('');
    await view.rerender(<IndicatorSheet {...props} isOpen />);
    expect(sheet().classList.contains('compact')).toBe(true);
    const reopenedCustom = [...view.container.querySelectorAll('.indicator-group-label')].find((node) => node.textContent?.includes('커스텀')) as HTMLElement;
    expect(reopenedCustom.querySelector('svg')?.getAttribute('style')).toContain('rotate(180deg)');
  });
});
