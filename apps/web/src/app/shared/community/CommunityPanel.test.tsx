// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import { CommunityPanel } from './CommunityPanel';
import type { CommunityPage } from '../../../api/server/communityApi';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), subscribe: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock('../../../api/server/communityApi', () => ({
  fetchCommunity: mocks.fetch, subscribeCommunity: mocks.subscribe,
  createCommunityPost: mocks.create, editCommunityPost: vi.fn(), deleteCommunityPost: vi.fn(), likeCommunityPost: vi.fn(),
}));

beforeEach(() => { vi.resetAllMocks(); mocks.subscribe.mockReturnValue(mocks.close); });
afterEach(async () => { await cleanupRenderComponents(); vi.useRealTimers(); });

describe('community panel lifecycle', () => {
  it('coalesces realtime events while a slow read is in flight', async () => {
    vi.useFakeTimers();
    let resolve!: (value: CommunityPage) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<CommunityPage>(done => { resolve = done; }))
      .mockResolvedValue({ items: [], hasMore: false });
    await renderComponent(<CommunityPanel user={null} exchange="bitget" market="spot" symbol="BTCUSDT" onLogin={vi.fn()} />);
    const changed = mocks.subscribe.mock.calls[0][1] as () => void;
    await act(async () => { changed(); vi.advanceTimersByTime(400); changed(); vi.advanceTimersByTime(400); });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ items: [], hasMore: false }));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps a late previous symbol response out of the active symbol and closes hidden subscriptions', async () => {
    let resolveBitcoin!: (value: CommunityPage) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<CommunityPage>(resolve => { resolveBitcoin = resolve; }))
      .mockResolvedValue({ items: [], hasMore: false });
    const props = { user: null, exchange: 'bitget', market: 'spot', onLogin: vi.fn() };
    const view = await renderComponent(<CommunityPanel {...props} symbol="BTCUSDT" />);
    await view.rerender(<CommunityPanel {...props} symbol="ETHUSDT" />);
    await act(async () => resolveBitcoin({ items: [{ id: 1, scope: 'feed', exchange: 'bitget', market: 'spot', symbol: 'BTCUSDT',
      parentId: null, title: '', body: '이전 종목의 글', authorName: '작성자', avatarUrl: null, owned: false, liked: false,
      likeCount: 0, commentCount: 0, imageId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }], hasMore: false }));
    expect(view.container.textContent).not.toContain('이전 종목의 글');
    expect(view.container.textContent).toContain('첫 글을 남겨보세요');
    expect(view.container.querySelector('textarea')?.readOnly).toBe(true);
    const requestCount = mocks.fetch.mock.calls.length;
    await view.rerender(<CommunityPanel {...props} symbol="ETHUSDT" active={false} />);
    expect(mocks.close).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(requestCount);
  });

  it('keeps guest login in the original input and reveals board tools only on request', async () => {
    mocks.fetch.mockResolvedValue({ items: [], hasMore: false });
    const onLogin = vi.fn();
    const view = await renderComponent(<CommunityPanel user={null} exchange="bitget" market="spot" symbol="BTCUSDT" onLogin={onLogin} />);
    expect(view.container.querySelector('h3')?.textContent).toBe('Community');
    expect(view.container.querySelector('[aria-label="커뮤니티 검색"]')).toBeNull();
    await act(async () => view.container.querySelector<HTMLButtonElement>('.community-input-locked button')!.click());
    expect(onLogin).toHaveBeenCalledOnce();
    await act(async () => view.container.querySelector<HTMLButtonElement>('[aria-label="게시판·검색 도구"]')!.click());
    expect(view.container.querySelector('[aria-label="커뮤니티 검색"]')).not.toBeNull();
    await act(async () => view.container.querySelectorAll<HTMLButtonElement>('.community-tabs button')[1].click());
    expect(mocks.fetch.mock.lastCall?.[0].scope).toBe('board');
  });

  it('sends from the compact input while preserving IME composition and shift-enter', async () => {
    mocks.fetch.mockResolvedValue({ items: [], hasMore: false });
    mocks.create.mockResolvedValue(undefined);
    const view = await renderComponent(<CommunityPanel user={{ username: 'member@example.test', name: '회원', role: 'USER' }}
      exchange="bitget" market="spot" symbol="BTCUSDT" onLogin={vi.fn()} />);
    const textarea = view.container.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '기존 화면에서 메시지');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    });
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(mocks.create).toHaveBeenCalledWith({ scope: 'feed', exchange: 'bitget', market: 'spot', symbol: 'BTCUSDT' }, '', '기존 화면에서 메시지', null, undefined);
    expect(textarea.value).toBe('');
  });
});
