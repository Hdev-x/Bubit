import { useEffect, useLayoutEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import { updateProfile, uploadAvatar } from '../../../api/server/profileApi';
import { errorMessage } from '../../../shared/utils/guards';
import ApiKeyManager from './ApiKeyManager';
import { PaperTradingSettings } from '../paper/PaperTradingSettings';
import './MyPageDialog.css';

export type SettingsSection = 'profile' | 'api' | 'paper';

const sections: { id: SettingsSection; title: string; description: string }[] = [
  { id: 'profile', title: '프로필', description: '프로필 사진과 닉네임을 설정합니다.' },
  { id: 'api', title: 'Bitget API', description: 'Bitget 계정의 API 키를 관리합니다.' },
  { id: 'paper', title: '모의투자', description: '모의계좌 잔고와 초기화 설정을 관리합니다.' },
];

export default function MyPageDialog({ user, onClose, onUserChange, initialSection = 'profile' }: {
  user: AuthUser;
  onClose: () => void;
  onUserChange: (user: AuthUser) => void;
  initialSection?: SettingsSection;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [name, setName] = useState(user.name || '');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const headingId = useId();
  const nameId = useId();
  const sectionId = useId();
  const activeSection = sections.find(item => item.id === section)!;

  useLayoutEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { mounted.current = false; element?.close(); };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setError('');
    setNotice('');
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 1024 * 1024) {
      setError('JPG 또는 PNG 사진을 1MB 이하로 선택하세요.');
      return;
    }
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const { avatarUrl } = await uploadAvatar(file);
      if (mounted.current) { onUserChange({ ...user, avatarUrl }); setNotice('프로필 사진을 저장했습니다.'); }
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause, '사진을 저장하지 못했습니다.'));
    } finally {
      if (mounted.current) { setBusy(false); setPreview(null); }
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const value = name.trim();
    if (Array.from(value).length < 2 || Array.from(value).length > 20 || Array.from(value).some(char => { const code = char.codePointAt(0)!; return code < 32 || (code >= 127 && code <= 159); })) {
      setError('닉네임은 2~20자로 입력하세요.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const profile = await updateProfile(value);
      if (mounted.current) {
        onUserChange({ ...user, name: profile.name });
        setName(profile.name);
        setNotice('닉네임을 저장했습니다.');
      }
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause, '닉네임을 저장하지 못했습니다.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="mypage-dialog" aria-labelledby={headingId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mypage-content">
        <header className="mypage-heading">
          <h2 id={headingId}>설정</h2>
          <button type="button" className="mypage-close" aria-label="설정 닫기" onClick={onClose}>×</button>
        </header>
        <div className="mypage-layout">
          <nav className="mypage-navigation" aria-label="설정 메뉴">
            {sections.map(item => (
              <button key={item.id} type="button" aria-current={section === item.id ? 'page' : undefined}
                onClick={() => setSection(item.id)}>
                {item.title}<span aria-hidden="true">›</span>
              </button>
            ))}
          </nav>
          <section className="mypage-detail" aria-labelledby={sectionId}>
            <div className="mypage-section-heading">
              <h3 id={sectionId}>{activeSection.title}</h3>
              <p>{activeSection.description}</p>
            </div>
            {section === 'profile' && (
              <div className="mypage-profile">
                <div className="mypage-identity">
                  <button type="button" className="mypage-avatar" aria-label="프로필 사진 변경" disabled={busy}
                    onClick={() => fileInput.current?.click()}>
                    {preview || user.avatarUrl ? <img src={preview || user.avatarUrl || ''} alt="프로필" /> : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 3-8 8-8s8 3 8 8" />
                      </svg>
                    )}
                    <span>{busy && preview ? '저장 중' : '변경'}</span>
                  </button>
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png" aria-label="프로필 사진 파일"
                    className="mypage-file" onChange={changePhoto} />
                  <div>
                    <strong>{user.name || '닉네임을 설정해주세요'}</strong>
                    <p>JPG·PNG, 최대 1MB</p>
                  </div>
                </div>
                <form className="mypage-name-form" onSubmit={saveName}>
                  <label htmlFor={nameId}>닉네임</label>
                  <div>
                    <input id={nameId} value={name} disabled={busy} autoComplete="nickname" placeholder="2~20자"
                      onChange={event => setName(event.target.value)} />
                    <button type="submit" disabled={busy || name.trim() === user.name}>
                      {busy && !preview ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </form>
                {error && <p className="account-error" role="alert">{error}</p>}
                {notice && <p className="mypage-notice" role="status">{notice}</p>}
              </div>
            )}
            {section === 'api' && <ApiKeyManager role={user.role} />}
            {section === 'paper' && <PaperTradingSettings user={user} />}
          </section>
        </div>
      </div>
    </dialog>
  );
}
