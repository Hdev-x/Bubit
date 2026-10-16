// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import { PaperInvestSection } from './PaperInvestSection';
import type { PaperAccount } from '../../../api/server/paperApi';

const api = vi.hoisted(() => ({ fetch: vi.fn(), place: vi.fn(), cancel: vi.fn(), close: vi.fn(), reset: vi.fn() }));
const prices = vi.hoisted(() => ({ live: vi.fn(), realtime: vi.fn() }));
vi.mock('../../../api/server/paperApi', () => ({ fetchPaperAccount: api.fetch, placePaperOrder: api.place, cancelPaperOrder: api.cancel, closePaperPosition: api.close, resetPaper: api.reset }));
vi.mock('../../../hooks/market/useLivePrice', () => ({ useLivePrice: prices.live }));
vi.mock('../../../hooks/market/useRealtimePrices', () => ({ useRealtimePrices: prices.realtime }));
const readyQuote = (symbol: string) => ({ price: 120, dailyOpen: null, readySymbol: symbol, ready: true, status: 'ready' as const });
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
  prices.live.mockImplementation(({ symbol }: { symbol: string }) => readyQuote(symbol));
  prices.realtime.mockReturnValue({});
});
afterEach(async () => { await cleanupRenderComponents(); vi.unstubAllGlobals(); });

it('미체결 증거금을 총자산에 포함하고 다른 거래소 가격을 평가에 사용하지 않는다', async () => {
  prices.live.mockReturnValue({ ...readyQuote('BTCUSDT'), ready: false, status: 'loading' });
  const view = await renderComponent(<PaperInvestSection {...props} exchange="BINANCE" price={999} />);
  expect(view.container.querySelector('.tas-hero-val')?.textContent).toContain('10,000');
  expect(view.container.querySelector('.tas-hero-label')?.textContent).toContain('평가 대기');
  expect(view.container.querySelector('.tas-mkt-pnlval')?.textContent).toBe('—');
  prices.live.mockReturnValue(readyQuote('BTCUSDT'));
  await view.rerender(<PaperInvestSection {...props} exchange="BINANCE" price={999} />);
  expect(view.container.querySelector('.tas-hero-val')?.textContent).toContain('10,200');
  expect(view.container.querySelector('.paper-invest-price-wait')).toBeNull();
  expect(api.fetch).toHaveBeenCalledTimes(1);
});

it('Binance 차트에서도 Bitget 가격으로 주문하고 내투자와 같은 계좌를 갱신한다', async () => {
  api.place.mockResolvedValue({ ...account, balance: 6750, positions: [...account.positions, { id: 3, symbol: 'ETHUSDT', direction: 'long', entryPrice: 120, size: 187.5, leverage: 10, margin: 2250 }] });
  const view = await renderComponent(<PaperInvestSection {...props} exchange="BINANCE" symbol="ETHUSDT" price={999} orderOpen />);
  const floating = document.querySelector('.paper-invest-float')!;
  expect(floating.parentElement).toBe(document.body);
  expect(floating.querySelector('.paper-ticket-symbol')?.textContent).toContain('ETHUSDT.P');
  expect(prices.live).toHaveBeenLastCalledWith({ symbol: 'ETHUSDT', exchange: 'BITGET', isFutures: true, enabled: true });
  await click(floating, '25%');
  await click(floating, 'Open long');
  expect(api.place).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'ETHUSDT', marginUsdt: 2250, price: 120 }));
  expect(view.container.querySelector('.tas-pos-title .cnt')?.textContent).toBe('2개');
  expect(floating.querySelector('.paper-ticket-balances')?.textContent).toContain('6,750');
  expect(api.fetch).toHaveBeenCalledTimes(1);
  const close = floating.querySelector('[aria-label="모의 주문창 닫기"]')!;
  await act(async () => close.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(props.onCloseOrder).toHaveBeenCalledTimes(1);
});

it('종목 전환 중 이전 가격과 미지원 종목으로 시장가·지정가 주문을 만들지 않는다', async () => {
  const view = await renderComponent(<PaperInvestSection {...props} orderOpen />);
  let floating = document.querySelector('.paper-invest-float')!;
  await click(floating, '25%');
  await click(floating, '시장가');
  prices.live.mockReturnValue({ ...readyQuote('BTCUSDT'), ready: false, status: 'loading' });
  await view.rerender(<PaperInvestSection {...props} orderOpen />);
  expect((floating.querySelector('[aria-label="모의 주문 가격"]') as HTMLInputElement).value).toBe('120');
  expect((floating.querySelector('.paper-long') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => floating.querySelector('.paper-long')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(api.place).not.toHaveBeenCalled();
  await view.rerender(<PaperInvestSection {...props} exchange="BINANCE" symbol="ETHUSDT" price={999} orderOpen />);
  floating = document.querySelector('.paper-invest-float')!;
  expect(floating.querySelector('.paper-ticket-symbol')?.textContent).toContain('ETHUSDT.P');
  expect((floating.querySelector('[aria-label="모의 주문 가격"]') as HTMLInputElement).value).toBe('');
  expect((floating.querySelector('.paper-long') as HTMLButtonElement).disabled).toBe(true);
  expect((floating.querySelector('.paper-ticket-price-type') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => floating.querySelector('.paper-long')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(api.place).not.toHaveBeenCalled();

  prices.live.mockReturnValue({ ...readyQuote('BTCUSDT'), ready: false, status: 'error' });
  await view.rerender(<PaperInvestSection {...props} exchange="BINANCE" symbol="UNLISTEDUSDT" orderOpen />);
  expect(document.querySelector('.paper-invest-float')?.textContent).toContain('지원 종목인지 확인');
  expect((document.querySelector('.paper-short') as HTMLButtonElement).disabled).toBe(true);
  expect(api.place).not.toHaveBeenCalled();
});

it('비USDT 차트에서는 마지막 주문 종목을 유지하고 주문창은 열림 상태만 따른다', async () => {
  const view = await renderComponent(<PaperInvestSection {...props} symbol="ETHUSDT" exchange="BINANCE" orderOpen />);
  await view.rerender(<PaperInvestSection {...props} symbol="KRW-BTC" exchange="UPBIT" isFutures={false} orderOpen />);
  expect(document.querySelector('.paper-ticket-symbol')?.textContent).toContain('ETHUSDT.P');
  expect(document.querySelector('.paper-invest-float')?.textContent).toContain('ETHUSDT Bitget 선물 주문을 유지');
  expect(prices.live).toHaveBeenLastCalledWith({ symbol: 'ETHUSDT', exchange: 'BITGET', isFutures: true, enabled: true });
  await view.rerender(<PaperInvestSection {...props} symbol="KRW-BTC" exchange="UPBIT" isFutures={false} />);
  expect(document.querySelector('.paper-invest-float')).toBeNull();
  expect(api.place).not.toHaveBeenCalled();
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
