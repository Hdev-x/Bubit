import { authHeader, authedMutate, getToken } from '../client';

export type CommunityContext = { scope: 'feed' | 'board'; exchange: string; market: string; symbol: string };
export type CommunityPost = CommunityContext & {
  id: number; parentId: number | null; title: string; body: string;
  authorName: string; avatarUrl: string | null; owned: boolean; liked: boolean;
  likeCount: number; commentCount: number; imageId: string | null;
  createdAt: string; updatedAt: string;
};
export type CommunityPage = { items: CommunityPost[]; hasMore: boolean };
export type CommunityQuery = CommunityContext & { sort: 'latest' | 'popular'; q: string; page: number; parentId?: number };

export async function fetchCommunity(query: CommunityQuery, signal: AbortSignal): Promise<CommunityPage> {
  const params = new URLSearchParams({ scope: query.scope, exchange: query.exchange, market: query.market,
    symbol: query.symbol, sort: query.sort, q: query.q, page: String(query.page) });
  const path = query.parentId == null ? '/api/community/posts' : `/api/community/posts/${query.parentId}/comments`;
  const response = await fetch(`${path}?${params}`, { headers: authHeader(), signal });
  if (!response.ok) throw new Error('커뮤니티를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  return response.json() as Promise<CommunityPage>;
}

export async function createCommunityPost(context: CommunityContext, title: string, body: string, image: File | null, parentId?: number): Promise<void> {
  const data = new FormData();
  Object.entries({ ...context, title, body }).forEach(([key, value]) => data.append(key, value));
  if (image) data.append('image', image);
  if (parentId != null) data.append('parentId', String(parentId));
  const response = await fetch('/api/community/posts', { method: 'POST', headers: authHeader(), body: data });
  if (!response.ok) throw new Error(response.status === 413 ? '이미지는 1MB 이하로 첨부해주세요.' : '글을 저장하지 못했습니다. 로그인 상태와 내용을 확인해주세요.');
}

export async function editCommunityPost(id: number, title: string, body: string): Promise<void> {
  await authedMutate(`/api/community/posts/${id}`, 'PUT', { title, body });
}
export async function deleteCommunityPost(id: number): Promise<void> {
  await authedMutate(`/api/community/posts/${id}`, 'DELETE');
}
export async function likeCommunityPost(id: number, liked: boolean): Promise<void> {
  await authedMutate(`/api/community/posts/${id}/like`, liked ? 'POST' : 'DELETE');
}

const subscriptions = new Map<string, { listeners: Set<() => void>; close: () => void }>();

export function subscribeCommunity(context: CommunityContext, changed: () => void): () => void {
  const topic = context.scope === 'board' ? '/topic/community/board'
    : `/topic/community/feed/${context.exchange}/${context.market}/${context.symbol.toUpperCase()}`;
  let subscription = subscriptions.get(topic);
  if (!subscription) {
    const listeners = new Set<() => void>();
    subscription = { listeners, close: connectCommunity(topic, () => listeners.forEach(listener => listener())) };
    subscriptions.set(topic, subscription);
  }
  subscription.listeners.add(changed);
  return () => {
    subscription.listeners.delete(changed);
    if (!subscription.listeners.size) { subscription.close(); subscriptions.delete(topic); }
  };
}

function connectCommunity(topic: string, changed: () => void): () => void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? `${location.hostname}:8081` : location.host;
  let socket: WebSocket | null = null;
  let stopped = false;
  let retries = 0;
  let reconnect: number | undefined;
  let heartbeat: number | undefined;
  let connectTimeout: number | undefined;

  function connect() {
    if (stopped) return;
    const current = new WebSocket(`${protocol}//${host}/ws-coin`, ['v12.stomp']);
    socket = current;
    let buffer = '';
    connectTimeout = window.setTimeout(() => current.close(), 10000);
    current.onopen = () => {
      const token = getToken();
      const authorization = token && !/[\r\n\0]/.test(token) ? `Authorization:Bearer ${token}\n` : '';
      current.send(`CONNECT\naccept-version:1.2\nheart-beat:20000,0\n${authorization}\n\0`);
    };
    current.onmessage = (event) => {
      if (stopped || current !== socket || typeof event.data !== 'string') return;
      buffer += event.data;
      if (buffer.length > 65536) { current.close(); return; }
      let end: number;
      while ((end = buffer.indexOf('\0')) >= 0) {
        const frame = buffer.slice(0, end).trimStart();
        buffer = buffer.slice(end + 1);
        if (frame.startsWith('CONNECTED\n') || frame.startsWith('CONNECTED\r\n')) {
          window.clearTimeout(connectTimeout);
          retries = 0;
          current.send(`SUBSCRIBE\nid:community\ndestination:${topic}\n\n\0`);
          heartbeat = window.setInterval(() => { if (current.readyState === WebSocket.OPEN) current.send('\n'); }, 20000);
          changed(); // Reconcile changes missed while disconnected.
        } else if (frame.startsWith('MESSAGE\n') || frame.startsWith('MESSAGE\r\n')) changed();
        else if (frame.startsWith('ERROR\n') || frame.startsWith('ERROR\r\n')) current.close();
      }
      if (!buffer.trim()) buffer = '';
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      window.clearTimeout(connectTimeout);
      window.clearInterval(heartbeat);
      if (!stopped) reconnect = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(retries++, 5)));
    };
  }
  connect();
  return () => {
    stopped = true;
    window.clearTimeout(reconnect);
    window.clearTimeout(connectTimeout);
    window.clearInterval(heartbeat);
    if (socket?.readyState === WebSocket.OPEN) socket.send('DISCONNECT\n\n\0');
    socket?.close();
  };
}
