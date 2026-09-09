// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import TradeTabEditSheet from './TradeTabEditSheet';

const motionState = vi.hoisted(() => ({
  complete: undefined as undefined | ((definition: unknown) => void),
  layoutTransition: undefined as unknown,
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial: _initial, animate: _animate, exit: _exit, transition: _transition,
      whileDrag: _whileDrag, drag: _drag, dragControls: _dragControls,
      dragListener: _dragListener, dragConstraints: _dragConstraints,
      dragElastic: _dragElastic, onDragEnd: _onDragEnd,
      onAnimationComplete: _onAnimationComplete, ...domProps
    } = props;
    return domProps;
  };
  const MotionDiv = (props: Record<string, unknown>) => {
    if (props.className === 'bottom-sheet') {
      motionState.complete = props.onAnimationComplete as (definition: unknown) => void;
    }
    return React.createElement('div', cleanProps(props));
  };
  const Group = ({ children, onReorder, ...props }: Record<string, unknown>) => React.createElement(
    'div',
    cleanProps(props),
    children as React.ReactNode,
    React.createElement('button', {
      type: 'button',
      'data-reorder': '',
      onClick: () => (onReorder as (next: string[]) => void)(['spot', 'futures', 'stock']),
    }),
  );
  const Item = (props: Record<string, unknown>) => {
    motionState.layoutTransition = props.transition;
    return React.createElement('div', cleanProps(props));
  };
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: MotionDiv },
    Reorder: { Group, Item },
    useDragControls: () => ({ start: vi.fn() }),
  };
});

const order = ['futures', 'spot', 'stock'] as const;

describe('TradeTabEditSheet', () => {
  beforeEach(() => {
    motionState.complete = undefined;
    motionState.layoutTransition = undefined;
    document.documentElement.style.overflow = '';
    document.body.style.cssText = '';
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  afterEach(async () => {
    await cleanupRenderComponents();
    vi.restoreAllMocks();
  });

  it('입장 완료 전 layout 0, 완료 후 spring이며 close/reopen 때 다시 0으로 초기화한다', async () => {
    const onClose = vi.fn();
    const onReorder = vi.fn();
    const props = { order: [...order], onClose, onReorder };
    const view = await renderComponent(<TradeTabEditSheet {...props} isOpen />);

    expect(motionState.layoutTransition).toMatchObject({ layout: { duration: 0 } });
    expect(document.body.style.position).toBe('fixed');

    await act(async () => motionState.complete?.({ y: 0 }));
    expect(motionState.layoutTransition).toMatchObject({ layout: { type: 'spring' } });

    (view.container.querySelector('[data-reorder]') as HTMLButtonElement).click();
    (view.container.querySelector('.bottom-sheet-overlay') as HTMLDivElement).click();
    expect(onReorder).toHaveBeenCalledWith(['spot', 'futures', 'stock']);
    expect(onClose).toHaveBeenCalledOnce();

    await view.rerender(<TradeTabEditSheet {...props} isOpen={false} />);
    expect(document.body.style.position).toBe('');
    await view.rerender(<TradeTabEditSheet {...props} isOpen />);
    expect(motionState.layoutTransition).toMatchObject({ layout: { duration: 0 } });

    await view.unmount();
    expect(document.body.style.position).toBe('');
  });
});
