// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import { ExchangeBottomSheet } from './ExchangeBottomSheet';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  useDragControls: () => ({ start: vi.fn() }),
}));
vi.mock('../../../../hooks/ui/useScrollLock', () => ({ useScrollLock: vi.fn() }));

afterEach(cleanupRenderComponents);

describe('ExchangeBottomSheet', () => {
  it('선택한 거래소를 부모의 단일 callback으로 전달한다', async () => {
    const onSelectExchange = vi.fn();
    const view = await renderComponent(
      <ExchangeBottomSheet
        activeSheet="EXCHANGE"
        exchangeFilter="BINANCE"
        exchangeOptions={[{ label: '업비트', value: 'UPBIT', logo: 'upbit.svg' }]}
        setActiveSheet={vi.fn()}
        onSelectExchange={onSelectExchange}
      />,
    );

    (view.container.querySelector('.exchange-list-item') as HTMLButtonElement).click();
    expect(onSelectExchange).toHaveBeenCalledWith('UPBIT');
  });
});
