// @vitest-environment jsdom
import { act } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../../test/renderComponent';
import type { CoinTicker } from '../../../../shared/types/market';
import SymbolSearchSheet from './SymbolSearchSheet';
import { deferred } from '../../../../test/renderHook';

const loaders = vi.hoisted(() => ({ bitgetSpot: vi.fn(), bitgetFutures: vi.fn(), binanceSpot: vi.fn(), binanceFutures: vi.fn() }));
vi.mock('../../../../api/server/marketApi', () => ({ fetchCoinTickers: loaders.bitgetSpot, fetchCoinFuturesTickers: loaders.bitgetFutures, fetchBinanceSpotTickers: loaders.binanceSpot, fetchBinanceFuturesTickers: loaders.binanceFutures }));
vi.mock('framer-motion', async () => {
  type MotionProps = HTMLAttributes<HTMLDivElement> & { onDragEnd?: (_event: unknown, info: unknown) => void; drag?: unknown; dragListener?: unknown; dragControls?: unknown; dragConstraints?: unknown; dragElastic?: unknown; initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown };
  return { AnimatePresence: ({ children }: { children: ReactNode }) => children, useDragControls: () => ({ start: vi.fn() }), motion: { div: ({ children, onDragEnd, drag: _drag, dragListener: _dragListener, dragControls: _dragControls, dragConstraints: _dragConstraints, dragElastic: _dragElastic, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: MotionProps) => <div {...props} onDoubleClick={() => onDragEnd?.({}, { offset: { y: -100 }, velocity: { y: 0 } })}>{children}</div> } };
});

const ticker = (symbol: string, volume: number, changeRate = 0): CoinTicker => ({ symbol, baseSymbol: symbol.replace('USDT', ''), quoteSymbol: 'USDT', name: symbol, last: volume, change: 0, changeRate, volume, tickDecimals: 2 });
const list = Array.from({ length: 45 }, (_, i) => ticker(`${String(i).padStart(2, '0')}USDT`, i, i / 100));
const stored = new Map<string, string>();
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), clear: () => stored.clear() });
  for (const loader of Object.values(loaders)) loader.mockResolvedValue([]);
});
afterEach(async () => { await cleanupRenderComponents(); stored.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('SymbolSearchSheet', () => {
  it('재열기와 마켓 변경 시 검색·표시 수·크기는 초기화하고 정렬은 유지한다', async () => {
    loaders.bitgetSpot.mockResolvedValue(list); loaders.binanceFutures.mockResolvedValue(list);
    const props = { onClose: vi.fn(), onSelect: vi.fn() };
    const view = await renderComponent(<SymbolSearchSheet {...props} isOpen exchange="BITGET" isFutures={false} />);
    await act(async () => {});
    const content = view.container.querySelector('.interval-sheet-content')!;
    Object.defineProperties(content, { scrollHeight: { value: 1_000 }, scrollTop: { value: 800 }, clientHeight: { value: 100 } });
    act(() => content.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(45);
    act(() => [...view.container.querySelectorAll('button')].find((button) => button.textContent === '거래대금')!.click());
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(45);
    act(() => [...view.container.querySelectorAll('button')].find((button) => button.textContent === '급상승')!.click());
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(40);
    const input = view.container.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '44');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(1);
    const sheet = view.container.querySelector('.interval-sheet')!;
    act(() => sheet.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(sheet.classList.contains('full')).toBe(true);
    await view.rerender(<SymbolSearchSheet {...props} isOpen exchange="BINANCE" isFutures />);
    await act(async () => {});
    expect(view.container.querySelector('input')!.getAttribute('value')).toBe('');
    expect(view.container.querySelectorAll('.symbol-row')).toHaveLength(40);
    expect(view.container.querySelector('.interval-sheet')!.classList.contains('compact')).toBe(true);
    expect([...view.container.querySelectorAll('button')].find((button) => button.textContent === '급상승')!.classList.contains('active')).toBe(true);
    await view.rerender(<SymbolSearchSheet {...props} isOpen={false} exchange="BINANCE" isFutures />);
    await view.rerender(<SymbolSearchSheet {...props} isOpen exchange="BINANCE" isFutures />);
    expect(view.container.querySelector('input')!.getAttribute('value')).toBe('');
  });

  it('매번 열 때 저장된 관심종목을 다시 읽는다', async () => {
    loaders.bitgetSpot.mockResolvedValue([ticker('BTCUSDT', 1), ticker('ETHUSDT', 2)]);
    loaders.bitgetFutures.mockResolvedValue([ticker('BTCUSDT', 1), ticker('ETHUSDT', 2)]);
    localStorage.setItem('watchlist_symbols', JSON.stringify(['BTCUSDT']));
    const props = { onClose: vi.fn(), onSelect: vi.fn(), exchange: 'BITGET' as const, isFutures: false };
    const view = await renderComponent(<SymbolSearchSheet {...props} isOpen />); await act(async () => {});
    expect(view.container.querySelector('.symbol-watchlist-scroll')?.textContent).toContain('BTC');
    localStorage.setItem('watchlist_symbols', JSON.stringify(['ETHUSDT']));
    await view.rerender(<SymbolSearchSheet {...props} isOpen isFutures />); await act(async () => {});
    expect(view.container.querySelector('.symbol-watchlist-scroll')?.textContent).toContain('ETH');
    expect(view.container.querySelector('.symbol-watchlist-scroll')?.textContent).not.toContain('BTC');
    await view.rerender(<SymbolSearchSheet {...props} isOpen={false} />);
    localStorage.setItem('watchlist_symbols', JSON.stringify(['BTCUSDT']));
    await view.rerender(<SymbolSearchSheet {...props} isOpen />); await act(async () => {});
    expect(view.container.querySelector('.symbol-watchlist-scroll')?.textContent).toContain('BTC');
  });

  it('거래소·상품 전환과 재열기 뒤 늦은 요청이 현재 목록을 덮지 않는다', async () => {
    const oldSpot = deferred<CoinTicker[]>();
    const otherExchange = deferred<CoinTicker[]>();
    const currentSpot = deferred<CoinTicker[]>();
    const futures = deferred<CoinTicker[]>();
    loaders.bitgetSpot.mockReturnValueOnce(oldSpot.promise).mockReturnValueOnce(currentSpot.promise);
    loaders.binanceSpot.mockReturnValueOnce(otherExchange.promise);
    loaders.bitgetFutures.mockReturnValueOnce(futures.promise);
    const props = { onClose: vi.fn(), onSelect: vi.fn() };
    const view = await renderComponent(<SymbolSearchSheet {...props} isOpen exchange="BITGET" />);
    await view.rerender(<SymbolSearchSheet {...props} isOpen exchange="BINANCE" />);
    await view.rerender(<SymbolSearchSheet {...props} isOpen exchange="BITGET" />);
    await act(async () => currentSpot.resolve([ticker('CURRENTUSDT', 2)]));
    await act(async () => { oldSpot.resolve([ticker('OLDUSDT', 1)]); otherExchange.resolve([ticker('OTHERUSDT', 1)]); });
    expect(view.container.querySelector('.symbol-row-list')?.textContent).toContain('CURRENTUSDT');
    expect(view.container.querySelector('.symbol-row-list')?.textContent).not.toMatch(/OLDUSDT|OTHERUSDT/);
    await view.rerender(<SymbolSearchSheet {...props} isOpen exchange="BITGET" isFutures />);
    expect(view.container.querySelector('.symbol-row-list')?.textContent).toContain('CURRENTUSDT');
    await view.rerender(<SymbolSearchSheet {...props} isOpen={false} exchange="BITGET" isFutures />);
    loaders.bitgetFutures.mockRejectedValueOnce(new Error('offline'));
    await view.rerender(<SymbolSearchSheet {...props} isOpen exchange="BITGET" isFutures />);
    await act(async () => futures.resolve([ticker('CLOSEDUSDT', 1)]));
    expect(view.container.querySelector('.symbol-row-list')?.textContent).toContain('CURRENTUSDT');
    expect(view.container.querySelector('.symbol-row-list')?.textContent).not.toContain('CLOSEDUSDT');
  });

});
