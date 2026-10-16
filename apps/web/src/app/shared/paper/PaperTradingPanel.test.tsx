// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderComponent, cleanupRenderComponents } from '../../../test/renderComponent';
import { PaperTradingPanel } from './PaperTradingPanel';
import { PaperTradingSettings } from './PaperTradingSettings';

const api = vi.hoisted(() => ({ fetch: vi.fn(), place: vi.fn(), cancel: vi.fn(), close: vi.fn(), reset: vi.fn() }));
vi.mock('../../../api/server/paperApi', () => ({ fetchPaperAccount: api.fetch, placePaperOrder: api.place, cancelPaperOrder: api.cancel, closePaperPosition: api.close, resetPaper: api.reset }));
vi.mock('../../../hooks/market/useLivePrice', () => ({ useLivePrice: () => ({ price: 100, ready: true }) }));
const account = { balance: 10000, peakEquity: 10000, positions: [{ id: 7, symbol: 'BTCUSDT', direction: 'long', entryPrice: 90, size: 1, leverage: 10, margin: 9 }], orders: [] };
const user = { username: 'owner', role: 'USER' };
const click = async (container: HTMLElement, text: string) => {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(text));
  expect(button).toBeTruthy();
  await act(async () => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};
beforeEach(() => {
  vi.resetAllMocks();
  api.fetch.mockResolvedValue(account);
  api.place.mockResolvedValue({ ...account, balance: 7500 });
  api.close.mockResolvedValue({ ...account, positions: [] });
  api.reset.mockResolvedValue({ ...account, positions: [] });
});
afterEach(cleanupRenderComponents);

it('비로그인 사용자는 모의계좌를 조회하지 않는다', async () => {
  const view = await renderComponent(<PaperTradingPanel symbol="BTCUSDT" user={null} />);
  expect(view.container.textContent).toContain('로그인하면');
  expect(api.fetch).not.toHaveBeenCalled();
});

it('원본 레버리지·비율·가격 토글을 현재 지정가 주문에 연결한다', async () => {
  const view = await renderComponent(<PaperTradingPanel symbol="BTCUSDT" user={user} price={100} />);
  expect(view.container.textContent).toContain('BTCUSDT.P');
  expect(view.container.textContent).toContain('Available');
  expect(view.container.textContent).toContain('Max open');
  expect(view.container.querySelector('select')).toBeNull();
  await click(view.container, '10x');
  await click(view.container, '시장가');
  await click(view.container, '25%');
  await click(view.container, 'Open long');
  expect(api.place).toHaveBeenCalledWith({ type: 'limit', symbol: 'BTCUSDT', direction: 'long', marginUsdt: 2500, leverage: 20, price: 100 });
});

it('Close 전환은 주문 대신 보유 포지션 청산을 실행한다', async () => {
  const view = await renderComponent(<PaperTradingPanel symbol="BTCUSDT" user={user} price={100} />);
  await click(view.container, 'Close');
  expect(view.container.querySelector('.paper-ticket-form')).toBeNull();
  await click(view.container, '시장가 청산');
  expect(api.close).toHaveBeenCalledWith(7);
  expect(api.place).not.toHaveBeenCalled();
});

it('초기화는 공통 설정에서 확인한 후 실행한다', async () => {
  const openSettings = vi.fn();
  const view = await renderComponent(<PaperTradingPanel symbol="BTCUSDT" user={user} onOpenSettings={openSettings} />);
  expect(view.container.textContent).not.toContain('초기화');
  await click(view.container, '설정');
  expect(openSettings).toHaveBeenCalledTimes(1);
  await view.rerender(<PaperTradingSettings user={user} />);
  expect(view.container.textContent).toContain('가상 자산');
  await click(view.container, '모의계좌 초기화');
  expect(api.reset).not.toHaveBeenCalled();
  await click(view.container, '초기화 확인');
  expect(api.reset).toHaveBeenCalledTimes(1);
  expect(view.container.textContent).toContain('초기화했습니다');
});
