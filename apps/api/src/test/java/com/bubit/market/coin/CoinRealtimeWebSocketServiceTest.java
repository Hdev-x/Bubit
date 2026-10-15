package com.bubit.market.coin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.http.WebSocket;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CoinRealtimeWebSocketServiceTest {

    private final ObjectMapper om = new ObjectMapper();

    @Test
    void 정상_응답은_data_배열을_돌려준다() throws Exception {
        var data = CoinRealtimeWebSocketService.parseTickerRows(200, "{\"code\":\"00000\",\"data\":[{\"symbol\":\"BTCUSDT\"}]}", om, "spot");
        assertTrue(data.isArray());
        assertEquals(1, data.size());
    }

    @Test
    void 오류코드_비배열data_HTTP오류는_예외다_빈_목록으로_읽혀_구독이_축소되지_않게() {
        assertThrows(IllegalStateException.class, () -> CoinRealtimeWebSocketService.parseTickerRows(200, "{\"code\":\"40001\",\"msg\":\"rate limit\"}", om, "spot"));
        assertThrows(IllegalStateException.class, () -> CoinRealtimeWebSocketService.parseTickerRows(200, "{\"code\":\"00000\",\"data\":{}}", om, "spot"));
        assertThrows(IllegalStateException.class, () -> CoinRealtimeWebSocketService.parseTickerRows(503, "", om, "spot"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void 구독_변경은_기존_연결을_재사용하고_재연결은_현재_목록만_복원한다() throws Exception {
        TickerSubscriptions subscriptions = mock(TickerSubscriptions.class);
        var service = new CoinRealtimeWebSocketService(mock(SimpMessagingTemplate.class), om, subscriptions);
        ReflectionTestUtils.setField(service, "enabled", true);
        var btc = argument("BTCUSDT");
        var eth = argument("ETHUSDT");
        var sol = argument("SOLUSDT");
        ReflectionTestUtils.setField(service, "availableArguments", List.of(btc, eth, sol));
        when(subscriptions.hasSubscribers("/topic/coin/BTCUSDT")).thenReturn(true);
        when(subscriptions.hasSubscribers("/topic/coin/SOLUSDT")).thenReturn(true);
        Class<?> connectionType = Class.forName(CoinRealtimeWebSocketService.class.getName() + "$BitgetConnection");
        var constructor = connectionType.getDeclaredConstructor(CoinRealtimeWebSocketService.class, List.class);
        constructor.setAccessible(true);
        Object connection = constructor.newInstance(service, List.of(btc, eth));
        WebSocket socket = mockSocket();
        ReflectionTestUtils.setField(connection, "socket", socket);
        List<Object> connections = (List<Object>) ReflectionTestUtils.getField(service, "connections");
        connections.add(connection);
        ReflectionTestUtils.setField(service, "subscribedChannels", Set.of("SPOT:BTCUSDT", "SPOT:ETHUSDT"));
        try {
            service.refreshDemand();
            assertEquals(List.of(connection), connections);
            ArgumentCaptor<String> changes = ArgumentCaptor.forClass(String.class);
            verify(socket, timeout(1_000).times(2)).sendText(changes.capture(), eq(true));
            assertEquals("unsubscribe", om.readTree(changes.getAllValues().get(0)).path("op").asText());
            assertEquals("ETHUSDT", om.readTree(changes.getAllValues().get(0)).path("args").get(0).path("instId").asText());
            assertEquals("subscribe", om.readTree(changes.getAllValues().get(1)).path("op").asText());
            assertEquals("SOLUSDT", om.readTree(changes.getAllValues().get(1)).path("args").get(0).path("instId").asText());

            WebSocket reopened = mockSocket();
            ReflectionTestUtils.invokeMethod(connection, "onOpen", reopened);
            ArgumentCaptor<String> restored = ArgumentCaptor.forClass(String.class);
            verify(reopened, timeout(1_000)).sendText(restored.capture(), eq(true));
            var args = om.readTree(restored.getValue()).path("args");
            assertEquals(2, args.size());
            assertEquals("BTCUSDT", args.get(0).path("instId").asText());
            assertEquals("SOLUSDT", args.get(1).path("instId").asText());

            when(subscriptions.hasSubscribers(anyString())).thenReturn(false);
            service.refreshDemand();
            assertEquals(1, connections.size(), "빠른 화면 전환 동안은 구독 해제를 유예한다");
            Map<String, Long> lastDemand = (Map<String, Long>) ReflectionTestUtils.getField(service, "lastDemandAt");
            lastDemand.replaceAll((key, value) -> System.currentTimeMillis() - 9_000);
            service.refreshDemand();
            assertTrue(connections.isEmpty());
            verify(reopened).abort();
        } finally {
            service.stop();
        }
    }

    private static Map<String, String> argument(String symbol) {
        return Map.of("instType", "SPOT", "channel", "ticker", "instId", symbol);
    }

    private static WebSocket mockSocket() {
        WebSocket socket = mock(WebSocket.class);
        when(socket.sendText(anyString(), eq(true))).thenReturn(CompletableFuture.completedFuture(socket));
        return socket;
    }
}
