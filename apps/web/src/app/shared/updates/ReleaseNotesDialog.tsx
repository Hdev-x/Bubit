import { useId, useLayoutEffect, useRef } from 'react';
import { releaseNotes } from './releaseNotes';
import '../account/MyPageDialog.css';
import './ReleaseNotesDialog.css';

export default function ReleaseNotesDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="mypage-dialog release-notes-dialog" aria-labelledby={headingId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mypage-content">
        <header className="mypage-heading">
          <h2 id={headingId}>업데이트 내역</h2>
          <button type="button" className="mypage-close" aria-label="업데이트 내역 닫기" onClick={onClose}>×</button>
        </header>
        <div className="release-notes-body">
          {releaseNotes.map((release, index) => (
            <article key={release.version} className="release-notes-entry" aria-label={`v${release.version}`}>
              <div className="release-notes-meta">
                <h3>v{release.version}</h3>
                {index === 0 && <span className="release-notes-badge">최신 버전</span>}
                <time dateTime={release.date}>{release.date.replaceAll('-', '.')}</time>
              </div>
              <h4>{release.title}</h4>
              <ul>{release.changes.map(change => <li key={change}>{change}</li>)}</ul>
            </article>
          ))}
        </div>
      </div>
    </dialog>
  );
}
