package com.bubit.market.coin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class RecentTradesServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private static final String BITGET = """
            {"code":"00000","data":[{"execId":"9007199254740999","price":"100","size":"0.2","side":"buy","ts":"1700000000000"}]}
            """;

    @Test
    void 거래소별_방향과_시간을_정규화하고_잘못된_행은_제외한다() throws Exception {
        assertEquals("9007199254740999", RecentTradesService.normalize("BITGET", json.readTree(BITGET)).getFirst().id());
        var binance = RecentTradesService.normalize("BINANCE", json.readTree("""
                [{"id":1,"price":"100","qty":"2","time":1000,"isBuyerMaker":true},
                 {"id":2,"price":"101","qty":"3","time":2000,"isBuyerMaker":false},
                 {"id":3,"price":"0","qty":"3","time":2000,"isBuyerMaker":false}]
                """));
        assertEquals(List.of("buy", "sell"), binance.stream().map(RecentTradesService.Trade::side).toList());
        for (String exchange : List.of("UPBIT", "BITHUMB")) {
            var rows = RecentTradesService.normalize(exchange, json.readTree("""
                    [{"sequential_id":9007199254740999,"trade_price":1500,"trade_volume":0.25,"ask_bid":"ASK","timestamp":3000}]
                    """));
            assertEquals(new RecentTradesService.Trade("9007199254740999", 1500, 0.25, "sell", 3000), rows.getFirst());
        }
        assertThrows(IllegalStateException.class, () -> RecentTradesService.normalize("BITGET", json.readTree("{\"code\":\"40001\",\"data\":[]}")));
    }

    @Test
    void 비트겟_동시요청은_공유하고_짧은_캐시를_재사용한다() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            calls.incrementAndGet();
            assertEquals("/api/v3/market/fills", request.url().getPath());
            assertEquals("category=USDT-FUTURES&symbol=BTCUSDT&limit=50", request.url().getQuery());
            started.countDown();
            try { assertTrue(release.await(2, TimeUnit.SECONDS)); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
            return Mono.just(response(BITGET));
        }).build();
        RecentTradesService service = new RecentTradesService(new BinanceRestGuard(), client);
        CompletableFuture<RecentTradesService.Snapshot> first = CompletableFuture.supplyAsync(() -> get(service, "BITGET", "BTCUSDT", true));
        assertTrue(started.await(2, TimeUnit.SECONDS));
        CompletableFuture<RecentTradesService.Snapshot> second = CompletableFuture.supplyAsync(() -> get(service, "BITGET", "BTCUSDT", true));
        release.countDown();
        assertEquals(first.get(2, TimeUnit.SECONDS), second.get(2, TimeUnit.SECONDS));
        service.get("BITGET", "BTCUSDT", true);
        assertEquals(1, calls.get());
    }

    @Test
    void 바이낸스는_공유_차단상태와_stale_기한을_지킨다() throws Exception {
        AtomicLong clock = new AtomicLong(1000);
        AtomicInteger calls = new AtomicInteger();
        BinanceRestGuard guard = new BinanceRestGuard(clock::get);
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            calls.incrementAndGet();
            assertEquals("/fapi/v1/trades", request.url().getPath());
            return Mono.just(response("[{\"id\":1,\"price\":\"100\",\"qty\":\"2\",\"time\":1000,\"isBuyerMaker\":true}]"));
        }).build();
        RecentTradesService service = new RecentTradesService(guard, client);
        assertFalse(service.get("BINANCE", "BTCUSDT", true).stale());
        clock.set(4000);
        guard.noteRateLimit(418, "60");
        assertTrue(service.get("BINANCE", "BTCUSDT", true).stale());
        assertEquals(1, service.get("BINANCE", "BTCUSDT", true).trades().size());
        clock.set(12000);
        assertTrue(service.get("BINANCE", "BTCUSDT", true).trades().isEmpty());
        assertEquals(1, calls.get());
    }

    @Test
    void 원화마켓_심볼은_공식_페어로_변환한다() throws Exception {
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            assertEquals("api.upbit.com", request.url().getHost());
            assertEquals("market=KRW-BTC&count=50", request.url().getQuery());
            return Mono.just(response("[]"));
        }).build();
        assertTrue(new RecentTradesService(new BinanceRestGuard(), client).get("UPBIT", "BTCKRW", false).trades().isEmpty());
    }

    @Test
    void 잘못된_시장과_심볼은_상류호출_전에_400이다() {
        RecentTradesController controller = new RecentTradesController(null);
        for (String symbol : List.of("BTC/USDT", "BTCUSDT?limit=1000", "BTCUSDC")) {
            assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                    () -> controller.get("BITGET", symbol, false)).getStatusCode());
        }
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> controller.get("UPBIT", "BTCKRW", true)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> controller.get("OTHER", "BTCUSDT", false)).getStatusCode());
    }

    private static ClientResponse response(String body) {
        return ClientResponse.create(HttpStatus.OK).header("Content-Type", MediaType.APPLICATION_JSON_VALUE).body(body).build();
    }

    private static RecentTradesService.Snapshot get(RecentTradesService service, String exchange, String symbol, boolean futures) {
        try { return service.get(exchange, symbol, futures); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
