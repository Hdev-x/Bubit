package com.bubit.market.coin;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class BitgetMarketServiceTest {
    @Test
    void 같은_큰_TF의_동시_miss는_하나의_페이징_결과를_공유한다() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            calls.incrementAndGet();
            if (request.url().getPath().contains("history-candles")) {
                entered.countDown();
                try { assertTrue(release.await(5, TimeUnit.SECONDS)); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            String body = request.url().getPath().contains("history-candles")
                    ? "{\"code\":\"00000\",\"data\":[[\"1000\",\"1\",\"2\",\"1\",\"2\",\"3\"]]}"
                    : "{\"code\":\"00000\",\"data\":[[\"2000\",\"1\",\"2\",\"1\",\"2\",\"3\"]]}";
            return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type", MediaType.APPLICATION_JSON_VALUE).body(body).build());
        }).build();
        BitgetMarketService service = new BitgetMarketService(client);
        List<Object> results = Collections.synchronizedList(new ArrayList<>());
        Thread first = new Thread(() -> results.add(service.getCandles("BTCUSDT", "1Wutc", "300", null, null)));
        Thread second = new Thread(() -> results.add(service.getCandles("BTCUSDT", "1Wutc", "300", null, null)));
        first.start();
        assertTrue(entered.await(5, TimeUnit.SECONDS));
        second.start();
        Thread.sleep(50);
        release.countDown();
        first.join(5_000);
        second.join(5_000);

        assertEquals(2, results.size());
        assertSame(results.get(0), results.get(1));
        assertEquals(3, calls.get(), "history 2회(진전 없음 확인) + recent 1회만 호출한다");
    }

    @Test
    void owner_예외뒤에는_inflight가_해제되어_다음_요청이_재시도한다() {
        AtomicInteger calls = new AtomicInteger();
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            int call = calls.incrementAndGet();
            String body = call == 1
                    ? "{\"code\":\"00000\",\"data\":[[\"bad-ts\"]]}"
                    : "{\"code\":\"00000\",\"data\":[]}";
            return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type", MediaType.APPLICATION_JSON_VALUE).body(body).build());
        }).build();
        BitgetMarketService service = new BitgetMarketService(client);

        assertThrows(NumberFormatException.class, () -> service.getCandles("ETHUSDT", "1Wutc", "300", null, null));
        assertDoesNotThrow(() -> service.getCandles("ETHUSDT", "1Wutc", "300", null, null));
        assertEquals(3, calls.get(), "실패 1회 뒤 history와 recent를 새로 호출한다");
    }
}
