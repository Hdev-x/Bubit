import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { activateApiKey, deleteApiKey, fetchApiKeys, saveApiKey, type ApiKeyItem } from '../../../api/server/apiKeysApi';
import { fetchMe } from '../../../api/server/authApi';
import { SUB_ACCOUNT_NAMES } from '../../../config/accountTargets';
import { errorMessage } from '../../../shared/utils/guards';
import './ApiKeyManager.css';

const emptyForm = { apiKey: '', secretKey: '', passphrase: '', label: '', botTarget: 'MAIN' };

export default function ApiKeyManager({ role }: { role?: string } = {}) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loadedRole, setLoadedRole] = useState<string>();
  const isAdmin = (role ?? loadedRole) === 'ADMIN';
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const targetId = useId();

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const list = await fetchApiKeys();
      if (mounted.current && id === requestId.current) setKeys(list);
    } catch (cause) {
      if (mounted.current && id === requestId.current) setError(errorMessage(cause, 'API 키 조회에 실패했습니다.'));
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const id = ++requestId.current;
    fetchApiKeys()
      .then(list => { if (!cancelled && id === requestId.current) setKeys(list); })
      .catch(cause => { if (!cancelled && id === requestId.current) setError(errorMessage(cause, 'API 키 조회에 실패했습니다.')); })
      .finally(() => { if (!cancelled && id === requestId.current) setLoading(false); });
    if (!role) void fetchMe().then(user => { if (!cancelled) setLoadedRole(user?.role); });
    return () => { cancelled = true; mounted.current = false; };
  }, [role]);

  async function mutate(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      if (mounted.current) await load();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause, 'API 키 처리에 실패했습니다.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (![form.apiKey, form.secretKey, form.passphrase].every(value => value.trim())) {
      setError('API Key, Secret Key, Passphrase를 입력하세요.');
      return;
    }
    void mutate(async () => {
      await saveApiKey({ ...form, exchange: 'BITGET' });
      if (mounted.current) { setForm(emptyForm); setShowForm(false); }
    });
  }

  return (
    <section className="account-keys" aria-label="Bitget API 관리">
      <div className="account-keys-heading">
        <div><h3>Bitget API</h3><p>현재 Bitget 계정 연결을 지원합니다.</p></div>
        <button type="button" disabled={busy} onClick={() => { setShowForm(!showForm); setForm(emptyForm); setError(''); }}>
          {showForm ? '취소' : '+ 키 추가'}
        </button>
      </div>
      {error && <p className="account-error" role="alert">{error}</p>}
      {showForm && (
        <form className="account-keys-form" onSubmit={submit}>
          <InputField label="API Key" value={form.apiKey} disabled={busy} onChange={apiKey => setForm(current => ({ ...current, apiKey }))} />
          <InputField label="Secret Key" value={form.secretKey} disabled={busy} onChange={secretKey => setForm(current => ({ ...current, secretKey }))} />
          <InputField label="Passphrase" value={form.passphrase} disabled={busy} onChange={passphrase => setForm(current => ({ ...current, passphrase }))} />
          <InputField label="라벨 (선택)" type="text" value={form.label} disabled={busy} onChange={label => setForm(current => ({ ...current, label }))} />
          {isAdmin && <label htmlFor={targetId}>봇 슬롯
            <select id={targetId} value={form.botTarget} disabled={busy} onChange={event => setForm(current => ({ ...current, botTarget: event.target.value }))}>
              <option value="MAIN">Main 계정</option>
              {Object.entries(SUB_ACCOUNT_NAMES).map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}
            </select>
          </label>}
          <button className="account-primary" type="submit" disabled={busy}>{busy ? '저장 중…' : 'API 키 저장'}</button>
        </form>
      )}
      {loading ? <p className="account-muted" role="status">불러오는 중…</p>
        : keys.length === 0 ? <p className="account-muted">등록된 API 키가 없습니다.</p>
          : <ul className="account-keys-list">{keys.map(key => (
            <li key={key.id}>
              <div className="account-key-info"><strong>{key.label || key.exchange}</strong>
                <code>{key.maskedApiKey}</code>
                <span>{key.botTarget === 'MAIN' ? 'Main' : SUB_ACCOUNT_NAMES[key.botTarget] || key.botTarget}
                  {key.exchange !== 'BITGET' ? ' · 현재 연결 미지원' : key.active ? ' · 사용 중' : ''}</span>
              </div>
              <div className="account-key-actions">
                {key.exchange === 'BITGET' && !key.active && <button type="button" disabled={busy} onClick={() => void mutate(() => activateApiKey(key.id))}>활성화</button>}
                <button type="button" disabled={busy} onClick={() => { if (confirm('이 API 키를 삭제하시겠습니까?')) void mutate(() => deleteApiKey(key.id)); }}>삭제</button>
              </div>
            </li>
          ))}</ul>}
    </section>
  );
}

function InputField({ label, value, onChange, disabled, type = 'password' }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean; type?: 'password' | 'text';
}) {
  const id = useId();
  return <label htmlFor={id}>{label}<input id={id} type={type} value={value} disabled={disabled}
    autoComplete="off" maxLength={512} onChange={event => onChange(event.target.value)} /></label>;
}
