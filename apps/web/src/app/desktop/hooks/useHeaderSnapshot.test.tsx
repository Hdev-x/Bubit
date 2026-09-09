// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BitgetTicker } from '../../../api/exchange/bitget/bitgetTicker';
import type { Candle } from '../../../shared/types/market';
import { cleanupRenderHooks, deferred, renderHook } from '../../../test/renderHook';
import { useHeaderSnapshot } from './useHeaderSnapshot';

const api = vi.hoisted(() => ({ fetchHeaderTicker: vi.fn(), fetchCoinMarketCap: vi.fn() }));
vi.mock('../../../api/exchange/headerTicker', () => ({ fetchHeaderTicker: api.fetchHeaderTicker }));
vi.mock('../../../api/server/marketApi', () => ({ fetchCoinMarketCap: api.fetchCoinMarketCap }));

const ticker = (price: number): BitgetTicker => ({
  last: price, high24h: price + 10, low24h: price - 10,
  baseVolume: 1_500, quoteVolume: 2_000_000, openUtc: price - 1,
});
const candles = (open: number): Candle[] => [
  { time: 1, open: open - 2, high: open, low: open - 3, close: open - 1, volume: 1 },
  { time: 2, open, high: open + 2, low: open - 1, close: open + 1, volume: 1 },
];
const fmt = (digits: number) => (value: number | null | undefined) => value == null ? '—' : value.toFixed(digits);
type Props = Parameters<typeof useHeaderSnapshot>[0];
const props = (overrides: Partial<Props> = {}): Props => ({
  symbol: 'BTCUSDT', exchange: 'BINANCE', isFutures: false, base: 'BTC',
  loadCandles: vi.fn().mockResolvedValue(candles(100)),
  livePrice: 110, dailyOpenPrice: 100, priceReady: true, fmtPx: fmt(2),
  ...overrides,
});

describe('useHeaderSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.fetchHeaderTicker.mockReset().mockResolvedValue(ticker(110));
    api.fetchCoinMarketCap.mockReset().mockResolvedValue(1_000_000_000);
  });
  afterEach(async () => {
    await cleanupRenderHooks();
    vi.useRealTimers();
  });

  it('새 market의 primary 가격부터 교체하고 auxiliary 통계는 현재 key 도착 때 채운다', async () => {
    const view = await renderHook(useHeaderSnapshot, props());
    expect(view.result().H?.symbol).toBe('BTCUSDT');

    const nextTicker = deferred<BitgetTicker | null>();
    const nextDay = deferred<Candle[]>();
    const nextCap = deferred<number | null>();
    api.fetchHeaderTicker.mockReturnValueOnce(nextTicker.promise);
    api.fetchCoinMarketCap.mockReturnValueOnce(nextCap.promise);
    const ethProps = props({
      symbol: 'ETHUSDT', base: 'ETH', livePrice: 210, dailyOpenPrice: 200,
      loadCandles: vi.fn(() => nextDay.promise),
    });
    await view.rerender(ethProps);
    expect(view.result().H).toMatchObject({ symbol: 'ETHUSDT', cap: '—', high: '—' });
    await act(async () => nextTicker.resolve(ticker(210)));
    await act(async () => nextDay.resolve(candles(200)));
    expect(view.result().H).toMatchObject({ symbol: 'ETHUSDT', cap: '—' });
    await act(async () => nextCap.resolve(2_000_000_000));
    expect(view.result().H).toMatchObject({ symbol: 'ETHUSDT', exchange: 'BINANCE', px: '210.00', high: '220.00', cap: '$2.00B' });
  });

  it('동일 symbol의 exchange-only와 futures-only 전환도 새 primary identity를 즉시 사용한다', async () => {
    const initialLoad = vi.fn().mockResolvedValue(candles(100));
    const view = await renderHook(useHeaderSnapshot, props({ loadCandles: initialLoad }));
    expect(view.result().H).toMatchObject({ exchange: 'BINANCE', isFutures: false });

    const exchangeTicker = deferred<BitgetTicker | null>();
    const exchangeDay = deferred<Candle[]>();
    api.fetchHeaderTicker.mockReturnValueOnce(exchangeTicker.promise);
    await view.rerender(props({ exchange: 'BITGET', loadCandles: vi.fn(() => exchangeDay.promise) }));
    expect(view.result().H).toMatchObject({ exchange: 'BITGET', isFutures: false, high: '—' });
    await act(async () => exchangeTicker.resolve(ticker(111)));
    await act(async () => exchangeDay.resolve(candles(101)));
    expect(view.result().H).toMatchObject({ exchange: 'BITGET', isFutures: false });

    const futuresTicker = deferred<BitgetTicker | null>();
    const futuresDay = deferred<Candle[]>();
    api.fetchHeaderTicker.mockReturnValueOnce(futuresTicker.promise);
    await view.rerender(props({ exchange: 'BITGET', isFutures: true, loadCandles: vi.fn(() => futuresDay.promise) }));
    expect(view.result().H).toMatchObject({ exchange: 'BITGET', isFutures: true, high: '—' });
    await act(async () => futuresTicker.resolve(ticker(112)));
    await act(async () => futuresDay.resolve(candles(102)));
    expect(view.result().H).toMatchObject({ exchange: 'BITGET', isFutures: true, title: 'BTCUSDT.P' });
  });

  it('BTC→ETH→BTC 전환에서 늦은 이전 응답을 폐기한다', async () => {
    const view = await renderHook(useHeaderSnapshot, props());
    const ethTicker = deferred<BitgetTicker | null>();
    const ethDay = deferred<Candle[]>();
    api.fetchHeaderTicker.mockReturnValueOnce(ethTicker.promise);
    await view.rerender(props({ symbol: 'ETHUSDT', base: 'ETH', loadCandles: vi.fn(() => ethDay.promise) }));

    const btcTicker = deferred<BitgetTicker | null>();
    const btcDay = deferred<Candle[]>();
    api.fetchHeaderTicker.mockReturnValueOnce(btcTicker.promise);
    await view.rerender(props({ loadCandles: vi.fn(() => btcDay.promise) }));
    await act(async () => ethTicker.resolve(ticker(999)));
    await act(async () => ethDay.resolve(candles(999)));
    expect(view.result().H?.high).not.toBe('1009.00');
    await act(async () => btcTicker.resolve(ticker(120)));
    await act(async () => btcDay.resolve(candles(105)));
    expect(view.result().H).toMatchObject({ symbol: 'BTCUSDT', high: '130.00', todayOpen: '105.00' });
  });

  it('ticker/day 실패와 null market cap도 placeholder로 ready가 된다', async () => {
    api.fetchHeaderTicker.mockRejectedValueOnce(new Error('ticker'));
    api.fetchCoinMarketCap.mockResolvedValueOnce(null);
    const view = await renderHook(useHeaderSnapshot, props({ loadCandles: vi.fn().mockRejectedValue(new Error('day')) }));
    expect(view.result().H).toMatchObject({ px: '110.00', high: '—', low: '—', prevClose: '—', todayOpen: '100.00', cap: '—' });
  });

  it('ready 뒤 가격과 새 formatter를 즉시 반영하고 매 render 새 함수여도 안정적이다', async () => {
    const view = await renderHook(useHeaderSnapshot, props());
    expect(view.result().H?.px).toBe('110.00');
    await view.rerender(props({ livePrice: 111.2345, fmtPx: fmt(3) }));
    expect(view.result().H).toMatchObject({ px: '111.234', prevClose: '99.000' });
    await view.rerender(props({ livePrice: 112.5, fmtPx: fmt(1) }));
    expect(view.result().H?.px).toBe('112.5');
  });

  it('새 key의 livePrice가 비면 이전 H를 유지하고 dailyOpen만 비면 현재 H의 등락을 생략한다', async () => {
    const view = await renderHook(useHeaderSnapshot, props());
    expect(view.result().H?.symbol).toBe('BTCUSDT');
    await view.rerender(props({ symbol: 'ETHUSDT', base: 'ETH', livePrice: null, dailyOpenPrice: 200 }));
    expect(view.result().H?.symbol).toBe('BTCUSDT');
    await view.rerender(props({ symbol: 'ETHUSDT', base: 'ETH', livePrice: 210, dailyOpenPrice: null }));
    expect(view.result().H).toMatchObject({ symbol: 'ETHUSDT', chg: null });
  });

  it('StrictMode에서도 4s/60s/300s timer 한 세트만 남기고 unmount에서 모두 정리한다', async () => {
    const loadCandles = vi.fn().mockResolvedValue(candles(100));
    const view = await renderHook(useHeaderSnapshot, props({ loadCandles }), { strict: true });
    expect(vi.getTimerCount()).toBe(3);
    const tickerCalls = api.fetchHeaderTicker.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(4_000));
    expect(api.fetchHeaderTicker).toHaveBeenCalledTimes(tickerCalls + 1);
    await act(async () => vi.advanceTimersByTimeAsync(56_000));
    expect(loadCandles.mock.calls.length).toBeGreaterThan(2);
    await act(async () => vi.advanceTimersByTimeAsync(240_000));
    expect(api.fetchCoinMarketCap.mock.calls.length).toBeGreaterThan(2);
    await view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
