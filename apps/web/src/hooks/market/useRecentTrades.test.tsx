// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { useRecentTrades } from './useRecentTrades';
import type { RecentTrades } from '../../api/server/recentTradesApi';

const { fetchTrades } = vi.hoisted(() => ({ fetchTrades: vi.fn() }));
vi.mock('../../api/server/recentTradesApi', () => ({ fetchRecentTrades: fetchTrades }));
afterEach(async () => { await cleanupRenderHooks(); vi.clearAllMocks(); vi.useRealTimers(); });

const snapshot = (price: number): RecentTrades => ({ trades: [{ id: '1', price, size: 1, time: 1000, side: 'buy' }], stale: false });
const useTrades = ({ symbol, active }: { symbol: string; active: boolean }) => useRecentTrades('BITGET', symbol, true, active);

it('완료 전 중복 조회 없이 예약하고 숨기거나 해제하면 중단한다', async () => {
  vi.useFakeTimers();
  const pending = deferred<RecentTrades>();
  fetchTrades.mockReturnValueOnce(pending.promise).mockResolvedValue(snapshot(101));
  const hook = await renderHook(useTrades, { symbol: 'BTCUSDT', active: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(fetchTrades).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(snapshot(100)));
  expect(hook.result().trades[0].price).toBe(100);
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(fetchTrades).toHaveBeenCalledTimes(2);
  const signal: AbortSignal = fetchTrades.mock.calls[1][3];
  await hook.rerender({ symbol: 'BTCUSDT', active: false });
  expect(signal.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(fetchTrades).toHaveBeenCalledTimes(2);
});

it('종목 변경 전 늦은 응답은 버리고 새 조회의 오류를 표시한다', async () => {
  const old = deferred<RecentTrades>();
  fetchTrades.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot(200));
  const hook = await renderHook(useTrades, { symbol: 'BTCUSDT', active: true });
  await hook.rerender({ symbol: 'ETHUSDT', active: true });
  await act(async () => old.resolve(snapshot(100)));
  expect(hook.result().trades[0].price).toBe(200);
  fetchTrades.mockRejectedValueOnce(new Error('offline'));
  await hook.rerender({ symbol: 'SOLUSDT', active: true });
  expect(hook.result()).toMatchObject({ trades: [], status: 'error' });
});
