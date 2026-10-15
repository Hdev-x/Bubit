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
function Harness() {
  const result = usePaperTrade();
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
