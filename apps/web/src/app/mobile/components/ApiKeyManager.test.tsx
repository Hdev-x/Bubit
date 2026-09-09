// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import ApiKeyManager from './ApiKeyManager';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((ok, fail) => { resolve = ok; reject = fail; }), resolve, reject };
};

const api = vi.hoisted(() => ({ fetchApiKeys: vi.fn(), fetchMe: vi.fn() }));
vi.mock('../../../api/server/apiKeysApi', () => ({ ...api, saveApiKey: vi.fn(), activateApiKey: vi.fn(), deleteApiKey: vi.fn() }));
vi.mock('../../../api/server/authApi', () => ({ fetchMe: api.fetchMe }));

describe('ApiKeyManager mount query', () => {
  beforeEach(() => { api.fetchApiKeys.mockReset(); api.fetchMe.mockReset().mockResolvedValue({ role: 'USER' }); });
  afterEach(async () => { await cleanupRenderComponents(); });

  it('공개 Beta 키 등록은 지원되는 Bitget 계좌만 선택할 수 있다', async () => {
    api.fetchApiKeys.mockResolvedValue([]);
    const view = await renderComponent(<ApiKeyManager />);
    const addButton = Array.from(view.container.querySelectorAll('button'))
      .find(button => button.textContent === '+ 키 추가')!;
    await act(async () => addButton.click());
    const form = view.container.querySelector('form')!;
    expect(form).not.toBeNull();
    const choices = Array.from(form.querySelectorAll('button[type="button"]'))
      .map(button => button.textContent);
    expect(choices).toEqual(['Bitget']);
    expect(form.textContent).toContain('Passphrase');
    expect(form.textContent).toContain('Beta 계좌 연동은 Bitget만 지원');
  });

  it('초기 조회가 완료되면 key 목록을 표시한다', async () => {
    const request = deferred<Array<{ id: number; exchange: string; botTarget: string; maskedApiKey: string; label: string; active: boolean; createdAt: string }>>();
    api.fetchApiKeys.mockReturnValue(request.promise);
    const view = await renderComponent(<ApiKeyManager />);
    expect(view.container.textContent).toContain('불러오는 중');
    await act(async () => request.resolve([{ id: 1, exchange: 'BITGET', botTarget: 'MAIN', maskedApiKey: 'abc***', label: 'main', active: true, createdAt: 'today' }]));
    expect(view.container.textContent).toContain('abc***');
  });

  it('unmount 뒤 늦은 응답을 무시한다', async () => {
    const request = deferred<[]>();
    api.fetchApiKeys.mockReturnValue(request.promise);
    const view = await renderComponent(<ApiKeyManager />);
    await view.unmount();
    await act(async () => request.resolve([]));
    expect(view.container.textContent).toBe('');
  });

  it('초기 조회 실패를 표시하고 loading을 끝낸다', async () => {
    api.fetchApiKeys.mockRejectedValue(new Error('조회 실패'));
    const view = await renderComponent(<ApiKeyManager />);
    await act(async () => {});
    expect(view.container.textContent).toContain('조회 실패');
    expect(view.container.textContent).not.toContain('불러오는 중');
  });
});
