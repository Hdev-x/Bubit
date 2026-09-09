// @vitest-environment jsdom
import { act } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import type { CoinTicker } from '../../../../shared/types/market';
import TradeSymbolSheet from './TradeSymbolSheet';
import type { RealtimeTicker } from '../../../../api/server/coinRealtime';
import { deferred } from '../../../../test/renderHook';

const mocks = vi.hoisted(() => ({ bitgetSpot: vi.fn(), bitgetFutures: vi.fn(), binanceSpot: vi.fn(), binanceFutures: vi.fn(), upbit: vi.fn(), bithumb: vi.fn() }));
vi.mock('../../../../api/server/marketApi', () => ({ fetchCoinTickers: mocks.bitgetSpot, fetchCoinFuturesTickers: mocks.bitgetFutures, fetchBinanceSpotTickers: mocks.binanceSpot, fetchBinanceFuturesTickers: mocks.binanceFutures }));
vi.mock('../../../../api/exchange/krw/krwTickers', () => ({ fetchUpbitSpotTickers: mocks.upbit, fetchBithumbSpotTickers: mocks.bithumb }));
const subscriptions = vi.hoisted(() => ({ spot: vi.fn(), futures: vi.fn() }));
vi.mock('../../../../api/server/coinRealtime', () => ({ subscribeBitgetSpotTickers: subscriptions.spot, subscribeBitgetFuturesTickers: subscriptions.futures }));
vi.mock('../../../../hooks/market/usePricePrecision', () => ({ usePricePrecision: () => ({ precisionMap: new Map() }) }));
vi.mock('framer-motion', async () => {
  type MotionProps = HTMLAttributes<HTMLDivElement> & { drag?: unknown; dragListener?: unknown; dragControls?: unknown; dragConstraints?: unknown; dragElastic?: unknown; initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown };
  return { AnimatePresence: ({ children }: { children: ReactNode }) => children, useDragControls: () => ({ start: vi.fn() }), motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, drag: _drag, dragListener: _dragListener, dragControls: _dragControls, dragConstraints: _dragConstraints, dragElastic: _dragElastic, onDragEnd: _onDragEnd, ...props }: MotionProps) => <div {...props}>{children}</div> } };
});
const ticker = (symbol: string): CoinTicker => ({ symbol, baseSymbol: symbol.replace('USDT', ''), quoteSymbol: 'USDT', name: symbol, last: 1, change: 0, changeRate: 0.01, volume: 10, tickDecimals: 2 });
const tickerList = Array.from({ length: 45 }, (_, i) => ticker(`${String(i).padStart(2, '0')}USDT`));
const stored = new Map<string, string>();
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), clear: () => stored.clear() });
  for (const loader of Object.values(mocks)) loader.mockResolvedValue([]);
  subscriptions.spot.mockImplementation(() => ({ close: vi.fn() }));
  subscriptions.futures.mockImplementation(() => ({ close: vi.fn() }));
});
afterEach(async () => { await cleanupRenderComponents(); stored.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('TradeSymbolSheet', () => {
  it('incoming market·exchange와 미지원 futures를 같은 전환에서 초기화한다', async () => {
    mocks.bitgetFutures.mockResolvedValue(tickerList); mocks.binanceFutures.mockResolvedValue(tickerList); mocks.upbit.mockResolvedValue([ticker('KRW-BTC')]);
    const props = { onClose: vi.fn(), onSelect: vi.fn() };
    const view = await renderComponent(<TradeSymbolSheet {...props} isOpen initialMarket="futures" exchange="BITGET" />); await act(async () => {});
    expect([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].find((button) => button.textContent === 'Futures')?.classList.contains('active')).toBe(true);
    const content = view.container.querySelector('.interval-sheet-content')!;
    Object.defineProperties(content, { scrollHeight: { value: 1_000 }, scrollTop: { value: 800 }, clientHeight: { value: 100 } });
    act(() => content.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(45);
    act(() => ([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].find((button) => button.textContent === 'Futures') as HTMLElement).click());
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(45);
    act(() => ([...view.container.querySelectorAll('.trade-symbol-exchange-row button')].find((button) => button.textContent?.includes('Binance')) as HTMLElement).click());
    await act(async () => {});
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(45);
    const input = view.container.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'ETH');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(0);
    await view.rerender(<TradeSymbolSheet {...props} isOpen initialMarket="futures" exchange="UPBIT" />); await act(async () => {});
    expect(view.container.querySelector('input')!.getAttribute('value')).toBe('');
    expect([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].find((button) => button.textContent === 'Spot')!.classList.contains('active')).toBe(true);
    expect([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].some((button) => button.textContent === 'Futures')).toBe(false);
  });

  it('선물 미지원 거래소로 처음 열어도 즉시 Spot을 선택한다', async () => {
    mocks.bithumb.mockResolvedValue([ticker('KRW-BTC')]);
    const view = await renderComponent(<TradeSymbolSheet isOpen initialMarket="futures" exchange="BITHUMB" onClose={vi.fn()} onSelect={vi.fn()} />);
    await act(async () => {});
    expect([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].find((button) => button.textContent === 'Spot')!.classList.contains('active')).toBe(true);
    expect([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].some((button) => button.textContent === 'Futures')).toBe(false);
  });

  it('재열기마다 favorites storage를 다시 읽는다', async () => {
    mocks.bitgetSpot.mockResolvedValue([ticker('BTCUSDT'), ticker('ETHUSDT')]); mocks.bitgetFutures.mockResolvedValue([]);
    localStorage.setItem('trade_favorites', JSON.stringify(['spot|BTCUSDT']));
    const props = { onClose: vi.fn(), onSelect: vi.fn(), initialMarket: 'spot' as const, exchange: 'BITGET' as const };
    const view = await renderComponent(<TradeSymbolSheet {...props} isOpen />); await act(async () => {});
    act(() => ([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].find((button) => button.textContent === 'Favorites') as HTMLElement).click());
    expect(view.container.querySelector('.symbol-row-list')?.textContent).toContain('BTCUSDT');
    await view.rerender(<TradeSymbolSheet {...props} isOpen={false} />);
    localStorage.setItem('trade_favorites', JSON.stringify(['spot|ETHUSDT']));
    await view.rerender(<TradeSymbolSheet {...props} isOpen />); await act(async () => {});
    act(() => ([...view.container.querySelectorAll('.trade-symbol-market-tabs button')].find((button) => button.textContent === 'Favorites') as HTMLElement).click());
    expect(view.container.querySelector('.symbol-row-list')?.textContent).toContain('ETHUSDT');
    expect(view.container.querySelector('.symbol-row-list')?.textContent).not.toContain('BTCUSDT');
  });

  it('다른 거래소에 Bitget WS 값을 섞지 않고 닫힌 구독의 늦은 값도 버린다', async () => {
    const streams: { update: (ticker: RealtimeTicker) => void; close: ReturnType<typeof vi.fn> }[] = [];
    subscriptions.spot.mockImplementation((_symbols: string[], update: (ticker: RealtimeTicker) => void) => {
      const stream = { update, close: vi.fn() }; streams.push(stream); return stream;
    });
    mocks.bitgetSpot.mockResolvedValue([ticker('BTCUSDT')]);
    mocks.binanceSpot.mockResolvedValue([{ ...ticker('BTCUSDT'), last: 20 }]);
    const props = { onClose: vi.fn(), onSelect: vi.fn(), initialMarket: 'spot' as const };
    const view = await renderComponent(<TradeSymbolSheet {...props} isOpen exchange="BITGET" />);
    const price = () => view.container.querySelector('.symbol-row-price')?.textContent;
    act(() => streams[0].update({ symbol: 'BTCUSDT', price: 11 }));
    expect(price()).toContain('11.00');
    await view.rerender(<TradeSymbolSheet {...props} isOpen exchange="BINANCE" />);
    expect(streams[0].close).toHaveBeenCalledTimes(1);
    expect(price()).toContain('20.00');
    act(() => streams[0].update({ symbol: 'BTCUSDT', price: 999 }));
    expect(price()).toContain('20.00');
    await view.rerender(<TradeSymbolSheet {...props} isOpen exchange="BITGET" />);
    act(() => streams.at(-1)!.update({ symbol: 'BTCUSDT', price: 33 }));
    act(() => streams[0].update({ symbol: 'BTCUSDT', price: 999 }));
    expect(price()).toContain('33.00');
    const last = streams.at(-1)!;
    await view.unmount();
    expect(last.close).toHaveBeenCalledTimes(1);
  });

  it('재열기의 최신 조회만 반영하고 폴링 실패는 마지막 목록을 유지한다', async () => {
    vi.useFakeTimers();
    try {
      const old = deferred<CoinTicker[]>();
      const next = deferred<CoinTicker[]>();
      mocks.bitgetSpot.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise).mockRejectedValue(new Error('offline'));
      const props = { onClose: vi.fn(), onSelect: vi.fn(), initialMarket: 'spot' as const, exchange: 'BITGET' as const };
      const view = await renderComponent(<TradeSymbolSheet {...props} isOpen />);
      await view.rerender(<TradeSymbolSheet {...props} isOpen={false} />);
      expect(vi.getTimerCount()).toBe(0);
      await view.rerender(<TradeSymbolSheet {...props} isOpen />);
      expect(vi.getTimerCount()).toBe(1);
      await act(async () => next.resolve([ticker('CURRENTUSDT')]));
      await act(async () => old.resolve([ticker('OLDUSDT')]));
      await act(async () => vi.advanceTimersByTime(5000));
      expect(mocks.bitgetSpot).toHaveBeenCalledTimes(3);
      expect(view.container.querySelector('.symbol-row-list')?.textContent).toContain('CURRENTUSDT');
      expect(view.container.querySelector('.symbol-row-list')?.textContent).not.toContain('OLDUSDT');
      await view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { await cleanupRenderComponents(); vi.clearAllTimers(); vi.useRealTimers(); }
  });

});
