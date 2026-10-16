// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../test/renderComponent';
import { usePaperTrade } from './usePaperTrade';
import type { PaperAccount } from '../../api/server/paperApi';

const api = vi.hoisted(() => ({ fetch: vi.fn(), place: vi.fn(), cancel: vi.fn(), close: vi.fn(), reset: vi.fn() }));
vi.mock('../../api/server/paperApi', () => ({ fetchPaperAccount: api.fetch, placePaperOrder: api.place, cancelPaperOrder: api.cancel, closePaperPosition: api.close, resetPaper: api.reset }));
const account = (balance: number): PaperAccount => ({ balance, peakEquity: 10000, positions: [], orders: [] });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
let paper: ReturnType<typeof usePaperTrade>;
function Harness({ active = true }: { active?: boolean }) {
  const result = usePaperTrade(active);
  useEffect(() => { paper = result; });
  return <div>{result.ready ? result.account.balance : 'loading'}</div>;
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanupRenderComponents);

it('주문중 중복호출을 막고 늦은 계좌조회가 주문결과를 덮지 않는다', async () => {
  api.fetch.mockResolvedValueOnce(account(10000));
  const view = await renderComponent(<Harness />);
  const refresh = deferred<PaperAccount>();
  const order = deferred<PaperAccount>();
  api.fetch.mockReturnValueOnce(refresh.promise);
  api.place.mockReturnValueOnce(order.promise);
  act(() => { void paper.refetch(); });
  const payload = { type: 'market' as const, direction: 'long' as const, symbol: 'BTCUSDT', price: 100, leverage: 5, marginUsdt: 100 };
  act(() => { void paper.place(payload); void paper.place(payload); });
  expect(api.place).toHaveBeenCalledTimes(1);
  await act(async () => { order.resolve(account(9900)); });
  await act(async () => { refresh.resolve(account(10000)); });
  expect(view.container.textContent).toBe('9900');
});

it('조회실패를 잔고0의 정상계좌로 숨기지 않는다', async () => {
  api.fetch.mockRejectedValueOnce(new Error('unavailable'));
  await renderComponent(<Harness />);
  expect(paper.ready).toBe(false);
  expect(paper.error).toContain('불러오지 못했습니다');
});

it('숨겨진 계좌는 조회를 멈추고 다시 열어도 기존 잔고를 유지한다', async () => {
  api.fetch.mockResolvedValueOnce(account(10000));
  const view = await renderComponent(<Harness active={false} />);
  expect(api.fetch).not.toHaveBeenCalled();
  await view.rerender(<Harness />);
  expect(view.container.textContent).toBe('10000');
  const stale = deferred<PaperAccount>();
  api.fetch.mockReturnValueOnce(stale.promise);
  act(() => { void paper.refetch(); });
  await view.rerender(<Harness active={false} />);
  await act(async () => { stale.resolve(account(5000)); });
  expect(view.container.textContent).toBe('10000');
  const refresh = deferred<PaperAccount>();
  api.fetch.mockReturnValueOnce(refresh.promise);
  await view.rerender(<Harness />);
  expect(view.container.textContent).toBe('10000');
  await act(async () => { refresh.resolve(account(9000)); });
  expect(view.container.textContent).toBe('9000');
});

it('계좌를 숨기는 도중 완료된 주문 결과는 보존한다', async () => {
  api.fetch.mockResolvedValueOnce(account(10000));
  const view = await renderComponent(<Harness />);
  const order = deferred<PaperAccount>();
  api.place.mockReturnValueOnce(order.promise);
  act(() => { void paper.place({ type: 'market', direction: 'long', symbol: 'BTCUSDT', price: 100, leverage: 5, marginUsdt: 100 }); });
  await view.rerender(<Harness active={false} />);
  await act(async () => { order.resolve(account(9900)); });
  expect(view.container.textContent).toBe('9900');
  expect(paper.busy).toBe(false);
});
