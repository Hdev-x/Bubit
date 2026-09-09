// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import DrawingSheet from './DrawingSheet';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ drag: _drag, dragListener: _dragListener, dragControls: _dragControls, dragConstraints: _dragConstraints, dragElastic: _dragElastic, initial: _initial, animate: _animate, exit: _exit, transition: _transition, onDragEnd: _onDragEnd, ...props }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props} /> },
  useDragControls: () => ({ start: vi.fn() }),
}));

describe('DrawingSheet', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), clear: () => storage.clear() },
  });
  afterEach(async () => { await cleanupRenderComponents(); document.body.style.overflow = ''; storage.clear(); });

  it('재열면 검색만 비우고 탭과 저장된 favorites를 보존한다', async () => {
    localStorage.setItem('tv_drawing_favorites', JSON.stringify(['trend-line']));
    localStorage.setItem('tv_show_favorites_on_chart', 'true');
    const props = { onClose: vi.fn(), activeTool: null, onSelectTool: vi.fn(), onClearAll: vi.fn() };
    const view = await renderComponent(<DrawingSheet {...props} isOpen />);
    expect(view.container.textContent).toContain('추세선');
    expect(view.container.querySelector('.toss-switch')?.classList.contains('active')).toBe(true);
    const tabs = [...view.container.querySelectorAll('.drawing-sheet-tab')];
    const toolTab = tabs.find((tab) => tab.textContent === '툴') as HTMLElement;
    act(() => toolTab.click());
    const input = view.container.querySelector('input') as HTMLInputElement;
    const allToolCount = view.container.querySelectorAll('.drawing-tool-card').length;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'trend-angle');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.container.querySelectorAll('.drawing-tool-card')).toHaveLength(1);
    expect(allToolCount).toBeGreaterThan(1);
    await view.rerender(<DrawingSheet {...props} isOpen={false} />);
    expect(document.body.style.overflow).toBe('');
    await view.rerender(<DrawingSheet {...props} isOpen />);
    expect((view.container.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(view.container.querySelectorAll('.drawing-tool-card')).toHaveLength(allToolCount);
    expect(view.container.querySelector('.drawing-tool-sheet')?.classList.contains('compact')).toBe(true);
    expect(view.container.querySelector('.drawing-sheet-tab.active')?.textContent).toBe('툴');
    expect(localStorage.getItem('tv_drawing_favorites')).toBe('["trend-line"]');
  });
});
