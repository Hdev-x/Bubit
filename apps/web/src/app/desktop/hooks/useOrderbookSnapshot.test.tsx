// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderHooks, renderHook } from '../../../test/renderHook';
import { useOrderbookSnapshot } from './useOrderbookSnapshot';

const mocks = vi.hoisted(() => ({
  book: null as null | { key: string; asks: Array<{ price: number; size: number }>; bids: Array<{ price: number; size: number }> },
  decimals: 2,
  funding: '0.01%',
}));
vi.mock('../../../hooks/market/useOrderbook', () => ({ useOrderbook: () => mocks.book }));
vi.mock('../../../hooks/market/useFundingRate', () => ({ useFundingRate: () => mocks.funding }));
vi.mock('../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ getTickDecimals: () => mocks.decimals }) }));

type Props = Parameters<typeof useOrderbookSnapshot>[0];
const props = (overrides: Partial<Props> = {}): Props => ({ symbol: 'BTCUSDT', exchange: 'BITGET', isFutures: true, isKrw: false, livePrice: 100, priceReady: true, ...overrides });
const book = (key: string, price: number) => ({ key, asks: [{ price: price + 1, size: 2 }], bids: [{ price: price - 1, size: 6 }] });

afterEach(async () => { await cleanupRenderHooks(); mocks.book = null; mocks.decimals = 2; mocks.funding = '0.01%'; });

describe('useOrderbookSnapshot', () => {
  it('호가와 현재가가 함께 준비될 때만 완성 묶음을 교체하고 A→B→A 미완료에서는 A를 유지한다', async () => {
    mocks.book = book('BITGET|BTCUSDT|true', 100);
    const hook = await renderHook(useOrderbookSnapshot, props());
    expect(hook.result().OB?.center).toBe(100);
    expect(hook.result().OB?.buyPct).toBe(75);

    await hook.rerender(props({ symbol: 'ETHUSDT', livePrice: null, priceReady: false }));
    expect(hook.result().OB?.center).toBe(100);
    await hook.rerender(props({ livePrice: null, priceReady: false }));
    expect(hook.result().OB?.center).toBe(100);

    mocks.book = book('BITGET|ETHUSDT|true', 200);
    mocks.decimals = 3;
    mocks.funding = '0.02%';
    await hook.rerender(props({ symbol: 'ETHUSDT', livePrice: 200, priceReady: false }));
    expect(hook.result().OB?.center).toBe(100);
    expect(hook.result().OB?.asks[0].price).toBe(101);

    await hook.rerender(props({ symbol: 'ETHUSDT', livePrice: 200, priceReady: true }));
    expect(hook.result().OB).toMatchObject({ center: 200, midDec: 3, funding: '0.02%' });
    expect(hook.result().OB?.asks[0].price).toBe(201);
    expect(hook.result().OB?.depthLabel).toBe(hook.result().depthLabel);

    await hook.rerender(props({ symbol: 'SOLUSDT', livePrice: 300, priceReady: true }));
    expect(hook.result().OB?.center).toBe(200);
    expect(hook.result().OB?.asks[0].price).toBe(201);
    mocks.book = book('BITGET|SOLUSDT|true', 300);
    mocks.decimals = 4;
    mocks.funding = '0.03%';
    await hook.rerender(props({ symbol: 'SOLUSDT', livePrice: 300, priceReady: true }));
    expect(hook.result().OB).toMatchObject({ center: 300, midDec: 4, funding: '0.03%' });
    expect(hook.result().OB?.asks[0].price).toBe(301);
    expect(hook.result().OB?.depthLabel).toBe(hook.result().depthLabel);
  });

  it('raw null은 표시도 비우고 새 raw 전까지 이전 마켓을 되살리지 않는다', async () => {
    mocks.book = book('BITGET|BTCUSDT|true', 100);
    const hook = await renderHook(useOrderbookSnapshot, props());
    mocks.book = null;
    await hook.rerender(props({ symbol: 'ETHUSDT', livePrice: null, priceReady: false }));
    expect(hook.result().OB).toBeNull();
    await hook.rerender(props({ livePrice: 120, priceReady: true }));
    expect(hook.result().OB).toBeNull();
  });

  it('마켓 변경 기본 depth와 같은 raw의 precision·KRW formatter 변경을 즉시 반영한다', async () => {
    mocks.book = book('BITGET|BTCUSDT|true', 100);
    const hook = await renderHook(useOrderbookSnapshot, props());
    expect(hook.result().depthScale).toBe('scale3');
    mocks.decimals = 4;
    await hook.rerender(props());
    expect(hook.result().OB?.midDec).toBe(4);
    expect(hook.result().obFmtMid(1.2)).toBe('1.2000');
    mocks.funding = '0.02%';
    await hook.rerender(props());
    expect(hook.result().OB?.funding).toBe('0.02%');

    const previousDepthLabel = hook.result().OB?.depthLabel;
    act(() => hook.result().setDepthScale('scale1'));
    expect(hook.result().OB?.depthLabel).not.toBe(previousDepthLabel);
    expect(hook.result().OB?.obDec).toBe(3);
    expect(hook.result().obFmtPrice(1.2)).toBe('1.200');

    mocks.book = book('BINANCE|BTCUSDT|false', 99.5);
    await hook.rerender(props({ exchange: 'BINANCE', isFutures: false, livePrice: 99.5 }));
    expect(hook.result().depthScale).toBe('scale2');
    mocks.book = book('UPBIT|KRW-BTC|false', 99.5);
    await hook.rerender(props({ symbol: 'KRW-BTC', exchange: 'UPBIT', isFutures: false, isKrw: true, livePrice: 99.5 }));
    expect(hook.result().OB?.obDec).toBeGreaterThan(0);
  });
});
