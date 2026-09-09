// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import type { CoinTicker } from '../../../../shared/types/market';
import DemoTradeView from './DemoTradeView';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((ok, fail) => { resolve = ok; reject = fail; }), resolve, reject };
};
const ticker = (symbol: string, last: number, tickDecimals: number): CoinTicker => ({ symbol, baseSymbol: symbol.replace('USDT', ''), quoteSymbol: 'USDT', name: symbol, last, change: 0, changeRate: 0, volume: 1, tickDecimals });
const api = vi.hoisted(() => ({ fetchBinanceSpotTickers: vi.fn(), fetchBinanceFuturesTickers: vi.fn() }));
vi.mock('../../../../api/server/marketApi', () => ({ ...api }));
vi.mock('../../../../api/exchange/krw/krwTickers', () => ({ fetchUpbitSpotTickers: vi.fn(), fetchBithumbSpotTickers: vi.fn() }));
vi.mock('../../../../chart/orderbook/TradeOrderbook', () => ({ default: ({ centerPrice, fmtMid }: { centerPrice: number | null; fmtMid: (value: number) => string }) => <output data-center={centerPrice ?? ''}>{centerPrice == null ? 'empty' : fmtMid(centerPrice)}</output> }));

describe('DemoTradeView query identity', () => {
  afterEach(async () => { await cleanupRenderComponents(); vi.clearAllMocks(); });

  it('빠른 BTC→ETH→BTC 전환에서 현재 요청만 atomic하게 표시한다', async () => {
    const btc1 = deferred<CoinTicker[]>();
    const eth = deferred<CoinTicker[]>();
    const btc2 = deferred<CoinTicker[]>();
    api.fetchBinanceSpotTickers.mockReturnValueOnce(btc1.promise).mockReturnValueOnce(eth.promise).mockReturnValueOnce(btc2.promise);
    const view = await renderComponent(<DemoTradeView exchange="BINANCE" symbol="BTCUSDT" market="spot" />);
    await view.rerender(<DemoTradeView exchange="BINANCE" symbol="ETHUSDT" market="spot" />);
    await view.rerender(<DemoTradeView exchange="BINANCE" symbol="BTCUSDT" market="spot" />);
    expect(view.container.querySelector('output')?.textContent).toBe('empty');
    await act(async () => eth.resolve([ticker('ETHUSDT', 200, 1)]));
    await act(async () => btc1.resolve([ticker('BTCUSDT', 100, 2)]));
    expect(view.container.querySelector('output')?.textContent).toBe('empty');
    await act(async () => btc2.resolve([ticker('BTCUSDT', 300, 3)]));
    expect(view.container.querySelector('output')?.textContent).toBe('300.000');
  });

  it('일치 종목이 없으면 첫 ticker를 사용하고 빈 결과는 비워 둔다', async () => {
    api.fetchBinanceSpotTickers.mockResolvedValueOnce([ticker('SOLUSDT', 42, 2)]).mockResolvedValueOnce([]);
    const view = await renderComponent(<DemoTradeView exchange="BINANCE" symbol="UNKNOWN" market="spot" />);
    expect(view.container.querySelector('output')?.textContent).toBe('42.00');
    await view.rerender(<DemoTradeView exchange="BINANCE" symbol="EMPTY" market="spot" />);
    await act(async () => {});
    expect(view.container.querySelector('output')?.textContent).toBe('empty');
  });

  it('완료된 A에서 B를 거쳐 A로 재진입해도 이전 A quote를 되살리지 않는다', async () => {
    const b = deferred<CoinTicker[]>();
    const nextA = deferred<CoinTicker[]>();
    api.fetchBinanceSpotTickers
      .mockResolvedValueOnce([ticker('BTCUSDT', 100, 2)])
      .mockReturnValueOnce(b.promise)
      .mockReturnValueOnce(nextA.promise);
    const view = await renderComponent(<DemoTradeView exchange="BINANCE" symbol="BTCUSDT" market="spot" />);
    expect(view.container.querySelector('output')?.textContent).toBe('100.00');
    await view.rerender(<DemoTradeView exchange="BINANCE" symbol="ETHUSDT" market="spot" />);
    expect(view.container.querySelector('output')?.textContent).toBe('empty');
    await view.rerender(<DemoTradeView exchange="BINANCE" symbol="BTCUSDT" market="spot" />);
    expect(view.container.querySelector('output')?.textContent).toBe('empty');
    await act(async () => nextA.reject(new Error('failed')));
    expect(view.container.querySelector('output')?.textContent).toBe('empty');
  });
});
