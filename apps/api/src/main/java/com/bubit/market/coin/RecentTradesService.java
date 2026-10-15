package com.bubit.market.coin;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/** 공개 최근 체결만 조회한다. 계정 API·인증 키를 사용하지 않는다. */
@Service
public class RecentTradesService extends AbstractMarketService {
    public record Trade(String id, double price, double size, String side, long time) {}
    public record Snapshot(List<Trade> trades, boolean stale) {}

    private static final Set<String> EXCHANGES = Set.of("BITGET", "BINANCE", "UPBIT", "BITHUMB");
    private final BinanceRestGuard binanceGuard;
    private final WebClient client;
    private final Map<String, CompletableFuture<Snapshot>> inflight = new ConcurrentHashMap<>();

    @Autowired
    public RecentTradesService(BinanceRestGuard binanceGuard) {
        this(binanceGuard, WebClient.builder().build());
    }

    RecentTradesService(BinanceRestGuard binanceGuard, WebClient client) {
        this.binanceGuard = binanceGuard;
        this.client = client;
    }

    static void validate(String exchange, String symbol, boolean futures) {
        if (exchange == null || !EXCHANGES.contains(exchange) || symbol == null) throw new IllegalArgumentException();
        boolean krw = exchange.equals("UPBIT") || exchange.equals("BITHUMB");
        if (krw && futures || !symbol.matches(krw ? "[A-Z0-9]{1,24}KRW" : "[A-Z0-9]{1,24}USDT")) {
            throw new IllegalArgumentException();
        }
    }

    public Snapshot get(String exchange, String symbol, boolean futures) throws Exception {
        validate(exchange, symbol, futures);
        String key = "recent-trades:" + exchange + ':' + futures + ':' + symbol;
        if (exchange.equals("BINANCE")) {
            BinanceRestGuard.Result result = binanceGuard.getWithMeta(key, 2_000, 10_000,
                    () -> new Snapshot(fetch(exchange, symbol, futures), false), new Snapshot(List.of(), true));
            Snapshot snapshot = (Snapshot) result.data();
            return new Snapshot(snapshot.trades(), result.stale());
        }
        if (isCacheValid(key)) return (Snapshot) cache.get(key);
        CompletableFuture<Snapshot> mine = new CompletableFuture<>();
        CompletableFuture<Snapshot> pending = inflight.putIfAbsent(key, mine);
        if (pending != null) return pending.get(6, TimeUnit.SECONDS);
        try {
            // 소유권 대기 중 채워진 캐시를 다시 확인한다.
            Snapshot result;
            if (isCacheValid(key)) result = (Snapshot) cache.get(key);
            else {
                result = new Snapshot(fetch(exchange, symbol, futures), false);
                putCache(key, result, 2);
            }
            mine.complete(result);
            return result;
        } catch (RuntimeException e) {
            mine.completeExceptionally(e);
            throw e;
        } finally {
            inflight.remove(key, mine);
        }
    }

    private List<Trade> fetch(String exchange, String symbol, boolean futures) {
        String url = switch (exchange) {
            case "BITGET" -> "https://api.bitget.com/api/v3/market/fills?category="
                    + (futures ? "USDT-FUTURES" : "SPOT") + "&symbol=" + symbol + "&limit=50";
            case "BINANCE" -> (futures ? "https://fapi.binance.com/fapi/v1/trades" : "https://api.binance.com/api/v3/trades")
                    + "?symbol=" + symbol + "&limit=50";
            default -> "https://api." + (exchange.equals("UPBIT") ? "upbit" : "bithumb")
                    + ".com/v1/trades/ticks?market=KRW-" + symbol.substring(0, symbol.length() - 3) + "&count=50";
        };
        JsonNode body = client.get().uri(url).retrieve().bodyToMono(JsonNode.class).block(Duration.ofSeconds(5));
        return normalize(exchange, body);
    }

    static List<Trade> normalize(String exchange, JsonNode body) {
        if (body == null) throw new IllegalStateException("empty response");
        if (exchange.equals("BITGET")) {
            if (!body.path("code").asText().equals("00000")) throw new IllegalStateException("exchange rejected request");
            body = body.path("data");
        }
        if (!body.isArray()) throw new IllegalStateException("invalid trade response");
        Map<String, Trade> trades = new LinkedHashMap<>();
        for (JsonNode row : body) {
            String id;
            double price, size;
            String side;
            long time;
            switch (exchange) {
                case "BITGET" -> {
                    id = row.path("execId").asText();
                    price = row.path("price").asDouble();
                    size = row.path("size").asDouble();
                    side = row.path("side").asText();
                    time = row.path("ts").asLong();
                }
                case "BINANCE" -> {
                    id = row.path("id").asText();
                    price = row.path("price").asDouble();
                    size = row.path("qty").asDouble();
                    if (!row.path("isBuyerMaker").isBoolean()) continue;
                    side = row.path("isBuyerMaker").asBoolean() ? "sell" : "buy";
                    time = row.path("time").asLong();
                }
                default -> {
                    id = row.path("sequential_id").asText();
                    price = row.path("trade_price").asDouble();
                    size = row.path("trade_volume").asDouble();
                    side = switch (row.path("ask_bid").asText()) { case "BID" -> "buy"; case "ASK" -> "sell"; default -> ""; };
                    time = row.path("timestamp").asLong();
                }
            }
            if (!id.isBlank() && Double.isFinite(price) && price > 0 && Double.isFinite(size) && size > 0
                    && time > 0 && time <= 8_640_000_000_000_000L && (side.equals("buy") || side.equals("sell"))) {
                trades.putIfAbsent(id, new Trade(id, price, size, side, time));
            }
        }
        if (!body.isEmpty() && trades.isEmpty()) throw new IllegalStateException("invalid trade rows");
        return trades.values().stream().sorted(Comparator.comparingLong(Trade::time).reversed()).limit(50).toList();
    }
}
