// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../../shared/types/market';
import type { IndicatorSettings, TFKey } from '../overlays/ChartOverlay';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { useMtfCandles } from './useMtfCandles';

const candle = (close: number): Candle => ({ time: close, open: close, high: close, low: close, close, volume: 0 });
const settings = (...enabled: TFKey[]): IndicatorSettings => {
  const active = (tf: TFKey) => enabled.includes(tf);
  return {
    '1M': { showOB: active('1M'), showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1W': { showOB: active('1W'), showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '3D': { showOB: active('3D'), showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1D': { showOB: active('1D'), showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  };
};
type Props = { symbol: string; config: IndicatorSettings; atomic: boolean; key?: string; load: (granularity: string, limit: number, endTime?: string) => Promise<Candle[]> };

afterEach(async () => {
  await cleanupRenderHooks();
  vi.restoreAllMocks();
});

describe('useMtfCandles atomic', () => {
  it('활성 TF가 전부 끝날 때까지 이전 묶음을 유지한 뒤 data+key를 한 번에 교체한다', async () => {
    const oldLoad = vi.fn().mockResolvedValue([candle(1)]);
    const hook = await renderHook(
      ({ symbol, config, atomic, key, load }: Props) => useMtfCandles(symbol, config, load, atomic, key),
      { symbol: 'BTCUSDT', config: settings('1D'), atomic: true, key: 'A', load: oldLoad },
    );
    await act(async () => {});
    expect(hook.result()).toMatchObject({ mtfCandles: { '1D': [candle(1)] }, mtfKey: 'A' });

    const day = deferred<Candle[]>();
    const threeDay = deferred<Candle[]>();
    const nextLoad = vi.fn((granularity: string) => granularity === '1Dutc' ? day.promise : threeDay.promise);
    await hook.rerender({ symbol: 'ETHUSDT', config: settings('1D', '3D'), atomic: true, key: 'B', load: nextLoad });
    expect(hook.result()).toMatchObject({ requestKey: 'B', settingsKey: '3D|1D', status: 'loading', missing: ['3D', '1D'] });
    await act(async () => day.resolve([candle(2)]));
    expect(hook.result()).toMatchObject({ mtfCandles: { '1D': [candle(1)] }, mtfKey: 'A' });
    await act(async () => threeDay.resolve([candle(3)]));
    expect(hook.result()).toMatchObject({ mtfCandles: { '1D': [candle(2)], '3D': [candle(3)] }, mtfKey: 'B' });
    expect(nextLoad).toHaveBeenCalledTimes(2);
  });

  it('완료 A→pending B→A와 settings fingerprint ABA를 새 loading 세대로 구분한다', async () => {
    const a1 = deferred<Candle[]>(); const b = deferred<Candle[]>(); const a2 = deferred<Candle[]>();
    const a3 = deferred<Candle[]>(); const a4 = deferred<Candle[]>();
    const load = vi.fn().mockReturnValueOnce(a1.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(a2.promise).mockReturnValueOnce(a3.promise).mockReturnValueOnce(a3.promise).mockReturnValueOnce(a4.promise);
    const hook = await renderHook(
      ({ symbol, config, atomic, key, load }: Props) => useMtfCandles(symbol, config, load, atomic, key),
      { symbol: 'A', config: settings('1D'), atomic: true, key: 'A', load },
    );
    await act(async () => a1.resolve([candle(1)]));
    await hook.rerender({ symbol: 'B', config: settings('1D'), atomic: true, key: 'B', load });
    expect(hook.result().status).toBe('loading');
    await hook.rerender({ symbol: 'A', config: settings('1D'), atomic: true, key: 'A', load });
    expect(hook.result().status).toBe('loading');
    await act(async () => a2.resolve([candle(2)]));
    await act(async () => b.resolve([candle(9)]));
    expect(hook.result()).toMatchObject({ status: 'settled', mtfKey: 'A', mtfCandles: { '1D': [candle(2)] } });

    await hook.rerender({ symbol: 'A', config: settings('1W', '1D'), atomic: true, key: 'A', load });
    expect(hook.result().status).toBe('loading');
    await hook.rerender({ symbol: 'A', config: settings('1D'), atomic: true, key: 'A', load });
    expect(hook.result().status).toBe('loading');
    await act(async () => a4.resolve([candle(4)]));
    expect(hook.result()).toMatchObject({ status: 'settled', settingsKey: '1D', mtfCandles: { '1D': [candle(4)] } });
    await act(async () => a3.resolve([candle(3)]));
    expect(hook.result().mtfCandles).toEqual({ '1D': [candle(4)] });
  });

  it('실패 TF는 빈 값으로 처리하고 enabled 0은 즉시 empty/current key이며 늦은 응답을 막는다', async () => {
    const pending = deferred<Candle[]>();
    const load = vi.fn((granularity: string) => granularity === '1Dutc' ? pending.promise : Promise.reject(new Error('fail')));
    const hook = await renderHook(
      ({ symbol, config, atomic, key, load }: Props) => useMtfCandles(symbol, config, load, atomic, key),
      { symbol: 'BTCUSDT', config: settings('1D', '3D'), atomic: true, key: 'A', load },
    );
    await hook.rerender({ symbol: 'BTCUSDT', config: settings(), atomic: true, key: 'A', load });
    expect(hook.result()).toMatchObject({ mtfCandles: {}, mtfKey: 'A' });
    await act(async () => pending.resolve([candle(1)]));
    expect(hook.result()).toMatchObject({ mtfCandles: {}, mtfKey: 'A' });
  });

  it('일부 TF 실패는 성공한 TF만으로 원자 커밋한다', async () => {
    const load = vi.fn((granularity: string) => granularity === '1Dutc'
      ? Promise.resolve([candle(1)])
      : Promise.reject(new Error('fail')));
    const hook = await renderHook(
      ({ symbol, config, atomic, key, load }: Props) => useMtfCandles(symbol, config, load, atomic, key),
      { symbol: 'BTCUSDT', config: settings('1D', '3D'), atomic: true, key: 'A', load },
    );
    await act(async () => {});
    expect(hook.result()).toMatchObject({ mtfCandles: { '1D': [candle(1)] }, mtfKey: 'A' });
    expect(hook.result()).toMatchObject({ status: 'settled', missing: ['3D'] });
  });

  it('retry는 같은 semantic query를 새 version으로 다시 요청한다', async () => {
    const load = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([candle(2)]);
    const hook = await renderHook(
      ({ symbol, config, atomic, key, load }: Props) => useMtfCandles(symbol, config, load, atomic, key),
      { symbol: 'A', config: settings('1D'), atomic: true, key: 'A', load },
    );
    await act(async () => {});
    expect(hook.result()).toMatchObject({ status: 'settled', missing: ['1D'] });
    act(() => hook.result().retryMtf());
    expect(hook.result().status).toBe('loading');
    await act(async () => {});
    expect(hook.result()).toMatchObject({ status: 'settled', missing: [], mtfCandles: { '1D': [candle(2)] } });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('timeout은 missing으로 settled되고 timer를 남기지 않는다', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise<Candle[]>(() => {}));
    const hook = await renderHook(
      ({ symbol, config, atomic, key, load }: Props) => useMtfCandles(symbol, config, load, atomic, key),
      { symbol: 'A', config: settings('1D'), atomic: true, key: 'A', load },
    );
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(hook.result()).toMatchObject({ status: 'settled', missing: ['1D'] });
    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('StrictMode와 unmount 뒤 첫/늦은 요청은 결과를 되살리지 않는다', async () => {
    const first = deferred<Candle[]>();
    const second = deferred<Candle[]>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = await renderHook(
      ({ symbol, config, atomic, key, load }: Props) => useMtfCandles(symbol, config, load, atomic, key),
      { symbol: 'BTCUSDT', config: settings('1D'), atomic: true, key: 'A', load },
      { strict: true },
    );
    await act(async () => second.resolve([candle(2)]));
    expect(hook.result().mtfCandles).toEqual({ '1D': [candle(2)] });
    await act(async () => first.resolve([candle(1)]));
    expect(hook.result().mtfCandles).toEqual({ '1D': [candle(2)] });
    await hook.unmount();
  });
});

describe('useMtfCandles mobile', () => {
  it('key 변경 즉시 비우고 TF별 도착을 표시하며 ABA 늦은 응답을 버린다', async () => {
    const aDay = deferred<Candle[]>();
    const aWeek = deferred<Candle[]>();
    const bDay = deferred<Candle[]>();
    const a2Day = deferred<Candle[]>();
    const loadA = vi.fn().mockReturnValueOnce(aWeek.promise).mockReturnValueOnce(aDay.promise);
    const loadB = vi.fn().mockReturnValueOnce(bDay.promise);
    const loadA2 = vi.fn().mockReturnValueOnce(a2Day.promise);
    const hook = await renderHook(
      ({ symbol, config, load }: Props) => useMtfCandles(symbol, config, load),
      { symbol: 'A', config: settings('1W', '1D'), atomic: false, load: loadA },
    );
    expect(hook.result()).toMatchObject({ mtfCandles: {}, mtfKey: 'A' });
    await act(async () => aDay.resolve([candle(1)]));
    expect(hook.result().mtfCandles).toEqual({ '1D': [candle(1)] });

    await hook.rerender({ symbol: 'B', config: settings('1D'), atomic: false, load: loadB });
    expect(hook.result()).toMatchObject({ mtfCandles: {}, mtfKey: 'B' });
    await hook.rerender({ symbol: 'A', config: settings('1D'), atomic: false, load: loadA2 });
    await act(async () => a2Day.resolve([candle(3)]));
    await act(async () => bDay.resolve([candle(2)]));
    await act(async () => aWeek.resolve([candle(4)]));
    expect(hook.result()).toMatchObject({ mtfCandles: { '1D': [candle(3)] }, mtfKey: 'A' });
    expect(loadB).toHaveBeenCalledOnce();
    expect(loadA2).toHaveBeenCalledOnce();
  });

  it('disabled TF cache를 유지하고 재활성화해도 이미 받은 TF를 재조회하지 않는다', async () => {
    const load = vi.fn().mockResolvedValue([candle(1)]);
    const hook = await renderHook(
      ({ symbol, config, load }: Props) => useMtfCandles(symbol, config, load),
      { symbol: 'A', config: settings('1D'), atomic: false, load },
    );
    await act(async () => {});
    await hook.rerender({ symbol: 'A', config: settings(), atomic: false, load });
    expect(hook.result().mtfCandles).toEqual({ '1D': [candle(1)] });
    await hook.rerender({ symbol: 'A', config: settings('1D'), atomic: false, load });
    expect(load).toHaveBeenCalledOnce();
  });

  it('enabled 0인 다른 key를 거쳐 돌아오면 이전 key cache를 재사용하지 않고 다시 조회한다', async () => {
    const loadA = vi.fn().mockResolvedValueOnce([candle(1)]).mockResolvedValueOnce([candle(2)]);
    const hook = await renderHook(
      ({ symbol, config, load }: Props) => useMtfCandles(symbol, config, load),
      { symbol: 'A', config: settings('1D'), atomic: false, load: loadA },
    );
    await act(async () => {});
    expect(hook.result().mtfCandles).toEqual({ '1D': [candle(1)] });

    await hook.rerender({ symbol: 'B', config: settings(), atomic: false, load: loadA });
    expect(hook.result()).toMatchObject({ mtfCandles: {}, mtfKey: 'B' });
    await hook.rerender({ symbol: 'A', config: settings('1D'), atomic: false, load: loadA });
    await act(async () => {});

    expect(loadA).toHaveBeenCalledTimes(2);
    expect(hook.result()).toMatchObject({ mtfCandles: { '1D': [candle(2)] }, mtfKey: 'A' });
  });

  it('빈 응답은 cache 완료로 보지 않아 toggle 뒤 다시 조회한다', async () => {
    const load = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([candle(2)]);
    const hook = await renderHook(
      ({ symbol, config, load }: Props) => useMtfCandles(symbol, config, load),
      { symbol: 'A', config: settings('1D'), atomic: false, load },
    );
    await act(async () => {});
    await hook.rerender({ symbol: 'A', config: settings(), atomic: false, load });
    await hook.rerender({ symbol: 'A', config: settings('1D'), atomic: false, load });
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(2);
    expect(hook.result().mtfCandles).toEqual({ '1D': [candle(2)] });
  });

  it('Mobile StrictMode와 unmount 뒤 늦은 응답을 폐기한다', async () => {
    const first = deferred<Candle[]>();
    const second = deferred<Candle[]>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = await renderHook(
      ({ symbol, config, load }: Props) => useMtfCandles(symbol, config, load),
      { symbol: 'A', config: settings('1D'), atomic: false, load },
      { strict: true },
    );
    expect(load).toHaveBeenCalledTimes(2);
    await hook.unmount();
    await act(async () => first.resolve([candle(1)]));
    await act(async () => second.resolve([candle(2)]));
    expect(hook.result()).toMatchObject({ mtfCandles: {}, mtfKey: 'A' });
  });
});
