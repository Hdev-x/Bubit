package com.bubit.trade.paper;

import com.bubit.market.coin.CoinMarketService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 선물 모의체결은 현물 시세가 아니라 Bitget USDT 선물의 공개 시세를 사용한다. */
@Service
@Profile("paper")
@RequiredArgsConstructor
public class PaperPriceService {
    private final CoinMarketService market;

    public Map<String, Double> prices() {
        Object response = market.getFuturesTickers("USDT-FUTURES");
        if (!(response instanceof Map<?, ?> root) || !(root.get("data") instanceof List<?> rows)) {
            return Map.of();
        }
        Map<String, Double> prices = new HashMap<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> ticker) || !(ticker.get("symbol") instanceof String symbol)) continue;
            try {
                double price = Double.parseDouble(String.valueOf(ticker.get("lastPr")));
                if (symbol.endsWith("USDT") && Double.isFinite(price) && price > 0) prices.put(symbol, price);
            } catch (NumberFormatException ignored) {
                // 잘못된 한 종목이 다른 지정가 체결을 막지 않도록 제외한다.
            }
        }
        return prices;
    }

    public double price(String symbol) {
        Double price = prices().get(symbol);
        if (price == null) throw new IllegalStateException("해당 종목의 Bitget 선물 현재가를 불러올 수 없습니다.");
        return price;
    }
}
