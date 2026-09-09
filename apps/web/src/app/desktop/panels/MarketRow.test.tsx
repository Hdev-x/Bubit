// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import type { CoinTicker } from '../../../shared/types/market';
import { SymbolRow } from './MarketRow';

afterEach(cleanupRenderComponents);

const ticker = (baseSymbol: string): CoinTicker => ({
  symbol: `${baseSymbol}USDT`, baseSymbol, quoteSymbol: 'USDT', name: baseSymbol,
  last: 1, change: 0, changeRate: 0, volume: 1, tickDecimals: 2,
});

describe('SymbolRow logo', () => {
  it('새 종목과 logoUrl로 바뀌면 첫 후보부터 다시 시도한다', async () => {
    const props = { market: 'spot' as const, decimals: 2, faved: false, onToggleFav: vi.fn() };
    const view = await renderComponent(<SymbolRow {...props} ticker={ticker('XZZ')} logoUrl="old.png" />);
    const image = () => view.container.querySelector('img[alt]') as HTMLImageElement | null;

    expect(image()?.src).toContain('old.png');
    await act(async () => image()?.dispatchEvent(new Event('error')));
    expect(image()?.src).toContain('cryptocurrency-icons');
    await act(async () => image()?.dispatchEvent(new Event('error')));
    expect(view.container.querySelector('.wm-row-logo--fallback')?.textContent).toBe('XZ');

    await view.rerender(<SymbolRow {...props} ticker={ticker('YZZ')} logoUrl="new.png" />);
    expect(image()?.src).toContain('new.png');
  });
});
