package com.bubit.market.coin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class TickerBroadcastTest {
    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final TickerSubscriptions subscriptions = mock(TickerSubscriptions.class);

    @Test
    void Binance_현물은_전종목_UTC_snapshot을_보존하고_구독_종목_최신값만_송출한다() {
        var service = new BinanceSpotRealtimeWebSocketService(messaging, new ObjectMapper(),
                new BinanceRestGuard(), subscriptions);
        verifyBinanceBroadcast(service, "/topic/binance-spot/BTCUSDT");
    }

    @Test
    void Binance_선물은_전종목_UTC_snapshot을_보존하고_구독_종목_최신값만_송출한다() {
        var service = new BinanceFuturesRealtimeWebSocketService(messaging, new ObjectMapper(),
                new BinanceRestGuard(), subscriptions);
        verifyBinanceBroadcast(service, "/topic/binance-futures/BTCUSDT");
    }

    @SuppressWarnings("unchecked")
    private void verifyBinanceBroadcast(Object service, String topic) {
        ReflectionTestUtils.setField(service, "enabled", true);
        when(subscriptions.hasSubscribers(topic)).thenReturn(true);
        long now = System.currentTimeMillis();
        ReflectionTestUtils.invokeMethod(service, "handleMessage", kline("BTCUSDT", 110, now - 2));
        ReflectionTestUtils.invokeMethod(service, "handleMessage", kline("BTCUSDT", 120, now - 1));
        ReflectionTestUtils.invokeMethod(service, "handleMessage", kline("ETHUSDT", 140, now));
        verifyNoInteractions(messaging);
        Map<String, Map<String, Object>> snapshots =
                (Map<String, Map<String, Object>>) ReflectionTestUtils.getField(service, "latestTickers");
        assertEquals(140.0, snapshots.get("ETHUSDT").get("price"));
        assertEquals(40.0, snapshots.get("ETHUSDT").get("change"));
        ReflectionTestUtils.invokeMethod(service, "flushBroadcasts");
        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messaging).convertAndSend(eq(topic), payload.capture());
        Map<String, Object> sent = (Map<String, Object>) payload.getValue();
        assertEquals(120.0, sent.get("price"));
        assertEquals(20.0, sent.get("change"));
        assertEquals(0.2, sent.get("changeRate"));
        assertEquals(now - 1, sent.get("ts"));
        ReflectionTestUtils.invokeMethod(service, "handleMessage", kline("BTCUSDT", 130, now));
        when(subscriptions.hasSubscribers(topic)).thenReturn(false);
        ReflectionTestUtils.invokeMethod(service, "flushBroadcasts");
        verifyNoMoreInteractions(messaging);
        Map<?, ?> pending = (Map<?, ?>) ReflectionTestUtils.getField(service, "pendingBroadcasts");
        assertTrue(pending.isEmpty());

        when(subscriptions.hasSubscribers(topic)).thenReturn(true);
        ReflectionTestUtils.invokeMethod(service, "handleMessage", kline("BTCUSDT", 150, now - 6_000));
        ReflectionTestUtils.invokeMethod(service, "flushBroadcasts");
        verifyNoMoreInteractions(messaging);
        assertTrue(pending.isEmpty());
        assertEquals(150.0, snapshots.get("BTCUSDT").get("price"), "송출 지연 필터는 REST snapshot을 변경하지 않는다");
    }

    @Test
    void Bitget은_서버에_늦게_도착한_틱을_버리고_다음_최신값을_기다린다() {
        var service = new CoinRealtimeWebSocketService(messaging, new ObjectMapper(), subscriptions);
        ReflectionTestUtils.setField(service, "enabled", true);
        String topic = "/topic/coin/BTCUSDT";
        when(subscriptions.hasSubscribers(topic)).thenReturn(true);
        long now = System.currentTimeMillis();
        ReflectionTestUtils.invokeMethod(service, "handleMessage", bitgetTicker(now - 6_000));
        service.flushBroadcasts();
        verifyNoInteractions(messaging);
        Map<?, ?> pending = (Map<?, ?>) ReflectionTestUtils.getField(service, "pendingBroadcasts");
        assertTrue(pending.isEmpty());
        ReflectionTestUtils.invokeMethod(service, "handleMessage", bitgetTicker(now));
        service.flushBroadcasts();
        verify(messaging).convertAndSend(eq(topic), org.mockito.ArgumentMatchers.any(Object.class));
    }

    private static String bitgetTicker(long timestamp) {
        return "{\"arg\":{\"instType\":\"SPOT\",\"instId\":\"BTCUSDT\"},"
                + "\"data\":[{\"lastPr\":\"120\",\"openUtc\":\"100\",\"ts\":" + timestamp + "}]}";
    }

    private static String kline(String symbol, int price, long timestamp) {
        return "{\"e\":\"kline\",\"s\":\"" + symbol + "\",\"E\":" + timestamp
                + ",\"k\":{\"c\":\"" + price + "\",\"o\":\"100\",\"q\":\"1000\"}}";
    }
}
