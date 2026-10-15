package com.bubit.market.coin;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class RecentTradesController {
    private final RecentTradesService service;

    public RecentTradesController(RecentTradesService service) {
        this.service = service;
    }

    @GetMapping("/coin/api/recent-trades")
    public RecentTradesService.Snapshot get(
            @RequestParam("exchange") String exchange,
            @RequestParam("symbol") String symbol,
            @RequestParam(value = "futures", defaultValue = "false") boolean futures) {
        try {
            RecentTradesService.validate(exchange, symbol, futures);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid market");
        }
        try {
            return service.get(exchange, symbol, futures);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "recent trades unavailable");
        }
    }
}
