// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import AssetsPage from './AssetsPage';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((ok) => { resolve = ok; }), resolve };
};
const rateApi = vi.hoisted(() => ({ fetchUsdKrwRate: vi.fn() }));
vi.mock('../../../api/exchange/exchangeRate', () => rateApi);
vi.mock('../components/PullToRefresh', () => ({ default: ({ children, onRefresh }: { children: ReactNode; onRefresh: () => Promise<void> }) => <><button onClick={() => void onRefresh()}>refresh</button>{children}</> }));
vi.mock('../components/ApiKeyManager', () => ({ default: () => null }));
vi.mock('../components/TotalAssetHero', () => ({ TotalAssetHero: ({ totalUsdt }: { totalUsdt: number }) => <output>{totalUsdt}</output> }));
vi.mock('../../../hooks/account/useMainTrade', () => ({ useMainTrade: () => ({ data: { equity: 1, available: 1, hasKey: true, positions: [], orders: [], planOrders: [] } }) }));
vi.mock('../../../hooks/account/useSpotValueUsdt', () => ({ useSpotValueUsdt: () => ({ value: 0, priced: true }) }));
vi.mock('../../../hooks/market/useDelayedReady', () => ({ useDelayedReady: () => true }));
vi.mock('../../../hooks/market/useRealtimePrices', () => ({ useRealtimePrices: () => ({}) }));
vi.mock('../../../shared/contexts/settingsContext', () => ({ useCurrency: () => ({ displayCurrency: 'USDT', setDisplayCurrency: vi.fn(), isHideBalance: false }) , currencyLabel: () => 'USDT' }));

describe('AssetsPage rate query', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => { await cleanupRenderComponents(); vi.useRealTimers(); vi.clearAllMocks(); });

  it('초기 조회와 10초 polling 동안 spinner 계약을 유지한다', async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    rateApi.fetchUsdKrwRate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = await renderComponent(<AssetsPage active />);
    expect(view.container.querySelector('[style*="asset-spin"]')).not.toBeNull();
    await act(async () => first.resolve(1500));
    expect(view.container.querySelector('[style*="asset-spin"]')).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(view.container.querySelector('[style*="asset-spin"]')).not.toBeNull();
    await act(async () => second.resolve(1600));
    expect(view.container.querySelector('[style*="asset-spin"]')).toBeNull();
  });

  it('PullToRefresh 클릭은 새 조회와 spinner를 시작하고 완료 뒤 끈다', async () => {
    const refresh = deferred<number>();
    rateApi.fetchUsdKrwRate.mockResolvedValueOnce(1500).mockReturnValueOnce(refresh.promise);
    const view = await renderComponent(<AssetsPage active />);
    expect(view.container.querySelector('[style*="asset-spin"]')).toBeNull();
    const button = [...view.container.querySelectorAll('button')].find((node) => node.textContent === 'refresh') as HTMLButtonElement;
    await act(async () => button.click());
    expect(rateApi.fetchUsdKrwRate).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('[style*="asset-spin"]')).not.toBeNull();
    await act(async () => refresh.resolve(1600));
    expect(view.container.querySelector('[style*="asset-spin"]')).toBeNull();
  });

  it('비활성화 cleanup 뒤 늦은 응답을 버리고 재활성 요청만 반영한다', async () => {
    const oldRequest = deferred<number>();
    const newRequest = deferred<number>();
    rateApi.fetchUsdKrwRate.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const view = await renderComponent(<AssetsPage active />);
    await view.rerender(<AssetsPage active={false} />);
    await view.rerender(<AssetsPage active />);
    await act(async () => oldRequest.resolve(1700));
    expect(view.container.querySelector('[style*="asset-spin"]')).not.toBeNull();
    await act(async () => newRequest.resolve(1800));
    expect(view.container.querySelector('[style*="asset-spin"]')).toBeNull();
    await view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('StrictMode 첫 setup의 늦은 응답이 현재 loading을 끝내지 않는다', async () => {
    const stale = deferred<number>();
    const current = deferred<number>();
    rateApi.fetchUsdKrwRate.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    const view = await renderComponent(<StrictMode><AssetsPage active /></StrictMode>);
    expect(rateApi.fetchUsdKrwRate).toHaveBeenCalledTimes(2);
    await act(async () => stale.resolve(1500));
    expect(view.container.querySelector('[style*="asset-spin"]')).not.toBeNull();
    await act(async () => current.resolve(1600));
    expect(view.container.querySelector('[style*="asset-spin"]')).toBeNull();
  });
});
