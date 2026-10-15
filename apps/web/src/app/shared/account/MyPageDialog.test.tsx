// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import MyPageDialog from './MyPageDialog';

const api = vi.hoisted(() => ({ updateProfile: vi.fn(), uploadAvatar: vi.fn() }));
vi.mock('../../../api/server/profileApi', () => api);
vi.mock('./ApiKeyManager', () => ({ default: () => <div>Bitget API 관리</div> }));
const user = { username: 'owner@example.test', name: '기존 이름', role: 'USER', avatarUrl: '/api/profiles/avatars/old-id' };

async function typeName(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>('input[autocomplete="nickname"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('MyPageDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });
  afterEach(cleanupRenderComponents);

  it('saves a nickname and updates the parent profile without losing its avatar', async () => {
    api.updateProfile.mockResolvedValue({ name: '새 이름' });
    const onUserChange = vi.fn();
    const view = await renderComponent(<MyPageDialog user={user} onClose={vi.fn()} onUserChange={onUserChange} />);
    expect(view.container.textContent).toContain('Bitget API 관리');
    await typeName(view.container, ' 새 이름 ');
    await act(async () => view.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(api.updateProfile).toHaveBeenCalledWith('새 이름');
    expect(onUserChange).toHaveBeenCalledWith({ ...user, name: '새 이름' });
    expect(view.container.textContent).toContain('닉네임을 저장했습니다.');
  });

  it('rejects invalid nicknames without making a request', async () => {
    const view = await renderComponent(<MyPageDialog user={user} onClose={vi.fn()} onUserChange={vi.fn()} />);
    await typeName(view.container, 'a');
    await act(async () => view.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('2~20자');
  });

  it('does not update a logged-out parent when an upload finishes after unmount', async () => {
    let resolve!: (value: { avatarUrl: string }) => void;
    api.uploadAvatar.mockReturnValue(new Promise(done => { resolve = done; }));
    URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
    URL.revokeObjectURL = vi.fn();
    const onUserChange = vi.fn();
    const view = await renderComponent(<MyPageDialog user={user} onClose={vi.fn()} onUserChange={onUserChange} />);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['photo'], 'photo.png', { type: 'image/png' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await view.unmount();
    await act(async () => resolve({ avatarUrl: '/api/profiles/avatars/new-id' }));
    expect(onUserChange).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});
