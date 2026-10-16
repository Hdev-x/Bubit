import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCommunity, subscribeCommunity, type CommunityPage, type CommunityQuery } from '../../../api/server/communityApi';

export function useCommunityFeed(query: CommunityQuery, active: boolean) {
  const { scope, exchange, market, symbol, sort, q, page, parentId } = query;
  const key = JSON.stringify([scope, exchange, market, symbol, sort, q, page, parentId]);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const [result, setResult] = useState<{ key: string; data: CommunityPage | null; error: string }>({ key: '', data: null, error: '' });

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let loading = false;
    let dirty = false;
    async function load() {
      if (controller.signal.aborted) return;
      if (loading) { dirty = true; return; }
      loading = true;
      try {
        const data = await fetchCommunity({ scope, exchange, market, symbol, sort, q, page, parentId }, controller.signal);
        if (!controller.signal.aborted) setResult({ key, data, error: '' });
      } catch {
        if (!controller.signal.aborted) setResult(previous => ({ key, data: previous.key === key ? previous.data : null,
          error: '커뮤니티를 불러오지 못했습니다. 다시 시도해주세요.' }));
      } finally {
        loading = false;
        // A slow request must finish before a burst of realtime events schedules one follow-up read.
        if (dirty && !controller.signal.aborted) { dirty = false; void load(); }
      }
    }
    refreshRef.current = () => { void load(); };
    void load();
    return () => { refreshRef.current = () => {}; controller.abort(); };
  }, [scope, exchange, market, symbol, sort, q, page, parentId, active, key]);

  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const close = subscribeCommunity({ scope, exchange, market, symbol }, () => {
      if (timer != null) return;
      timer = window.setTimeout(() => { timer = undefined; refresh(); }, 400);
    });
    return () => { close(); window.clearTimeout(timer); };
  }, [scope, exchange, market, symbol, active, refresh]);

  return { data: result.key === key ? result.data : null, error: result.key === key ? result.error : '', refresh };
}
