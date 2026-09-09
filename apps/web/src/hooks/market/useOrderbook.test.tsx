// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderbookSnapshot } from '../../api/exchange/bitget/bitgetMergeDepth';
import { fetchMergeDepth } from '../../api/exchange/bitget/bitgetMergeDepth';
import { fetchBinanceDepth } from '../../api/server/marketApi';
import { subscribeKrwOrderbook } from '../../api/exchange/krw/krwRealtime';
import { cleanupRenderHooks, deferred, renderHook } from '../../test/renderHook';
import { useOrderbook } from './useOrderbook';

vi.mock('../../api/exchange/bitget/bitgetMergeDepth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/exchange/bitget/bitgetMergeDepth')>(),
  fetchMergeDepth: vi.fn(),
}));
vi.mock('../../api/server/marketApi', () => ({ fetchBinanceDepth: vi.fn() }));
vi.mock('../../api/exchange/krw/krwRealtime', () => ({ subscribeKrwOrderbook: vi.fn() }));

const snapshot = (price: number): OrderbookSnapshot => ({
  asks: [{ price, size: 1 }],
  bids: [{ price: price - 1, size: 2 }],
  ts: price,
  scale: '0.1',
});

type Props = { symbol: string; precision?: 'scale0' | 'scale1'; exchange?: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB'; isFutures?: boolean; enabled?: boolean; clearOnChange?: boolean };

describe('useOrderbook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchMergeDepth).mockReset();
    vi.mocked(fetchBinanceDepth).mockReset();
    vi.mocked(subscribeKrwOrderbook).mockReset();
  });

  afterEach(async () => {
    await cleanupRenderHooks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('StrictMode 재설정에서 첫 요청을 버리고 활성 poll timer를 하나만 둔다', async () => {
    const first = deferred<OrderbookSnapshot | null>();
    const second = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const hook = await renderHook(
      ({ symbol }: Props) => useOrderbook(symbol, 'scale0'),
      { symbol: 'BTCUSDT' },
      { strict: true },
    );

    expect(fetchMergeDepth).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve(snapshot(200)));
    expect(hook.result()).toMatchObject({ ts: 200 });
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => first.resolve(snapshot(100)));
    expect(hook.result()).toMatchObject({ ts: 200 });
    expect(vi.getTimerCount()).toBe(1);

    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('빠른 종목 전환 중 늦게 온 이전 응답을 버리고 새 호가만 표시한다', async () => {
    const btc = deferred<OrderbookSnapshot | null>();
    const eth = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth)
      .mockImplementationOnce(() => btc.promise)
      .mockImplementationOnce(() => eth.promise);
    const hook = await renderHook(
      ({ symbol }: Props) => useOrderbook(symbol, 'scale0'),
      { symbol: 'BTCUSDT' },
    );

    await hook.rerender({ symbol: 'ETHUSDT' });
    await act(async () => eth.resolve(snapshot(200)));
    expect(hook.result()).toMatchObject({ ts: 200, key: 'BITGET|ETHUSDT|true' });

    await act(async () => btc.resolve(snapshot(100)));
    expect(hook.result()).toMatchObject({ ts: 200, key: 'BITGET|ETHUSDT|true' });

    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('BTC 첫 요청 뒤 ETH를 거쳐 BTC로 돌아와도 늦은 첫 BTC 응답을 버린다', async () => {
    const btc1 = deferred<OrderbookSnapshot | null>();
    const eth = deferred<OrderbookSnapshot | null>();
    const btc2 = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth)
      .mockImplementationOnce(() => btc1.promise)
      .mockImplementationOnce(() => eth.promise)
      .mockImplementationOnce(() => btc2.promise);
    const hook = await renderHook(
      ({ symbol }: Props) => useOrderbook(symbol, 'scale0'),
      { symbol: 'BTCUSDT' },
    );

    await hook.rerender({ symbol: 'ETHUSDT' });
    await hook.rerender({ symbol: 'BTCUSDT' });
    await act(async () => btc2.resolve(snapshot(300)));
    await act(async () => btc1.resolve(snapshot(100)));
    await act(async () => eth.resolve(snapshot(200)));

    expect(hook.result()).toMatchObject({ ts: 300, key: 'BITGET|BTCUSDT|true' });
  });

  it('같은 symbol과 futures에서 exchange만 바뀌면 이전 응답을 버린다', async () => {
    const bitget = deferred<OrderbookSnapshot | null>();
    const binance = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth).mockReturnValueOnce(bitget.promise);
    vi.mocked(fetchBinanceDepth).mockReturnValueOnce(binance.promise);
    const hook = await renderHook(
      ({ symbol, exchange = 'BITGET', isFutures = true }: Props) =>
        useOrderbook(symbol, 'scale0', isFutures, true, exchange),
      { symbol: 'BTCUSDT', exchange: 'BITGET', isFutures: true },
    );

    await hook.rerender({ symbol: 'BTCUSDT', exchange: 'BINANCE', isFutures: true });
    await act(async () => binance.resolve(snapshot(200)));
    await act(async () => bitget.resolve(snapshot(100)));

    expect(fetchMergeDepth).toHaveBeenCalledWith('BTCUSDT', 'scale0', true);
    expect(fetchBinanceDepth).toHaveBeenCalledWith('BTCUSDT', true);
    expect(hook.result()).toMatchObject({ ts: 200, key: 'BINANCE|BTCUSDT|true' });
  });

  it('같은 symbol과 exchange에서 futures만 바뀌면 이전 응답을 버린다', async () => {
    const futures = deferred<OrderbookSnapshot | null>();
    const spot = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth)
      .mockReturnValueOnce(futures.promise)
      .mockReturnValueOnce(spot.promise);
    const hook = await renderHook(
      ({ symbol, exchange = 'BITGET', isFutures = true }: Props) =>
        useOrderbook(symbol, 'scale0', isFutures, true, exchange),
      { symbol: 'BTCUSDT', exchange: 'BITGET', isFutures: true },
    );

    await hook.rerender({ symbol: 'BTCUSDT', exchange: 'BITGET', isFutures: false });
    await act(async () => spot.resolve(snapshot(200)));
    await act(async () => futures.resolve(snapshot(100)));

    expect(fetchMergeDepth).toHaveBeenNthCalledWith(1, 'BTCUSDT', 'scale0', true);
    expect(fetchMergeDepth).toHaveBeenNthCalledWith(2, 'BTCUSDT', 'scale0', false);
    expect(hook.result()).toMatchObject({ ts: 200, key: 'BITGET|BTCUSDT|false' });
  });

  it('clearOnChange=false면 새 종목 호가가 준비될 때까지 이전 완성 호가를 유지한다', async () => {
    const next = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth)
      .mockResolvedValueOnce(snapshot(100))
      .mockImplementationOnce(() => next.promise);
    const hook = await renderHook(
      ({ symbol, clearOnChange = true }: Props) =>
        useOrderbook(symbol, 'scale0', true, true, 'BITGET', clearOnChange),
      { symbol: 'BTCUSDT', clearOnChange: false },
    );
    await act(async () => {});

    await hook.rerender({ symbol: 'ETHUSDT', clearOnChange: false });
    expect(hook.result()).toMatchObject({ ts: 100, key: 'BITGET|BTCUSDT|true' });

    await act(async () => next.resolve(snapshot(200)));
    expect(hook.result()).toMatchObject({ ts: 200, key: 'BITGET|ETHUSDT|true' });
  });

  it('clearOnChange=true는 key 변경 때 즉시 비우되 precision과 enabled 변경만으로는 유지한다', async () => {
    const next = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth)
      .mockResolvedValueOnce(snapshot(100))
      .mockImplementation(() => next.promise);
    const hook = await renderHook<Props, OrderbookSnapshot | null>(
      ({ symbol, precision = 'scale0', enabled = true }: Props) =>
        useOrderbook(symbol, precision, true, enabled, 'BITGET', true),
      { symbol: 'BTCUSDT' },
    );
    await act(async () => {});

    await hook.rerender({ symbol: 'BTCUSDT', precision: 'scale1' });
    expect(hook.result()).toMatchObject({ ts: 100 });
    await hook.rerender({ symbol: 'BTCUSDT', precision: 'scale1', enabled: false });
    expect(hook.result()).toMatchObject({ ts: 100 });
    await hook.rerender({ symbol: 'ETHUSDT', precision: 'scale1', enabled: true });
    expect(hook.result()).toBeNull();
  });

  it('유효 호가 뒤 빈 응답이 3회 연속이면 기존 호가를 제거한다', async () => {
    vi.mocked(fetchBinanceDepth)
      .mockResolvedValueOnce(snapshot(100))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const hook = await renderHook(
      ({ symbol, exchange = 'BITGET' }: Props) => useOrderbook(symbol, 'scale0', true, true, exchange),
      { symbol: 'BTCUSDT', exchange: 'BINANCE' },
    );

    await act(async () => {});
    expect(hook.result()).toMatchObject({ ts: 100, key: 'BINANCE|BTCUSDT|true' });

    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(fetchBinanceDepth).toHaveBeenCalledTimes(4);
    expect(hook.result()).toBeNull();

    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unmount하면 진행 중 응답을 무시하고 poll timer를 만들지 않는다', async () => {
    const request = deferred<OrderbookSnapshot | null>();
    vi.mocked(fetchMergeDepth).mockReturnValueOnce(request.promise);
    const hook = await renderHook(
      ({ symbol }: Props) => useOrderbook(symbol, 'scale0'),
      { symbol: 'BTCUSDT' },
    );

    await hook.unmount();
    await act(async () => request.resolve(snapshot(100)));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMergeDepth).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('KRW StrictMode 구독을 정리하고 전환 뒤 이전 callback을 무시하며 key를 태그한다', async () => {
    const callbacks: Array<(book: OrderbookSnapshot) => void> = [];
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    vi.mocked(subscribeKrwOrderbook).mockImplementation((_exchange, _symbol, callback) => {
      callbacks.push(callback);
      const close = vi.fn();
      closes.push(close);
      return { close };
    });
    const hook = await renderHook<Props, OrderbookSnapshot | null>(
      ({ symbol, exchange = 'UPBIT' }: Props) => useOrderbook(symbol, 'scale0', false, true, exchange),
      { symbol: 'BTCKRW', exchange: 'UPBIT' as const },
      { strict: true },
    );

    expect(callbacks).toHaveLength(2);
    expect(closes[0]).toHaveBeenCalledOnce();
    await act(async () => callbacks[1](snapshot(100)));
    expect(hook.result()).toMatchObject({ ts: 100, key: 'UPBIT|BTCKRW|false' });

    await hook.rerender({ symbol: 'BTCKRW', exchange: 'BITHUMB' });
    expect(closes[1]).toHaveBeenCalledOnce();
    await act(async () => callbacks[1](snapshot(101)));
    expect(hook.result()).toBeNull();
    await act(async () => callbacks[2](snapshot(200)));
    expect(hook.result()).toMatchObject({ ts: 200, key: 'BITHUMB|BTCKRW|false' });

    await hook.unmount();
    expect(closes[2]).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
