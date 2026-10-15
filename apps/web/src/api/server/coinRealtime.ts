export type CandleMessage = {
  ts?: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Subscription = {
  close: () => void;
};

export type RealtimeTicker = {
  symbol: string;
  price: number;
  change?: number;
  changeRate?: number;
  volume?: number;
  ts?: number; // 거래소 이벤트 시각(ms) — 캔들 버킷팅을 클라 시계 대신 서버 시각으로
};

const tickerListeners = new Map<string, Set<(ticker: RealtimeTicker) => void>>();
const latestTickers = new Map<string, { ticker: RealtimeTicker; receivedAt: number }>();

// 차트는 기존 현재가 연결의 값만 듣고 별도 WebSocket을 열지 않는다.
export function listenRealtimeTicker(topic: string, onTicker: (ticker: RealtimeTicker) => void): Subscription {
  const listeners = tickerListeners.get(topic) ?? new Set<(ticker: RealtimeTicker) => void>();
  listeners.add(onTicker);
  tickerListeners.set(topic, listeners);
  const latest = latestTickers.get(topic);
  if (latest && Date.now() - latest.receivedAt <= 5_000) onTicker(latest.ticker);
  return { close: () => {
    listeners.delete(onTicker);
    if (!listeners.size) { tickerListeners.delete(topic); latestTickers.delete(topic); }
  } };
}

// 동일 시장의 헤더·차트·목록은 먼저 도착한 최신 이벤트를 함께 사용한다.
export function publishRealtimeTicker(topic: string, ticker: RealtimeTicker): void {
  if (!Number.isFinite(ticker.price) || ticker.price <= 0) return;
  const previous = latestTickers.get(topic)?.ticker;
  if (ticker.ts != null && (!Number.isFinite(ticker.ts) || (previous?.ts != null && ticker.ts < previous.ts))) return;
  if (ticker.ts === previous?.ts && ticker.price === previous?.price) return;
  const open = previous?.change == null ? null : previous.price - previous.change;
  const next = { ...previous, ...ticker };
  if (ticker.change == null && open != null && open > 0) {
    next.change = ticker.price - open;
    next.changeRate = next.change / open;
  }
  if (tickerListeners.has(topic)) {
    latestTickers.set(topic, { ticker: next, receivedAt: Date.now() });
    tickerListeners.get(topic)?.forEach(listener => listener(next));
  }
}

function getWebSocketUrl() {
  // vite dev 모드면 포트(5173/5174/5175 등) 무관하게 8081로 직접 연결 (프록시 ws 업그레이드 우회)
  const isViteDev = import.meta.env.DEV;

  if (isViteDev) {
    return `ws://${window.location.hostname}:8081/ws-coin`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws-coin`;
}

function getConnectFrame() {
  const token = getToken();
  const authorization = token && !/[\r\n\0]/.test(token) ? `Authorization:Bearer ${token}\n` : '';
  return `CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n${authorization}\n`;
}

function parseStompFrames(raw: string) {
  return raw
    .split('\0')
    .map((frame) => frame.trim())
    .filter(Boolean);
}

function getFrameCommand(frame: string) {
  return frame.split('\n', 1)[0];
}

function getFrameBody(frame: string) {
  const separatorIndex = frame.indexOf('\n\n');
  if (separatorIndex < 0) {
    return '';
  }

  return frame.slice(separatorIndex + 2);
}

// 백엔드가 외부 거래소 스트림을 받아 발행하는 심볼별 STOMP 토픽을 구독한다.
function subscribeStompTopics(
  symbols: string[],
  topicPrefix: string,
  subIdPrefix: string,
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  const listeners = symbols.map(symbol => listenRealtimeTicker(`${topicPrefix}/${symbol}`, onTicker));
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: number | undefined;
  let heartbeatTimer: number | undefined;

  function send(frame: string) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(`${frame}\0`);
    }
  }

  function connect() {
    socket = new WebSocket(getWebSocketUrl(), ['v12.stomp']);

    socket.onopen = () => {
      send(getConnectFrame());
    };

    socket.onmessage = (event) => {
      if (closedByClient || typeof event.data !== 'string') return;

      for (const frame of parseStompFrames(event.data)) {
        const command = getFrameCommand(frame);

        if (command === 'CONNECTED') {
          symbols.forEach(symbol => {
            send(`SUBSCRIBE\nid:${subIdPrefix}-${symbol}\ndestination:${topicPrefix}/${symbol}\n\n`);
          });
          heartbeatTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send('\n');
          }, 10000);
          continue;
        }

        if (command !== 'MESSAGE') continue;

        try {
          const data = JSON.parse(getFrameBody(frame));
          if (data.symbol && data.price) {
            publishRealtimeTicker(`${topicPrefix}/${String(data.symbol)}`, {
              symbol: String(data.symbol),
              price: Number(data.price),
              change: data.change == null ? undefined : Number(data.change),
              changeRate: data.changeRate == null ? undefined : Number(data.changeRate),
              volume: data.volume == null ? undefined : Number(data.volume),
              ts: data.ts == null ? undefined : Number(data.ts)
            });
          }
        } catch {
          // ignore
        }
      }
    };

    socket.onclose = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (!closedByClient) {
        reconnectTimer = window.setTimeout(() => {
          if (!closedByClient) connect();
        }, 2000);
      }
    };
  }

  connect();

  return {
    close: () => {
      listeners.forEach(listener => listener.close());
      closedByClient = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        symbols.forEach(symbol => send(`UNSUBSCRIBE\nid:${subIdPrefix}-${symbol}\n\n`));
        send('DISCONNECT\n\n');
      }
      socket?.close();
    }
  };
}

export function subscribeBitgetFuturesTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/coin-futures', 'bgf', onTicker);
}

export function subscribeBitgetSpotTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/coin', 'bgs', onTicker);
}

export function subscribeBinanceSpotTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/binance-spot', 'bns', onTicker);
}

export function subscribeBinanceFuturesTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/binance-futures', 'bnf', onTicker);
}

/**
 * 바이낸스 실시간 캔들 구독.
 * 백엔드가 발행하는 심볼별 티커 토픽(/topic/binance-{futures|spot}/SYMBOL)을 구독해
 * 가격 틱을 받아 캔들 메시지로 변환한다. (Bitget의 subscribeCoinCandle과 동일한 가격틱 방식)
 */
export function subscribeBinanceCandle(
  symbol: string,
  isFutures: boolean,
  onCandle: (candle: CandleMessage) => void
): Subscription {
  const prefix = isFutures ? '/topic/binance-futures' : '/topic/binance-spot';
  const idPrefix = isFutures ? 'bnfc' : 'bnsc';
  return subscribeStompTopics([symbol], prefix, idPrefix, (ticker) => {
    const price = ticker.price;
    onCandle({
      ts: ticker.ts,
      // 기기 시계가 어긋나면 봉 마감 즈음 가짜 캔들 생성/새 봉 지연 → 서버 이벤트 시각(ts) 우선
      time: Math.floor((ticker.ts ?? Date.now()) / 1000),
      open: price,
      high: price,
      low: price,
      close: price,
      volume: ticker.volume ?? 0,
    });
  });
}

// web granularity → Binance kline interval
const BINANCE_KLINE_INTERVAL: Record<string, string> = {
  '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1h', '4h': '4h', '6Hutc': '6h', '12Hutc': '12h',
  '1Dutc': '1d', '3Dutc': '3d', '1Wutc': '1w', '1Mutc': '1M',
};

/**
 * Binance 차트 캔들(kline) — 백엔드 릴레이 토픽 구독. 브라우저 직결 kline이 지역차단(한국 등)이라 서버 경유.
 * 백엔드(BinanceKlineRelayService)가 구독 시 해당 심볼+TF를 Binance에 SUBSCRIBE해 OHLCV를 중계한다.
 * /topic/binance-kline/{market}/{SYMBOL}/{interval} 에서 현재 캔들 OHLCV(거래량 포함) 실시간 수신.
 */
export function subscribeBinanceKline(
  symbol: string, isFutures: boolean, granularity: string, onCandle: (c: CandleMessage) => void
): Subscription {
  const interval = BINANCE_KLINE_INTERVAL[granularity];
  if (!interval) return { close: () => {} };
  const market = isFutures ? 'futures' : 'spot';
  const destination = `/topic/binance-kline/${market}/${symbol}/${interval}`;
  const subId = `bnk-${market}-${symbol}-${interval}`;
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: number | undefined;
  let heartbeatTimer: number | undefined;

  function send(frame: string) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(`${frame}\0`);
  }

  function connect() {
    socket = new WebSocket(getWebSocketUrl(), ['v12.stomp']);
    socket.onopen = () => send(getConnectFrame());
    socket.onmessage = (event) => {
      if (closedByClient || typeof event.data !== 'string') return;
      for (const frame of parseStompFrames(event.data)) {
        const command = getFrameCommand(frame);
        if (command === 'CONNECTED') {
          send(`SUBSCRIBE\nid:${subId}\ndestination:${destination}\n\n`);
          heartbeatTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send('\n');
          }, 10000);
          continue;
        }
        if (command !== 'MESSAGE') continue;
        try {
          const d = JSON.parse(getFrameBody(frame));
          if (d && d.time != null && Number.isFinite(Number(d.close)) && Number(d.close) > 0) {
            publishRealtimeTicker(`/topic/binance-${market}/${symbol}`, {
              symbol, price: Number(d.close), ts: d.ts == null ? undefined : Number(d.ts),
            });
            onCandle({
              ts: d.ts == null ? undefined : Number(d.ts),
              time: Number(d.time), open: Number(d.open), high: Number(d.high),
              low: Number(d.low), close: Number(d.close), volume: Number(d.volume),
            });
          }
        } catch { /* ignore */ }
      }
    };
    socket.onclose = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (!closedByClient) reconnectTimer = window.setTimeout(() => { if (!closedByClient) connect(); }, 2000);
    };
  }

  connect();

  return {
    close: () => {
      closedByClient = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        send(`UNSUBSCRIBE\nid:${subId}\n\n`); // 백엔드가 refcount 줄여 Binance 구독 해제(유예 후)
        send('DISCONNECT\n\n');
      }
      socket?.close();
    },
  };
}

/** Bitget 가격 틱도 헤더·목록과 같은 스트림으로 전달한다. */
export function subscribeCoinCandle(
  symbol: string,
  _channel: string,
  onCandle: (candle: CandleMessage) => void,
  productType?: string
): Subscription {
  const prefix = productType ? '/topic/coin-futures' : '/topic/coin';
  return subscribeStompTopics([symbol], prefix, 'coin', (ticker) => {
    onCandle({
      ts: ticker.ts,
      time: Math.floor((ticker.ts ?? Date.now()) / 1000),
      open: ticker.price, high: ticker.price, low: ticker.price, close: ticker.price,
      volume: ticker.volume ?? 0,
    });
  });
}
import { getToken } from '../client';
