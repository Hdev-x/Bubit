// @vitest-environment jsdom
import { act, createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import type { ChartOverlay } from '../overlays/ChartOverlay';
import { useRankLines } from './useRankLines';

afterEach(async () => { await cleanupRenderHooks(); vi.unstubAllGlobals(); });

describe('useRankLines', () => {
  it('symbol 전환에서 즉시 비우고 ABA 응답을 폐기하며 새 자료를 overlay에 반영한다', async () => {
    const a1 = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const b = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const a2 = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(a1.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(a2.promise));
    const updateRankLines = vi.fn();
    const overlayRef = createRef<ChartOverlay>();
    overlayRef.current = { updateRankLines } as unknown as ChartOverlay;
    const hook = await renderHook(useRankLines, { overlayRef, rankTiersOn: { '1W': true }, symbol: 'BTC' });
    await hook.rerender({ overlayRef, rankTiersOn: { '1W': true }, symbol: 'ETH' });
    expect(updateRankLines).toHaveBeenLastCalledWith([]);
    await hook.rerender({ overlayRef, rankTiersOn: { '1W': true }, symbol: 'BTC' });
    await act(async () => a2.resolve({ ok: true, json: async () => ({ tiers: { '1W': [{ price: 300, score: 1 }] } }) }));
    await act(async () => { a1.resolve({ ok: true, json: async () => ({ tiers: { '1W': [{ price: 100, score: 1 }] } }) }); b.resolve({ ok: true, json: async () => ({ tiers: { '1W': [{ price: 200, score: 1 }] } }) }); });
    expect(updateRankLines).toHaveBeenLastCalledWith([expect.objectContaining({ price: 300 })]);
  });

  it('tier toggle과 새 data identity 및 새 overlay instance를 각각 반영한다', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tiers: { '1W': [{ price: 10, score: 1 }], '1M': [{ price: 20, score: 1 }] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tiers: { '1W': [{ price: 30, score: 1 }] } }) });
    vi.stubGlobal('fetch', fetchMock);
    const firstUpdate = vi.fn(); const secondUpdate = vi.fn();
    const firstRef = createRef<ChartOverlay>(); firstRef.current = { updateRankLines: firstUpdate } as unknown as ChartOverlay;
    const hook = await renderHook<Parameters<typeof useRankLines>[0], void>(useRankLines, { overlayRef: firstRef, rankTiersOn: { '1W': true }, symbol: 'BTC' }); await act(async () => {});
    expect(firstUpdate).toHaveBeenLastCalledWith([expect.objectContaining({ price: 10 })]);
    await hook.rerender({ overlayRef: firstRef, rankTiersOn: { '1M': true }, symbol: 'BTC' });
    expect(firstUpdate).toHaveBeenLastCalledWith([expect.objectContaining({ price: 20 })]);
    await hook.rerender({ overlayRef: firstRef, rankTiersOn: { '1W': true }, symbol: 'ETH' }); await act(async () => {});
    expect(firstUpdate).toHaveBeenLastCalledWith([expect.objectContaining({ price: 30 })]);
    const secondRef = createRef<ChartOverlay>(); secondRef.current = { updateRankLines: secondUpdate } as unknown as ChartOverlay;
    await hook.rerender({ overlayRef: secondRef, rankTiersOn: { '1W': true }, symbol: 'ETH' });
    expect(secondUpdate).toHaveBeenLastCalledWith([expect.objectContaining({ price: 30 })]);
  });

  it('404·reject는 empty를 유지하고 StrictMode/unmount 뒤 늦은 응답을 폐기한다', async () => {
    const late = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(late.promise).mockResolvedValueOnce({ ok: false, json: async () => ({}) }));
    const updateRankLines = vi.fn();
    const overlayRef = createRef<ChartOverlay>(); overlayRef.current = { updateRankLines } as unknown as ChartOverlay;
    const hook = await renderHook(useRankLines, { overlayRef, rankTiersOn: { '1W': true }, symbol: 'BTC' }, { strict: true });
    await act(async () => {});
    expect(updateRankLines).toHaveBeenLastCalledWith([]);
    await hook.unmount();
    await act(async () => late.resolve({ ok: true, json: async () => ({ tiers: { '1W': [{ price: 999, score: 1 }] } }) }));
    expect(updateRankLines).not.toHaveBeenCalledWith([expect.objectContaining({ price: 999 })]);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('failed')));
    const nextRef = createRef<ChartOverlay>(); const nextUpdate = vi.fn(); nextRef.current = { updateRankLines: nextUpdate } as unknown as ChartOverlay;
    await renderHook(useRankLines, { overlayRef: nextRef, rankTiersOn: { '1W': true }, symbol: 'ETH' }); await act(async () => {});
    expect(nextUpdate).toHaveBeenLastCalledWith([]);
  });
});
