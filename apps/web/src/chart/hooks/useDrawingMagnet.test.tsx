// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, renderHook } from '../../test/renderHook';
import { useDrawingMagnet } from './useDrawingMagnet';

afterEach(cleanupRenderHooks);

describe('useDrawingMagnet keyboard guard', () => {
  it('차단 중 Delete를 무시하고 준비 후 선택 작도를 삭제한다', async () => {
    const removeDrawing = vi.fn();
    const blocked = { current: true };
    const selected = { current: 'drawing-1' as string | null };
    const setSelected = vi.fn();
    await renderHook(() => useDrawingMagnet({
      magnet: false, interactionBlockedRef: blocked,
      seriesRef: { current: null }, candlesRef: { current: [] },
      drawingManagerRef: { current: { removeDrawing } as never },
      previewDrawingRef: { current: null }, pendingAnchorsRef: { current: [] },
      selectedDrawingIdRef: selected, setSelectedDrawingId: setSelected,
    }), undefined);

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(removeDrawing).not.toHaveBeenCalled();
    blocked.current = false;
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(removeDrawing).toHaveBeenCalledWith('drawing-1');
    expect(selected.current).toBeNull();
  });
});
