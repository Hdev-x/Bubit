// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import { PaperInvestSection } from './PaperInvestSection';
import type { PaperAccount } from '../../../api/server/paperApi';

const api = vi.hoisted(() => ({ fetch: vi.fn(), place: vi.fn(), cancel: vi.fn(), close: vi.fn(), reset: vi.fn() }));
vi.mock('../../../api/server/paperApi', () => ({ fetchPaperAccount: api.fetch, placePaperOrder: api.place, cancelPaperOrder: api.cancel, closePaperPosition: api.close, resetPaper: api.reset }));
vi.mock('../../../hooks/market/useRealtimePrices', () => ({ useRealtimePrices: () => ({}) }));
const account: PaperAccount = {
  balance: 9000, peakEquity: 10000,
  positions: [{ id: 1, symbol: 'BTCUSDT', direction: 'long', entryPrice: 100, size: 10, leverage: 2, margin: 500 }],
  orders: [{ id: 2, symbol: 'ETHUSDT', direction: 'short', limitPrice: 30, size: 50, leverage: 3, margin: 500, status: 'pending' }],
};
const props = { user: { username: 'owner', role: 'USER' }, symbol: 'BTCUSDT', exchange: 'BITGET' as const, isFutures: true, price: 120, krw: false, usdKrw: 1400, orderOpen: false, onCloseOrder: vi.fn(), onSelectChart: vi.fn() };
const click = async (container: ParentNode, text: string) => {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(text));
  expect(button).toBeTruthy();
  await act(async () => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  api.fetch.mockResolvedValue(account);
});
afterEach(async () => { await cleanupRenderComponents(); vi.unstubAllGlobals(); });

it('미체결 증거금을 총자산에 포함하고 다른 거래소 가격을 평가에 사용하지 않는다', async () => {
  const view = await renderComponent(<PaperInvestSection {...props} exchange="BINANCE" price={999} />);
  expect(view.container.querySelector('.tas-hero-val')?.textContent).toContain('10,000');
  expect(view.container.querySelector('.tas-hero-label')?.textContent).toContain('평가 대기');
  expect(view.container.querySelector('.tas-mkt-pnlval')?.textContent).toBe('—');
  await view.rerender(<PaperInvestSection {...props} />);
  expect(view.container.querySelector('.tas-hero-val')?.textContent).toContain('10,200');
  expect(view.container.querySelector('.paper-invest-price-wait')).toBeNull();
  expect(api.fetch).toHaveBeenCalledTimes(1);
});

it('원본 작은 주문창과 내투자가 한 계좌를 공유하고 주문 후 함께 갱신된다', async () => {
  api.place.mockResolvedValue({ ...account, balance: 6750, positions: [...account.positions, { id: 3, symbol: 'BTCUSDT', direction: 'long', entryPrice: 120, size: 187.5, leverage: 10, margin: 2250 }] });
  const view = await renderComponent(<PaperInvestSection {...props} orderOpen />);
  const floating = document.querySelector('.paper-invest-float')!;
  expect(floating.parentElement).toBe(document.body);
  await click(floating, '25%');
  await click(floating, 'Open long');
  expect(api.place).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'BTCUSDT', marginUsdt: 2250, price: 120 }));
  expect(view.container.querySelector('.tas-pos-title .cnt')?.textContent).toBe('2개');
  expect(floating.querySelector('.paper-ticket-balances')?.textContent).toContain('6,750');
  expect(api.fetch).toHaveBeenCalledTimes(1);
  const close = floating.querySelector('[aria-label="모의 주문창 닫기"]')!;
  await act(async () => close.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(props.onCloseOrder).toHaveBeenCalledTimes(1);
});

it('Orders에서 모의 주문을 취소해도 총자산은 유지된다', async () => {
  api.cancel.mockResolvedValue({ ...account, balance: 9500, orders: [] });
  const view = await renderComponent(<PaperInvestSection {...props} />);
  await click(view.container, 'Orders');
  await click(view.container, '취소');
  expect(api.cancel).toHaveBeenCalledWith(2);
  expect(view.container.querySelector('.tas-hero-val')?.textContent).toContain('10,200');
  expect(view.container.textContent).toContain('미체결 모의 주문이 없습니다');
});
