// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeCommunity } from './communityApi';

vi.mock('../client', () => ({ getToken: () => null, authHeader: () => ({}), authedMutate: vi.fn() }));

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  constructor() { FakeSocket.instances.push(this); }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); FakeSocket.instances = []; });

describe('community subscription', () => {
  it('shares a socket between posts and replies and stops retries after the last listener closes', () => {
    vi.useFakeTimers(); vi.stubGlobal('WebSocket', FakeSocket);
    const context = { scope: 'feed' as const, exchange: 'bitget', market: 'spot', symbol: 'BTCUSDT' };
    const first = vi.fn(); const second = vi.fn();
    const closeFirst = subscribeCommunity(context, first);
    const closeSecond = subscribeCommunity(context, second);
    expect(FakeSocket.instances).toHaveLength(1);
    const socket = FakeSocket.instances[0]; socket.onopen?.();
    socket.onmessage?.({ data: 'CONNECTED\nversion:1.2\n\n\0' });
    expect(socket.send).toHaveBeenCalledWith('SUBSCRIBE\nid:community\ndestination:/topic/community/feed/bitget/spot/BTCUSDT\n\n\0');
    expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
    closeFirst(); expect(socket.close).not.toHaveBeenCalled();
    socket.onmessage?.({ data: 'MESSAGE\n\n{"changed":true}\0' });
    expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledTimes(2);
    closeSecond(); vi.advanceTimersByTime(60000);
    expect(socket.close).toHaveBeenCalledOnce(); expect(FakeSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
