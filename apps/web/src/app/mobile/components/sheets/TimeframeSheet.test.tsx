// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import TimeframeSheet from './TimeframeSheet';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ onDragEnd, ...props }: React.HTMLAttributes<HTMLDivElement> & { onDragEnd?: (event: unknown, info: { offset: { y: number }; velocity: { y: number } }) => void }) => (
    <div {...props} onDoubleClick={() => onDragEnd?.({}, { offset: { y: -100 }, velocity: { y: 0 } })} />
  ) },
}));

describe('TimeframeSheet', () => {
  afterEach(async () => { await cleanupRenderComponents(); document.body.style.overflow = ''; });

  it('재열면 compact로 돌아오고 선택값은 props를 따른다', async () => {
    const props = { onClose: vi.fn(), onSelect: vi.fn() };
    const view = await renderComponent(<TimeframeSheet {...props} isOpen selectedTimeframe="1m" />);
    const sheet = () => view.container.querySelector('.interval-sheet') as HTMLElement;
    act(() => sheet().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(sheet().classList.contains('full')).toBe(true);
    await view.rerender(<TimeframeSheet {...props} isOpen={false} selectedTimeframe="5m" />);
    expect(document.body.style.overflow).toBe('');
    await view.rerender(<TimeframeSheet {...props} isOpen selectedTimeframe="5m" />);
    expect(sheet().classList.contains('compact')).toBe(true);
    expect(view.container.querySelector('.interval-button.active')?.textContent).toContain('5분');
  });
});
