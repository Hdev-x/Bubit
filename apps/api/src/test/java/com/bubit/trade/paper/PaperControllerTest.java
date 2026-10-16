package com.bubit.trade.paper;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.mockito.Mockito.*;

class PaperControllerTest {
    private final PaperService service = mock(PaperService.class);
    private final PaperPriceService prices = mock(PaperPriceService.class);
    private final PaperController controller = new PaperController(service, prices);

    @BeforeEach
    void login() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("owner", null));
        when(prices.price("BTCUSDT")).thenReturn(100d);
    }
    @AfterEach void logout() { SecurityContextHolder.clearContext(); }

    @Test
    void marketOrderIgnoresClientPrice() {
        controller.order(new PaperController.OrderRequest("market", "BTCUSDT", "long", 10, 5, 1));
        verify(service).placeOrder("owner", "BTCUSDT", "long", 10, 5, 100);
    }

    @Test
    void closingUsesOwnersPositionAndServerPrice() {
        when(service.positionSymbol("owner", 3)).thenReturn("BTCUSDT");
        controller.close(new PaperController.CloseRequest(3));
        verify(service).closePosition("owner", 3, 100);
    }
}
