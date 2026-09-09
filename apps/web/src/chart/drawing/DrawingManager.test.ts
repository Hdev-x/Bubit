// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingManager } from './DrawingManager';
import type { Drawing } from './Drawing';

describe('DrawingManager interaction guard', () => {
  afterEach(() => document.body.replaceChildren());

  it('비활성화할 때 진행 중 drag를 끝내고 준비 후 새 drag를 허용한다', () => {
    const container = document.createElement('div');
    document.body.append(container);
    Object.defineProperties(container, { clientWidth: { value: 300 }, clientHeight: { value: 200 } });
    container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    const chart = { timeScale: () => ({ width: () => 300, height: () => 0, coordinateToTime: (x: number) => x }) };
    const series = { coordinateToPrice: (y: number) => y };
    const setAnchors = vi.fn();
    let state = 'normal';
    const drawing = {
      id: 'd1', get state() { return state; }, options: {}, anchors: [{ time: 10, price: 10 }],
      isAttached: () => true, hitTestAt: () => ({ body: true }), anchorPoints: () => [{ x: 10, y: 10 }],
      setState(next: string) { state = next; }, setAnchors, detach: vi.fn(),
    } as unknown as Drawing;
    const manager = new DrawingManager();
    manager.attach(chart as never, series as never, container);
    manager.addDrawing(drawing);

    container.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true }));
    manager.setHitTestEnabled(false);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }));
    expect(setAnchors).not.toHaveBeenCalled();

    manager.setHitTestEnabled(true);
    container.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }));
    expect(setAnchors).toHaveBeenCalledOnce();
    manager.detach();
  });
});
