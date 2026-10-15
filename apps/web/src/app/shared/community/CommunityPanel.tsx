import { useState } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import type { CommunityContext } from '../../../api/server/communityApi';
import { CommunityComposer } from './CommunityComposer';
import { CommunityPostCard } from './CommunityPostCard';
import { useCommunityFeed } from './useCommunityFeed';
import './community.css';

export type CommunityPanelProps = {
  user: AuthUser | null; exchange: string; market: string; symbol: string; onLogin: () => void; active?: boolean;
};

export function CommunityPanel({ user, exchange, market, symbol, onLogin, active = true }: CommunityPanelProps) {
  const [scope, setScope] = useState<'feed' | 'board'>('feed');
  const context: CommunityContext = scope === 'feed' ? { scope, exchange, market, symbol } : { scope, exchange: '', market: '', symbol: '' };
  return <section className="community-panel" aria-label="커뮤니티">
    <header className="community-header"><h3>커뮤니티</h3><span>{scope === 'feed' ? symbol : '함께 나누는 이야기'}</span></header>
    <div className="community-tabs" role="group" aria-label="커뮤니티 종류">
      <button type="button" aria-pressed={scope === 'feed'} onClick={() => setScope('feed')}>종목 이야기</button>
      <button type="button" aria-pressed={scope === 'board'} onClick={() => setScope('board')}>자유게시판</button>
    </div>
    {active && <CommunityFeed key={`${scope}:${context.exchange}:${context.market}:${context.symbol}:${user?.username ?? ''}:${user?.name ?? ''}:${user?.avatarUrl ?? ''}`}
      context={context} user={user} onLogin={onLogin} />}
  </section>;
}

function CommunityFeed({ context, user, onLogin }: { context: CommunityContext; user: AuthUser | null; onLogin: () => void }) {
  const [sort, setSort] = useState<'latest' | 'popular'>('latest');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const { data, error, refresh } = useCommunityFeed({ ...context, sort, q: query, page }, true);
  return <>
    <form className="community-search" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(0); }}>
      <input aria-label="커뮤니티 검색" placeholder="글 · 작성자 검색" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} />
      <button type="submit">검색</button>
      <select aria-label="글 정렬" value={sort} onChange={event => { setSort(event.target.value as 'latest' | 'popular'); setPage(0); }}>
        <option value="latest">최신순</option><option value="popular">인기순</option>
      </select>
    </form>
    <div className="community-feed">
      {error && <p className="community-error" role="alert">{error} <button type="button" onClick={refresh}>다시 시도</button></p>}
      {!data && !error && <div className="community-loading" role="status" aria-label="커뮤니티 불러오는 중"><span /><span /><span /></div>}
      {data?.items.length === 0 && <p className="community-empty">{query ? '검색 결과가 없습니다.' : '아직 이야기가 없습니다. 첫 글을 남겨보세요.'}</p>}
      {data?.items.map(post => <CommunityPostCard key={post.id} post={post} context={context} user={user} onLogin={onLogin} onChanged={refresh} />)}
      {(page > 0 || data?.hasMore) && <nav className="community-pagination" aria-label="게시글 페이지">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button><span>{page + 1}</span>
        <button type="button" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>다음</button>
      </nav>}
    </div>
    {user ? <CommunityComposer context={context} onSaved={() => { setPage(0); refresh(); }} />
      : <button type="button" className="community-login" onClick={onLogin}>로그인하고 이야기 나누기</button>}
  </>;
}
