import { useState } from 'react';
import { createCommunityPost, editCommunityPost, type CommunityContext, type CommunityPost } from '../../../api/server/communityApi';

type Props = {
  context: CommunityContext; parentId?: number; post?: CommunityPost;
  onSaved: () => void; onCancel?: () => void;
};

export function CommunityComposer({ context, parentId, post, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [image, setImage] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const isBoard = context.scope === 'board' && parentId == null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !body.trim() || (isBoard && !title.trim())) return;
    setPending(true); setError('');
    try {
      if (post) await editCommunityPost(post.id, title, body);
      else await createCommunityPost(context, title, body, image, parentId);
      setTitle(''); setBody(''); setImage(null);
      onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다.'); }
    finally { setPending(false); }
  }

  return <form className="community-composer" onSubmit={submit}>
    {isBoard && <input aria-label="글 제목" placeholder="제목" maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={pending} />}
    <textarea aria-label={parentId ? '댓글 내용' : '글 내용'} placeholder={parentId ? '댓글을 남겨보세요' : '생각을 나눠보세요'} maxLength={2000}
      value={body} onChange={event => setBody(event.target.value)} disabled={pending} rows={post || isBoard ? 4 : 2} />
    <div className="community-compose-actions">
      {!post && <label className="community-attach">사진
        <input type="file" accept="image/png,image/jpeg" aria-label="사진 첨부 (JPG·PNG, 1MB 이하)" disabled={pending} onChange={event => {
          const file = event.target.files?.[0];
          if (file && (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 1024 * 1024)) {
            setError('JPG·PNG 이미지를 1MB 이하로 첨부해주세요.'); event.target.value = ''; return;
          }
          setImage(file ?? null); setError(''); event.target.value = '';
        }} />
      </label>}
      {image && <button type="button" className="community-attachment" onClick={() => setImage(null)} disabled={pending}>{image.name} ×</button>}
      <span className="community-char-count">{body.length}/2000</span>
      {onCancel && <button type="button" onClick={onCancel} disabled={pending}>취소</button>}
      <button type="submit" className="community-primary" disabled={pending || !body.trim() || (isBoard && !title.trim())}>{pending ? '저장 중…' : post ? '수정' : '등록'}</button>
    </div>
    {error && <p className="community-error" role="alert">{error}</p>}
  </form>;
}
