package com.bubit.market.coin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
}
