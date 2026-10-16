// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import { CommunityPanel } from './CommunityPanel';
import type { CommunityPage } from '../../../api/server/communityApi';

function messagePage(ids: number[], hasMore = false): CommunityPage {
  return { items: ids.map(id => ({ id, scope: 'board', exchange: '', market: '', symbol: '', parentId: null,
    title: '', body: `메시지 ${id}`, authorName: '작성자', avatarUrl: '/avatar.png', owned: false, liked: false,
    likeCount: 0, commentCount: 0, imageId: null, createdAt: `2026-01-01T00:0${id}:00Z`, updatedAt: `2026-01-01T00:0${id}:00Z` })), hasMore };
}

function scrollMetrics(feed: HTMLDivElement) {
  let height = 1000;
  let top = 0;
  Object.defineProperties(feed, {
    scrollHeight: { configurable: true, get: () => height },
    clientHeight: { configurable: true, value: 200 },
    scrollTop: { configurable: true, get: () => top, set: value => { top = Math.max(0, Math.min(value, height - 200)); } },
  });
  return {
    resize: (value: number) => { height = value; },
    scroll: (value: number) => { feed.scrollTop = value; feed.dispatchEvent(new Event('scroll', { bubbles: true })); },
  };
}

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), subscribe: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock('../../../api/server/communityApi', () => ({
  fetchCommunity: mocks.fetch, subscribeCommunity: mocks.subscribe,
  createCommunityPost: mocks.create, editCommunityPost: vi.fn(), deleteCommunityPost: vi.fn(), likeCommunityPost: vi.fn(),
}));

beforeEach(() => { vi.resetAllMocks(); mocks.subscribe.mockReturnValue(mocks.close); });
afterEach(async () => { await cleanupRenderComponents(); vi.useRealTimers(); });

describe('community panel lifecycle', () => {
  it('shows oldest messages first and follows new messages only while reading the bottom', async () => {
    vi.useFakeTimers();
    let resolve!: (page: CommunityPage) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<CommunityPage>(done => { resolve = done; }));
    const view = await renderComponent(<CommunityPanel user={null} exchange="bitget" market="spot" symbol="BTCUSDT" onLogin={vi.fn()} />);
    const feed = view.container.querySelector<HTMLDivElement>('.community-feed')!;
    const metrics = scrollMetrics(feed);
    const first = messagePage([3, 2, 1], true);
    await act(async () => resolve(first));
    expect([...view.container.querySelectorAll('.community-post-body')].map(node => node.textContent)).toEqual(['메시지 1', '메시지 2', '메시지 3']);
    expect(first.items.map(post => post.id)).toEqual([3, 2, 1]);
    expect(feed.firstElementChild?.className).toBe('community-pagination');
    expect(feed.scrollTop).toBe(800);

    metrics.resize(1200);
    await act(async () => feed.querySelector('img')!.dispatchEvent(new Event('load')));
    expect(feed.scrollTop).toBe(1000);
    const changed = mocks.subscribe.mock.calls[0][1] as () => void;
    mocks.fetch.mockResolvedValue(messagePage([4, 3, 2], true));
    metrics.resize(1400);
    await act(async () => { changed(); vi.advanceTimersByTime(400); });
    expect(feed.scrollTop).toBe(1200);

    await act(async () => metrics.scroll(200));
    mocks.fetch.mockResolvedValue(messagePage([5, 4, 3], true));
    metrics.resize(1600);
    await act(async () => { changed(); vi.advanceTimersByTime(400); });
    expect(feed.scrollTop).toBe(200);
    metrics.resize(1800);
    await act(async () => feed.querySelector('img')!.dispatchEvent(new Event('load')));
    expect(feed.scrollTop).toBe(200);
  });

  it('moves to the bottom on page changes and returns to the latest page after sending', async () => {
    let resolve!: (page: CommunityPage) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<CommunityPage>(done => { resolve = done; }));
    mocks.create.mockResolvedValue(undefined);
    const view = await renderComponent(<CommunityPanel user={{ username: 'member@example.test', name: '회원', role: 'USER' }}
      exchange="bitget" market="spot" symbol="BTCUSDT" onLogin={vi.fn()} />);
    const feed = view.container.querySelector<HTMLDivElement>('.community-feed')!;
    const metrics = scrollMetrics(feed);
    await act(async () => resolve(messagePage([6, 5, 4], true)));
    await act(async () => metrics.scroll(100));
    mocks.fetch.mockImplementationOnce(() => new Promise<CommunityPage>(done => { resolve = done; }));
    await act(async () => view.container.querySelectorAll<HTMLButtonElement>('.community-pagination button')[1].click());
    expect(mocks.fetch.mock.lastCall?.[0].page).toBe(1);
    metrics.resize(1200);
    await act(async () => resolve(messagePage([3, 2, 1])));
    expect(feed.scrollTop).toBe(1000);

    await act(async () => metrics.scroll(150));
    mocks.fetch.mockResolvedValue(messagePage([7, 6, 5], true));
    const textarea = view.container.querySelector<HTMLTextAreaElement>('.community-composer textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '새 메시지');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    metrics.resize(1400);
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(mocks.fetch.mock.lastCall?.[0].page).toBe(0);
    expect(feed.scrollTop).toBe(1200);
    expect(view.container.querySelector('.community-post:last-child .community-post-body')?.textContent).toBe('메시지 7');
  });

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

  it('keeps the same global chat through symbol changes and closes hidden subscriptions', async () => {
    let resolveChat!: (value: CommunityPage) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<CommunityPage>(resolve => { resolveChat = resolve; }))
      .mockResolvedValue({ items: [], hasMore: false });
    const props = { user: null, exchange: 'bitget', market: 'spot', onLogin: vi.fn() };
    const view = await renderComponent(<CommunityPanel {...props} symbol="BTCUSDT" />);
    await view.rerender(<CommunityPanel {...props} symbol="ETHUSDT" />);
    await act(async () => resolveChat({ items: [{ id: 1, scope: 'board', exchange: '', market: '', symbol: '',
      parentId: null, title: '', body: '모두의 메시지', authorName: '작성자', avatarUrl: null, owned: false, liked: false,
      likeCount: 0, commentCount: 0, imageId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }], hasMore: false }));
    expect(view.container.textContent).toContain('모두의 메시지');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.lastCall?.[0]).toMatchObject({ scope: 'board', exchange: '', market: '', symbol: '', sort: 'latest', q: '' });
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('.community-post-author time')?.textContent).toMatch(/2026.*01.*01.*\d{2}:\d{2}/);
    expect(view.container.querySelector('textarea')?.readOnly).toBe(true);
    const requestCount = mocks.fetch.mock.calls.length;
    await view.rerender(<CommunityPanel {...props} symbol="ETHUSDT" active={false} />);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(requestCount);
  });

  it('keeps guest login in the original input without board, search or sort controls', async () => {
    mocks.fetch.mockResolvedValue({ items: [], hasMore: false });
    const onLogin = vi.fn();
    const view = await renderComponent(<CommunityPanel user={null} exchange="bitget" market="spot" symbol="BTCUSDT" onLogin={onLogin} />);
    expect(view.container.querySelector('h3')?.textContent).toBe('Community');
    expect(view.container.querySelector('[aria-label="커뮤니티 검색"]')).toBeNull();
    await act(async () => view.container.querySelector<HTMLButtonElement>('.community-input-locked button')!.click());
    expect(onLogin).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[aria-label="게시판·검색 도구"]')).toBeNull();
    expect(view.container.querySelector('.community-tabs')).toBeNull();
    expect(view.container.querySelector('select')).toBeNull();
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
    expect(view.container.querySelector('[aria-label="글 제목"]')).toBeNull();
    expect(mocks.create).toHaveBeenCalledWith({ scope: 'board', exchange: '', market: '', symbol: '' }, '', '기존 화면에서 메시지', null, undefined);
    expect(textarea.value).toBe('');
  });
});
