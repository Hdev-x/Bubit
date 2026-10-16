// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version } from '../../../../package.json';
import { cleanupRenderComponents, renderComponent } from '../../../test/renderComponent';
import ReleaseNotesDialog from './ReleaseNotesDialog';
import { releaseNotes } from './releaseNotes';

describe('ReleaseNotesDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });
  afterEach(cleanupRenderComponents);

  it('keeps the newest release aligned with the shipped package version', () => {
    expect(releaseNotes[0].version).toBe(version);
  });

  it('shows newest notes first with a single latest badge without requiring a user', async () => {
    const view = await renderComponent(<ReleaseNotesDialog onClose={vi.fn()} />);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(Array.from(view.container.querySelectorAll('article h3'), heading => heading.textContent))
      .toEqual(['v0.2.0', 'v0.1.0']);
    expect(view.container.querySelectorAll('.release-notes-badge')).toHaveLength(1);
    expect(view.container.querySelector('article')?.textContent).toContain('최신 버전');
    expect(view.container.querySelectorAll('time[datetime="2026-10-16"]')).toHaveLength(2);
  });

  it('supports cancel, backdrop and close while ignoring clicks inside the content', async () => {
    const onClose = vi.fn();
    const view = await renderComponent(<ReleaseNotesDialog onClose={onClose} />);
    const dialog = view.container.querySelector('dialog')!;
    const cancel = new Event('cancel', { cancelable: true });
    await act(async () => dialog.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => view.container.querySelector('h2')!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => dialog.click());
    expect(onClose).toHaveBeenCalledTimes(2);
    await act(async () => view.container.querySelector<HTMLButtonElement>('button[aria-label="업데이트 내역 닫기"]')!.click());
    expect(onClose).toHaveBeenCalledTimes(3);
    await view.unmount();
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce();
  });
});
