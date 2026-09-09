// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import AnalysisHubSheet from './AnalysisHubSheet';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ onDragEnd, ...props }: React.HTMLAttributes<HTMLDivElement> & { onDragEnd?: (event: unknown, info: { offset: { y: number }; velocity: { y: number } }) => void }) => (
    <div {...props} onDoubleClick={() => onDragEnd?.({}, { offset: { y: -100 }, velocity: { y: 0 } })} />
  ) },
  useDragControls: () => ({ start: vi.fn() }),
}));

describe('AnalysisHubSheet', () => {
  afterEach(async () => { await cleanupRenderComponents(); document.body.style.overflow = ''; });

  it('재열면 compact로 돌아오고 닫을 때 body lock을 복원한다', async () => {
    const props = { onClose: vi.fn(), onOpenIndicators: vi.fn(), onOpenChartSettings: vi.fn(), onOpenObjectTree: vi.fn() };
    const view = await renderComponent(<AnalysisHubSheet {...props} isOpen />);
    const sheet = () => view.container.querySelector('.analysis-hub-sheet') as HTMLElement;
    expect(document.body.style.overflow).toBe('hidden');
    act(() => sheet().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(sheet().classList.contains('full')).toBe(true);
    await view.rerender(<AnalysisHubSheet {...props} isOpen={false} />);
    expect(document.body.style.overflow).toBe('');
    await view.rerender(<AnalysisHubSheet {...props} isOpen />);
    expect(sheet().classList.contains('compact')).toBe(true);
  });
});
