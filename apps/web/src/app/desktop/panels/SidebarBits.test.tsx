// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import { HeaderLogo } from './SidebarBits';

afterEach(cleanupRenderComponents);

describe('HeaderLogo', () => {
  it('실패 뒤 URL이 바뀌면 새 이미지를 다시 표시한다', async () => {
    const view = await renderComponent(<HeaderLogo base="XZZ" logoUrl="old.png" />);
    const image = () => view.container.querySelector('img') as HTMLImageElement | null;

    await act(async () => image()?.dispatchEvent(new Event('error')));
    expect(view.container.querySelector('.sh-coin-logo-fallback')?.textContent).toBe('XZ');

    await view.rerender(<HeaderLogo base="YZZ" logoUrl="new.png" />);
    expect(image()?.src).toContain('new.png');
  });
});
