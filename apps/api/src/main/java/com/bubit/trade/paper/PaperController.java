package com.bubit.trade.paper;

import com.bubit.common.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 로그인 회원의 가상계좌. Bitget 공개 시세만 사용하며 API 키·실주문과 연결하지 않는다. */
@Profile("paper")
@RestController
@RequestMapping("/api/paper")
@RequiredArgsConstructor
public class PaperController {
    private final PaperService service;
    private final PaperPriceService prices;

    public record OrderRequest(
            @NotNull @Pattern(regexp = "market|limit") String type,
            @NotNull @Pattern(regexp = "[A-Z0-9]{1,26}USDT") String symbol,
            @NotNull @Pattern(regexp = "long|short") String direction,
            @Positive double marginUsdt,
            @Min(1) @Max(100) int leverage,
            double price) {}
    public record CancelRequest(@NotNull @Positive Integer orderId) {}
    public record CloseRequest(@NotNull @Positive Integer positionId) {}

    @GetMapping("/account")
    public Map<String, Object> account() {
        return service.overview(CurrentUser.username());
    }

    @PostMapping("/order")
    public Map<String, Object> order(@Valid @RequestBody OrderRequest request) {
        String member = CurrentUser.username();
        double currentPrice = prices.price(request.symbol());
        return "limit".equals(request.type())
                ? service.placeLimit(member, request.symbol(), request.direction(), request.marginUsdt(), request.leverage(), request.price())
                : service.placeOrder(member, request.symbol(), request.direction(), request.marginUsdt(), request.leverage(), currentPrice);
    }

    @PostMapping("/cancel")
    public Map<String, Object> cancel(@Valid @RequestBody CancelRequest request) {
        return service.cancelOrder(CurrentUser.username(), request.orderId());
    }

    @PostMapping("/close")
    public Map<String, Object> close(@Valid @RequestBody CloseRequest request) {
        String member = CurrentUser.username();
        String symbol = service.positionSymbol(member, request.positionId());
        return service.closePosition(member, request.positionId(), prices.price(symbol));
    }

    @PostMapping("/reset")
    public Map<String, Object> reset() {
        return service.reset(CurrentUser.username());
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    public ResponseEntity<?> invalidOrder(RuntimeException error) {
        return ResponseEntity.badRequest().body(Map.of("error", error.getMessage()));
    }
}
