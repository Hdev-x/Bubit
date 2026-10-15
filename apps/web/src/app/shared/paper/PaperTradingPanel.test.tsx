// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderComponent, cleanupRenderComponents } from '../../../test/renderComponent';
import { PaperTradingPanel } from './PaperTradingPanel';
const fetchAccount = vi.hoisted(() => vi.fn());
vi.mock('../../../api/server/paperApi', () => ({ fetchPaperAccount: fetchAccount }));
afterEach(cleanupRenderComponents);

it('비로그인 사용자는 모의계좌를 조회하지 않는다', async () => {
  const view = await renderComponent(<PaperTradingPanel symbol="BTCUSDT" user={null} />);
  expect(view.container.textContent).toContain('로그인하면');
  expect(fetchAccount).not.toHaveBeenCalled();
});
