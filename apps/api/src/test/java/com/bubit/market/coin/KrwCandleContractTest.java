package com.bubit.market.coin;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class KrwCandleContractTest {

    @Test
    void controller는_mobile_1200을_service에_그대로_전달하고_거래소별_TF를_검증한다() {
        CoinMarketService market = mock(CoinMarketService.class);
        CoinController controller = new CoinController();
        ReflectionTestUtils.setField(controller, "marketService", market);

        controller.getUpbitCandles("BTCKRW", "1h", 1200, null);
        controller.getBithumbCandles("BTCKRW", "6Hutc", 500, null);
        controller.getBithumbCandles("BTCKRW", "12Hutc", 300, null);
        verify(market).getUpbitCandles("1h", "BTCKRW", 1200, null);
        verify(market).getBithumbCandles("6Hutc", "BTCKRW", 500, null);
        verify(market).getBithumbCandles("12Hutc", "BTCKRW", 300, null);

        ResponseStatusException unsupported = assertThrows(ResponseStatusException.class,
                () -> controller.getUpbitCandles("BTCKRW", "6Hutc", 300, null));
        assertEquals(HttpStatus.BAD_REQUEST, unsupported.getStatusCode());
        ResponseStatusException badTickerSymbol = assertThrows(ResponseStatusException.class,
                () -> controller.getBinanceSpotTicker("BTC/USDT"));
        assertEquals(HttpStatus.BAD_REQUEST, badTickerSymbol.getStatusCode());
    }

    @Test
    void service는_1200개를_페이지당_200으로_여섯번_요청한다() {
        AtomicInteger calls = new AtomicInteger();
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            assertTrue(request.url().getQuery().contains("count=200"));
            int page = calls.getAndIncrement();
            List<Map<String, Object>> rows = new ArrayList<>();
            for (int i = 0; i < 200; i++) {
                int minute = page * 200 + i;
                rows.add(Map.of("candle_date_time_utc", "2026-01-01T00:" + String.format("%02d", minute % 60) + ":00",
                        "opening_price", 1, "high_price", 2, "low_price", 1, "trade_price", 2, "candle_acc_trade_volume", 3));
            }
            return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .body(new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(rows).toString()).build());
        }).build();

        Object result = new KrwMarketService(client, client).getUpbitCandles("1h", "BTCKRW", 1200, null);
        assertEquals(6, calls.get());
        assertEquals(1200, ((List<?>) result).size());
    }
}
