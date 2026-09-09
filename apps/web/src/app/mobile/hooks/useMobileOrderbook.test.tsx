// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderbookSnapshot } from '../../../api/exchange/bitget/bitgetMergeDepth';
import { cleanupRenderHooks, renderHook } from '../../../test/renderHook';
import { useMobileOrderbook } from './useMobileOrderbook';

const market = vi.hoisted(() => ({ orderbook: null as OrderbookSnapshot | null }));
vi.mock('../../../hooks/market/useOrderbook', () => ({ useOrderbook: () => market.orderbook }));
vi.mock('../../../hooks/market/useFundingRate', () => ({ useFundingRate: () => 'funding' }));

const snapshot = (key: string, price: number): OrderbookSnapshot => ({
  key,
  asks: [{ price, size: 2 }],
  bids: [{ price: price - 1, size: 3 }],
  ts: price,
  scale: '0.1',
});
type Props = { symbol: string; isFuturesMarket: boolean; decimals: number; price?: number };
const useSubject = ({ symbol, isFuturesMarket, decimals, price }: Props) => useMobileOrderbook({
  symbol,
  active: true,
  isTradeView: true,
  isFuturesMarket,
  isDemoExchange: false,
  tradable: true,
  depthScale: 'scale0',
  getTickDecimals: () => decimals,
  realtimePrices: price == null ? {} : { [symbol]: price },
});

describe('useMobileOrderbook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    market.orderbook = null;
  });
  afterEach(async () => {
    await cleanupRenderHooks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('완료 A→미완료 B→A에서는 마지막 완성 묶음을 유지하고 raw null이면 비운다', async () => {
    market.orderbook = snapshot('BITGET|BTCUSDT|true', 100);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1 });
    expect(hook.result().obSnap?.askRows[0].price).toBe(100);

    await hook.rerender({ symbol: 'ETHUSDT', isFuturesMarket: true, decimals: 2 });
    expect(hook.result().obSnap?.askRows[0].price).toBe(100);
    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1 });
    expect(hook.result().obSnap?.askRows[0].price).toBe(100);

    market.orderbook = null;
    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1 });
    expect(hook.result().obSnap).toBeNull();
  });

  it('같은 raw에서 decimals 입력이 바뀌면 기존 계약대로 formatter를 즉시 갱신한다', async () => {
    market.orderbook = snapshot('BITGET|BTCUSDT|true', 100);
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1 });
    expect(hook.result().fmtPriceOb(1.23)).toBe('1.2');

    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 2 });
    expect(hook.result().obSnap?.obDecimals).toBe(2);
    expect(hook.result().fmtPriceOb(1.23)).toBe('1.23');
  });

  it('첫 가격은 flat, 동일 가격·null은 방향을 유지하고 마지막 변동 1500ms 뒤 flat이다', async () => {
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(useSubject, { symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1, price: 100 });
    expect(hook.result().priceDir).toBe('flat');
    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1, price: 101 });
    expect(hook.result().priceDir).toBe('up');
    expect(vi.getTimerCount()).toBe(1);
    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1, price: 101 });
    expect(hook.result().priceDir).toBe('up');
    expect(vi.getTimerCount()).toBe(1);
    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1 });
    expect(hook.result().priceDir).toBe('up');
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1, price: 99 });
    expect(hook.result().priceDir).toBe('down');
    await act(async () => vi.advanceTimersByTimeAsync(1_499));
    expect(hook.result().priceDir).toBe('down');
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(hook.result().priceDir).toBe('flat');

    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1 });
    expect(hook.result().priceDir).toBe('flat');
    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('StrictMode에서 첫 가격은 flat이고 변동 timer는 하나만 생기며 unmount 때 제거한다', async () => {
    const hook = await renderHook<Props, ReturnType<typeof useSubject>>(
      useSubject,
      { symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1, price: 100 },
      { strict: true },
    );
    expect(hook.result().priceDir).toBe('flat');
    expect(vi.getTimerCount()).toBe(0);

    await hook.rerender({ symbol: 'BTCUSDT', isFuturesMarket: true, decimals: 1, price: 101 });
    expect(hook.result().priceDir).toBe('up');
    expect(vi.getTimerCount()).toBe(1);
    await hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
