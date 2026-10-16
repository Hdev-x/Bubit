import { useState } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import { deleteCommunityPost, likeCommunityPost, type CommunityContext, type CommunityPost } from '../../../api/server/communityApi';
import { CommunityComposer } from './CommunityComposer';
import { useCommunityFeed } from './useCommunityFeed';

type Props = { post: CommunityPost; context: CommunityContext; user: AuthUser | null; onLogin: () => void; onChanged: () => void };

export function CommunityPostCard({ post, context, user, onLogin, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function mutate(action: () => Promise<void>) {
    if (!user) { onLogin(); return; }
    if (pending) return;
    setPending(true); setError('');
    try { await action(); onChanged(); }
    catch { setError('변경하지 못했습니다. 다시 시도해주세요.'); }
    finally { setPending(false); }
  }

  return <article className="community-post">
    {post.avatarUrl ? <img src={post.avatarUrl} alt="" className="community-avatar" loading="lazy" /> : <span className="community-avatar">{post.authorName.slice(0, 1).toUpperCase()}</span>}
    <div className="community-bubble">
      <header className="community-post-author">
        <strong>{post.authorName}</strong>
        <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</time>
        <button type="button" className="community-post-more" aria-label="메시지 메뉴" aria-expanded={showActions} onClick={() => setShowActions(!showActions)}>···</button>
      </header>
      {showActions && <div className="community-post-actions">
        <button type="button" aria-pressed={post.liked} disabled={pending} onClick={() => void mutate(() => likeCommunityPost(post.id, !post.liked))}>♡ {post.likeCount}</button>
        {post.parentId == null && <button type="button" aria-expanded={showComments} onClick={() => setShowComments(!showComments)}>댓글 {post.commentCount}</button>}
        {post.owned && user && <>
          <button type="button" onClick={() => setEditing(!editing)} disabled={pending}>수정</button>
          <button type="button" onClick={() => setConfirmDelete(!confirmDelete)} disabled={pending}>삭제</button>
        </>}
      </div>}
      {editing ? <CommunityComposer context={context} parentId={post.parentId ?? undefined} post={post}
        onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} /> : <>
        {post.title && <h4>{post.title}</h4>}
        <p className="community-post-body">{post.body}</p>
        {post.imageId && <a href={`/api/community/images/${post.imageId}`} target="_blank" rel="noreferrer"><img className="community-post-image"
          src={`/api/community/images/${post.imageId}`} alt="게시글 첨부 이미지" loading="lazy" /></a>}
      </>}
      {confirmDelete && <div className="community-delete-confirm">이 글을 삭제할까요?
        <button type="button" disabled={pending} onClick={() => void mutate(() => deleteCommunityPost(post.id))}>삭제</button>
        <button type="button" disabled={pending} onClick={() => setConfirmDelete(false)}>취소</button>
      </div>}
      {!showActions && (post.likeCount > 0 || post.commentCount > 0) && <button type="button" className="community-post-summary" aria-label="반응과 댓글 보기" onClick={() => setShowActions(true)}>♡ {post.likeCount} · 댓글 {post.commentCount}</button>}
      {error && <p className="community-error" role="alert">{error}</p>}
      {showComments && <CommunityComments parent={post} context={context} user={user} onLogin={onLogin} onChanged={onChanged} />}
    </div>
  </article>;
}

function CommunityComments({ parent, context, user, onLogin, onChanged }: Omit<Props, 'post'> & { parent: CommunityPost }) {
  const [page, setPage] = useState(0);
  const { data, error, refresh } = useCommunityFeed({ ...context, sort: 'latest', q: '', page, parentId: parent.id }, true);
  function changed() { refresh(); onChanged(); }
  return <section className="community-comments" aria-label="댓글">
    {error && <p className="community-error" role="alert">{error} <button type="button" onClick={refresh}>다시 시도</button></p>}
    {!data && !error && <p className="community-empty" role="status">댓글을 불러오는 중…</p>}
    {data?.items.map(post => <CommunityPostCard key={post.id} post={post} context={context} user={user} onLogin={onLogin} onChanged={changed} />)}
    {data?.items.length === 0 && <p className="community-empty">첫 댓글을 남겨보세요.</p>}
    {(page > 0 || data?.hasMore) && <nav className="community-pagination" aria-label="댓글 페이지">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button><span>{page + 1}</span>
      <button type="button" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>다음</button>
    </nav>}
    {user ? <CommunityComposer context={context} parentId={parent.id} onSaved={changed} /> : <button type="button" className="community-login" onClick={onLogin}>로그인하고 댓글 쓰기</button>}
  </section>;
}
