package com.bubit.market.coin;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

class BinanceMarketServiceTest {

    private static Map<String, Object> snap(double price, long receivedAt) {
        Map<String, Object> m = new HashMap<>();
        m.put("price", price); m.put("change", 1.0); m.put("changeRate", 0.01); m.put("receivedAt", receivedAt);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static double lastPrice(Object merged, int i) {
        return ((Number) ((List<Map<String, Object>>) merged).get(i).get("lastPrice")).doubleValue();
    }

    @Test
    void 신선한_스냅샷만_REST_가격을_덮는다() {
        long now = 1_000_000L;
        List<Map<String, Object>> rows = List.of(Map.of("symbol", "BTCUSDT", "lastPrice", 100.0), Map.of("symbol", "ETHUSDT", "lastPrice", 10.0));
        Map<String, Map<String, Object>> snaps = Map.of(
                "BTCUSDT", snap(101.0, now - 10_000),                              // 10초 전 — 신선
                "ETHUSDT", snap(99.0, now - BinanceMarketService.SNAPSHOT_MAX_AGE_MS - 1)); // 만료 — REST 보존
        Object merged = BinanceMarketService.mergeSnapshots(rows, snaps, now);
        assertEquals(101.0, lastPrice(merged, 0));
        assertEquals(10.0, lastPrice(merged, 1), "특정 종목 WS가 멈추면 정상 REST 가격이 옛 값으로 되돌아가지 않는다(특정 종목 WS 정지 회귀)");
    }

    @Test
    void receivedAt이_없는_스냅샷은_쓰지_않고_스냅샷이_없으면_그대로() {
        List<Map<String, Object>> rows = List.of(Map.of("symbol", "BTCUSDT", "lastPrice", 100.0));
        Map<String, Object> noAt = new HashMap<>(snap(5.0, 0)); noAt.remove("receivedAt");
        assertEquals(100.0, lastPrice(BinanceMarketService.mergeSnapshots(rows, Map.of("BTCUSDT", noAt), 1_000L), 0));
        assertEquals(rows, BinanceMarketService.mergeSnapshots(rows, Map.of(), 1_000L));
    }

    @Test
    void 단건_ticker는_raw_24h_URL을_사용하고_guard_TTL로_중복을_막는다() {
        AtomicInteger calls = new AtomicInteger();
        WebClient spot = WebClient.builder().exchangeFunction(request -> {
            calls.incrementAndGet();
            assertEquals("/api/v3/ticker/24hr", request.url().getPath());
            assertEquals("symbol=BTCUSDT", request.url().getQuery());
            return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .body("{\"symbol\":\"BTCUSDT\",\"lastPrice\":\"100\",\"priceChangePercent\":\"2\"}").build());
        }).build();
        BinanceMarketService service = new BinanceMarketService(mock(BinanceSpotRealtimeWebSocketService.class),
                mock(BinanceFuturesRealtimeWebSocketService.class), new BinanceRestGuard(), spot, spot);

        assertEquals(service.getBinanceSpotTicker("BTCUSDT"), service.getBinanceSpotTicker("BTCUSDT"));
        assertEquals(1, calls.get());
        assertThrows(IllegalArgumentException.class, () -> service.getBinanceSpotTicker("BTC/USDT"));
    }

    @Test
    void 단건_ticker는_차단과_일반오류때_유한한_stale만_반환한다() {
        AtomicLong clock = new AtomicLong(1_000);
        AtomicInteger calls = new AtomicInteger();
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            if (calls.incrementAndGet() == 1) {
                return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                        .body("{\"symbol\":\"ETHUSDT\",\"lastPrice\":\"100\"}").build());
            }
            return Mono.error(new IllegalStateException("upstream failed"));
        }).build();
        BinanceRestGuard guard = new BinanceRestGuard(clock::get);
        BinanceMarketService service = new BinanceMarketService(mock(BinanceSpotRealtimeWebSocketService.class),
                mock(BinanceFuturesRealtimeWebSocketService.class), guard, client, client);

        Object fresh = service.getBinanceSpotTicker("ETHUSDT");
        assertEquals(fresh, service.getBinanceSpotTicker("ETHUSDT"));
        assertEquals(1, calls.get(), "10초 TTL 안에는 상류를 다시 호출하지 않는다");

        clock.set(11_000);
        guard.noteRateLimit(429, "1");
        assertEquals(fresh, service.getBinanceSpotTicker("ETHUSDT"));
        assertEquals(1, calls.get(), "차단 중에는 상류를 호출하지 않고 유효한 stale을 쓴다");

        clock.set(13_000);
        assertEquals(fresh, service.getBinanceSpotTicker("ETHUSDT"));
        assertEquals(2, calls.get(), "일반 오류에도 아직 유효한 stale을 쓴다");

        clock.set(62_000);
        assertEquals(Map.of(), service.getBinanceSpotTicker("ETHUSDT"));
        assertEquals(3, calls.get(), "60초가 지난 stale은 반환하지 않는다");
    }
}
