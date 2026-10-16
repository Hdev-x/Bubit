import { useLayoutEffect, useRef, useState } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import type { CommunityContext } from '../../../api/server/communityApi';
import { CommunityComposer } from './CommunityComposer';
import { CommunityPostCard } from './CommunityPostCard';
import { useCommunityFeed } from './useCommunityFeed';
import './community.css';

export type CommunityPanelProps = {
  user: AuthUser | null; exchange: string; market: string; symbol: string; onLogin: () => void; active?: boolean;
};

const context: CommunityContext = { scope: 'board', exchange: '', market: '', symbol: '' };

export function CommunityPanel({ user, onLogin, active = true }: CommunityPanelProps) {
  return <section className="community-panel" aria-label="커뮤니티">
    <header className="community-header"><h3>Community</h3></header>
    {active && <CommunityFeed key={`${user?.username ?? ''}:${user?.name ?? ''}:${user?.avatarUrl ?? ''}`}
      user={user} onLogin={onLogin} />}
  </section>;
}

function CommunityFeed({ user, onLogin }: { user: AuthUser | null; onLogin: () => void }) {
  const [page, setPage] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const forceBottom = useRef(true);
  const { data, error, refresh } = useCommunityFeed({ ...context, sort: 'latest', q: '', page }, true);

  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed || !data) return;
    if (forceBottom.current || atBottom.current) {
      feed.scrollTop = feed.scrollHeight;
      atBottom.current = true;
    }
    forceBottom.current = false;
  }, [data]);

  function changePage(next: number) {
    forceBottom.current = true;
    setPage(next);
  }

  return <>
    <div className="community-feed" ref={feedRef} onScroll={event => {
      const feed = event.currentTarget;
      atBottom.current = feed.scrollHeight - feed.clientHeight - feed.scrollTop <= 40;
    }} onLoadCapture={() => {
      const feed = feedRef.current;
      if (feed && atBottom.current) feed.scrollTop = feed.scrollHeight;
    }}>
      {(page > 0 || data?.hasMore) && <nav className="community-pagination" aria-label="메시지 페이지">
        <button type="button" disabled={page === 0} onClick={() => changePage(page - 1)}>이전</button><span>{page + 1}</span>
        <button type="button" disabled={!data?.hasMore} onClick={() => changePage(page + 1)}>다음</button>
      </nav>}
      {error && <p className="community-error" role="alert">{error} <button type="button" onClick={refresh}>다시 시도</button></p>}
      {!data && !error && <div className="community-loading" role="status" aria-label="커뮤니티 불러오는 중"><span /><span /><span /></div>}
      {data?.items.length === 0 && <p className="community-empty">아직 이야기가 없습니다. 첫 메시지를 남겨보세요.</p>}
      {data && [...data.items].reverse().map(post => <CommunityPostCard key={post.id} post={post} context={context} user={user} onLogin={onLogin} onChanged={refresh} />)}
    </div>
    {user ? <CommunityComposer context={context} onSaved={() => { changePage(0); refresh(); }} />
      : <div className="community-input community-input-locked">
        <textarea className="community-textarea" aria-label="로그인 후 메시지를 입력할 수 있습니다" rows={1} readOnly tabIndex={-1} />
        <button type="button" className="community-send" aria-label="로그인하고 이야기 나누기" onClick={onLogin}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </button>
      </div>}
  </>;
}
