// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../test/renderComponent';
import DesktopSignup from './DesktopSignup';

const signup = vi.hoisted(() => vi.fn());
vi.mock('../../api/server/authApi', () => ({ signup }));

describe('DesktopSignup nickname', () => {
  afterEach(cleanupRenderComponents);

  it('does not substitute the private email when no nickname is entered', async () => {
    const view = await renderComponent(<DesktopSignup onSignup={vi.fn()} onBackToLogin={vi.fn()} />);
    for (const [selector, value] of [
      ['input[autocomplete="username"]', 'private@example.test'],
      ['input[placeholder="비밀번호 (4자 이상)"]', 'sample-password'],
      ['input[placeholder="비밀번호 다시 입력"]', 'sample-password'],
    ]) {
      await act(async () => {
        const input = view.container.querySelector<HTMLInputElement>(selector)!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await act(async () => view.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(signup).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('닉네임은 2~20자로 입력하세요.');
  });
});
