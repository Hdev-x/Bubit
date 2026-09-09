// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotHolding } from '../../../../api/server/spotTradeApi';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import SpotAccountSummary from './SpotAccountSummary';

const market = vi.hoisted(() => ({ prices: {} as Record<string, number> }));

vi.mock('../../../../hooks/market/useRealtimePrices', () => ({
  useRealtimePrices: () => market.prices,
}));
vi.mock('../../../../hooks/market/useUsdKrw', () => ({ useUsdKrw: () => 1_400 }));
vi.mock('../../../../shared/contexts/settingsContext', () => ({
  useSettings: () => ({ displayCurrency: 'USDT', setDisplayCurrency: vi.fn(), isHideBalance: false }),
  currencyLabel: (currency: string) => currency,
}));
vi.mock('../coin-list/CoinLogo', () => ({ CoinLogo: () => null }));

const holding = (coin: string): SpotHolding => ({ coin, available: 1, frozen: 0 });
const props = (holdings: SpotHolding[]) => ({ holdings, usdtAvailable: 0, hasKey: true });

describe('SpotAccountSummary price gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    market.prices = {};
  });
  afterEach(async () => {
    await cleanupRenderComponents();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('missing symbol 내용이 바뀌면 timeout을 재예약하되 이미 timeout이면 ready를 유지한다', async () => {
    const view = await renderComponent(<SpotAccountSummary {...props([holding('BTC')])} />);
    expect(view.container.querySelector('[aria-label="평가 중"]')).not.toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await view.rerender(<SpotAccountSummary {...props([holding('ETH')])} />);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(view.container.querySelector('[aria-label="평가 중"]')).not.toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(view.container.querySelector('[aria-label="평가 중"]')).toBeNull();
    await view.rerender(<SpotAccountSummary {...props([holding('SOL')])} />);
    expect(view.container.querySelector('[aria-label="평가 중"]')).toBeNull();

    market.prices = { SOLUSDT: 100 };
    await view.rerender(<SpotAccountSummary {...props([holding('SOL')])} />);
    market.prices = {};
    await view.rerender(<SpotAccountSummary {...props([holding('DOGE')])} />);
    expect(view.container.querySelector('[aria-label="평가 중"]')).not.toBeNull();
  });
});
