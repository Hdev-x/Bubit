package com.bubit.trade.paper;

import com.bubit.market.coin.CoinMarketService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaperPriceServiceTest {
    private final CoinMarketService market = mock(CoinMarketService.class);
    private final PaperPriceService prices = new PaperPriceService(market);

    @Test
    void usesFuturesPriceAndRejectsInvalidTickerRows() {
        when(market.getFuturesTickers("USDT-FUTURES")).thenReturn(Map.of("data", List.of(
                Map.of("symbol", "BTCUSDT", "lastPr", "100"),
                Map.of("symbol", "ETHUSDT", "lastPr", "NaN"),
                Map.of("symbol", "SOLUSDT", "lastPr", "-3"))));
        assertEquals(Map.of("BTCUSDT", 100d), prices.prices());
        verify(market, never()).getTickerPriceMap();
    }

    @Test
    void noOrdersMeansNoPublicMarketRequest() {
        PaperMapper mapper = mock(PaperMapper.class);
        when(mapper.selectAllPending()).thenReturn(List.of());
        new PaperFillService(mapper, mock(PaperService.class), prices).fillPending();
        verifyNoInteractions(market);
    }
}
