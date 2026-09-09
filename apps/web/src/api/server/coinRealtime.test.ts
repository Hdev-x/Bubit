// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly protocols: string | string[] | undefined;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = String(url);
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.onopen?.();
  }

  message(frame: string) {
    this.onmessage?.({ data: `${frame}\0` } as MessageEvent);
  }

  serverClose() {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('coinRealtime STOMP authentication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
      clear: () => stored.clear(),
    });
    FakeWebSocket.instances = [];
    vi.resetModules();
  });

  afterEach(async () => {
    const { clearToken } = await import('../client');
    clearToken();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    ['ticker', async () => (await import('./coinRealtime')).subscribeBitgetSpotTickers(['BTCUSDT'], () => {})],
    ['binance kline', async () => (await import('./coinRealtime')).subscribeBinanceKline('BTCUSDT', false, '1h', () => {})],
    ['coin candle', async () => (await import('./coinRealtime')).subscribeCoinCandle('BTCUSDT', 'ticker', () => {})],
  ])('%s flow uses a token-free URL and subscribes only after authenticated CONNECT', async (_name, subscribe) => {
    const { setToken } = await import('../client');
    setToken('first.dummy.token');
    const subscription = await subscribe();
    const socket = FakeWebSocket.instances[0];

    expect(socket.url).toMatch(/^ws:\/\/.*\/ws-coin$/);
    expect(socket.url).not.toContain('?');
    socket.open();
    expect(socket.sent[0]).toContain('Authorization:Bearer first.dummy.token\n');
    expect(socket.sent.some(frame => frame.startsWith('SUBSCRIBE'))).toBe(false);

    socket.message('CONNECTED\nversion:1.2\n\n');
    expect(socket.sent.some(frame => frame.startsWith('SUBSCRIBE'))).toBe(true);
    subscription.close();
  });

  it('uses the production origin without a query string', async () => {
    vi.stubEnv('DEV', false);
    const { setToken } = await import('../client');
    setToken('production.dummy.token');
    const { subscribeBitgetSpotTickers } = await import('./coinRealtime');

    const subscription = subscribeBitgetSpotTickers(['BTCUSDT'], () => {});
    expect(FakeWebSocket.instances[0].url).toBe(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws-coin`);
    subscription.close();
  });

  it.each([
    ['ticker', async () => (await import('./coinRealtime')).subscribeBitgetSpotTickers(['BTCUSDT'], () => {})],
    ['binance kline', async () => (await import('./coinRealtime')).subscribeBinanceKline('BTCUSDT', false, '1h', () => {})],
    ['coin candle', async () => (await import('./coinRealtime')).subscribeCoinCandle('BTCUSDT', 'ticker', () => {})],
  ])('%s flow reads the latest token on reconnect and close cancels reconnect and heartbeat work', async (_name, subscribe) => {
    const client = await import('../client');
    client.setToken('old.dummy.token');
    const subscription = await subscribe();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.message('CONNECTED\nversion:1.2\n\n');

    client.setToken('new.dummy.token');
    first.serverClose();
    await vi.advanceTimersByTimeAsync(2000);
    const second = FakeWebSocket.instances[1];
    second.open();
    expect(second.sent[0]).toContain('Authorization:Bearer new.dummy.token\n');
    expect(second.sent[0]).not.toContain('old.dummy.token');

    second.message('CONNECTED\nversion:1.2\n\n');
    subscription.close();
    expect(second.sent.some(frame => frame.startsWith('UNSUBSCRIBE'))).toBe(true);
    expect(second.sent.some(frame => frame.startsWith('DISCONNECT'))).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('omits Authorization when the stored token could inject a STOMP header or frame', async () => {
    const { setToken } = await import('../client');
    setToken('dummy\nInjected:value');
    const { subscribeBitgetSpotTickers } = await import('./coinRealtime');
    const subscription = subscribeBitgetSpotTickers(['BTCUSDT'], () => {});
    const socket = FakeWebSocket.instances[0];

    socket.open();
    expect(socket.sent[0]).not.toContain('Authorization:');
    expect(socket.sent[0]).not.toContain('Injected:');
    subscription.close();
  });
});
