package com.bubit.market.coin;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CoinMarketServicePricePrecisionTest {

    private static Map<String, Object> exchangeInfo(String... symbolsAndTicks) {
        return Map.of("symbols", Arrays.stream(symbolsAndTicks).map(row -> {
            String[] fields = row.split("=");
            return Map.of("symbol", fields[0], "filters", java.util.List.of(
                    Map.of("filterType", "LOT_SIZE", "stepSize", "0.00000001"),
                    Map.of("filterType", "PRICE_FILTER", "tickSize", fields[1])));
        }).toList());
    }

    private static CoinMarketService service(BinanceMarketService binance, AtomicBoolean failed, AtomicInteger calls) {
        WebClient client = WebClient.builder().exchangeFunction(request -> {
            calls.incrementAndGet();
            String body;
            if (failed.get()) {
                body = "{\"code\":\"40000\",\"data\":[]}";
            } else if (request.url().getPath().equals("/api/v2/spot/public/symbols")) {
                body = """
                        {"code":"00000","data":[
                          {"symbol":"INVALIDUSDT","pricePrecision":"bad"},
                          {"symbol":"BTCUSDT","pricePrecision":"2","quantityPrecision":"6"}
                        ]}
                        """;
            } else {
                assertEquals("/api/v2/mix/market/contracts", request.url().getPath());
                String symbol = request.url().getQuery().equals("productType=USDC-FUTURES") ? "BTCUSDC" : "BTCUSDT";
                body = "{\"code\":\"00000\",\"data\":[{\"symbol\":\"" + symbol + "\",\"pricePlace\":\"1\"}]}";
            }
            return Mono.just(ClientResponse.create(HttpStatus.OK).header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .body(body).build());
        }).build();
        return new CoinMarketService(new BitgetMarketService(client), binance, mock(CoinGeckoMarketService.class),
                mock(BithumbMarketService.class), mock(KrwMarketService.class));
    }

    @Test
    void 거래소와_현선물_정밀도를_분리하고_기존_선물_alias를_보존한다() {
        BinanceMarketService binance = mock(BinanceMarketService.class);
        when(binance.getBinanceFuturesExchangeInfoWithMeta()).thenReturn(new BinanceRestGuard.Result(
                exchangeInfo("BTCUSDT=0.10000000", "IQUSDT=0.00001000"), false));
        when(binance.getBinanceSpotExchangeInfoWithMeta()).thenReturn(new BinanceRestGuard.Result(
                exchangeInfo("BTCUSDT=0.01000000", "IQUSDT=0.00000100", "MDBBUSDT=0.01000000",
                        "INTEGERUSDT=1.00000000", "SMALLUSDT=1e-8", "ZEROUSDT=0.00000000", "BADUSDT=bad"), false));
        AtomicInteger calls = new AtomicInteger();
        CoinMarketService service = service(binance, new AtomicBoolean(), calls);

        Map<String, Integer> precision = service.getPricePrecision();

        assertEquals(2, precision.get("BITGET:SPOT:BTCUSDT"));
        assertEquals(1, precision.get("BITGET:FUTURES:BTCUSDT"));
        assertEquals(1, precision.get("BITGET:FUTURES:BTCUSDC"));
        assertEquals(2, precision.get("BINANCE:SPOT:BTCUSDT"));
        assertEquals(1, precision.get("BINANCE:FUTURES:BTCUSDT"));
        assertEquals(6, precision.get("BINANCE:SPOT:IQUSDT"));
        assertEquals(5, precision.get("BINANCE:FUTURES:IQUSDT"));
        assertEquals(2, precision.get("BINANCE:SPOT:MDBBUSDT"));
        assertEquals(0, precision.get("BINANCE:SPOT:INTEGERUSDT"));
        assertEquals(8, precision.get("BINANCE:SPOT:SMALLUSDT"));
        assertEquals(1, precision.get("BTCUSDT"));
        assertEquals(1, precision.get("BN_BTCUSDT"));
        assertEquals(5, precision.get("BN_IQUSDT"));
        assertFalse(precision.containsKey("BINANCE:SPOT:ZEROUSDT"));
        assertFalse(precision.containsKey("BINANCE:SPOT:BADUSDT"));
        assertFalse(precision.containsKey("BITGET:SPOT:INVALIDUSDT"));
        assertEquals(precision, service.getPricePrecision());
        assertEquals(3, calls.get());
        verify(binance, times(1)).getBinanceSpotExchangeInfoWithMeta();
        verify(binance, times(1)).getBinanceFuturesExchangeInfoWithMeta();
    }

    @Test
    void 실패와_stale은_마지막_정밀도를_보존하고_60초_뒤_재조회한다() {
        BinanceMarketService binance = mock(BinanceMarketService.class);
        Map<String, Object> info = exchangeInfo("BTCUSDT=0.01000000");
        when(binance.getBinanceFuturesExchangeInfoWithMeta()).thenReturn(new BinanceRestGuard.Result(info, false));
        when(binance.getBinanceSpotExchangeInfoWithMeta()).thenReturn(new BinanceRestGuard.Result(info, false));
        AtomicBoolean failed = new AtomicBoolean();
        CoinMarketService service = service(binance, failed, new AtomicInteger());
        Map<String, Integer> first = service.getPricePrecision();
        assertTrue(service.cacheExpiry.values().stream().allMatch(expiry -> expiry > System.currentTimeMillis() + 3_000_000));

        failed.set(true);
        service.cacheExpiry.replaceAll((key, expiry) -> 0L);
        when(binance.getBinanceFuturesExchangeInfoWithMeta()).thenReturn(new BinanceRestGuard.Result(Map.of(), true));
        when(binance.getBinanceSpotExchangeInfoWithMeta()).thenReturn(new BinanceRestGuard.Result(info, true));

        assertEquals(first, service.getPricePrecision());
        long now = System.currentTimeMillis();
        assertTrue(service.cacheExpiry.values().stream().allMatch(expiry -> expiry > now && expiry <= now + 60_000));
    }
}
