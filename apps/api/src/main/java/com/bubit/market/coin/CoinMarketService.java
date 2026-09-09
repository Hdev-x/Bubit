package com.bubit.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * [클래스 읽기] 기존의 거대한 CoinMarketService를 대체하는 Facade(퍼사드) 서비스.
 * 컨트롤러와 타 서비스의 의존성 파괴를 막기 위해 기존 인터페이스를 그대로 유지하고,
 * 실제 처리는 거래소별 전용 서비스(Bitget, Binance, CoinGecko, Bithumb)로 위임합니다.
 */
@Slf4j
@Service
public class CoinMarketService extends AbstractMarketService {

    private final BitgetMarketService bitgetMarketService;
    private final BinanceMarketService binanceMarketService;
    private final CoinGeckoMarketService coinGeckoMarketService;
    private final BithumbMarketService bithumbMarketService;
    private final KrwMarketService krwMarketService;

    public CoinMarketService(
            BitgetMarketService bitgetMarketService,
            BinanceMarketService binanceMarketService,
            CoinGeckoMarketService coinGeckoMarketService,
            BithumbMarketService bithumbMarketService,
            KrwMarketService krwMarketService) {
        this.bitgetMarketService = bitgetMarketService;
        this.binanceMarketService = binanceMarketService;
        this.coinGeckoMarketService = coinGeckoMarketService;
        this.bithumbMarketService = bithumbMarketService;
        this.krwMarketService = krwMarketService;
    }

    // ============================================================
    // KRW 마켓 리스트 위임(업비트/빗썸 — 서버 캐시 집약)
    // ============================================================
    public Object getUpbitTickers() {
        return krwMarketService.getUpbitTickers();
    }

    public Object getBithumbTickers() {
        return krwMarketService.getBithumbTickers();
    }

    public Object getUpbitCandles(String granularity, String symbol, int count, Long to) {
        return krwMarketService.getUpbitCandles(granularity, symbol, count, to);
    }

    public Object getBithumbCandles(String granularity, String symbol, int count, Long to) {
        return krwMarketService.getBithumbCandles(granularity, symbol, count, to);
    }

    // ============================================================
    // Bithumb 위임
    // ============================================================
    public Object getBithumbTicker(String orderCurrency, String paymentCurrency) {
        return bithumbMarketService.getBithumbTicker(orderCurrency, paymentCurrency);
    }

    // ============================================================
    // Bitget 위임
    // ============================================================
    public Object getTickers() {
        return bitgetMarketService.getTickers();
    }

    public Object getFuturesTickers(String productType) {
        return bitgetMarketService.getFuturesTickers(productType);
    }

    public Map<String, Double> getTickerPriceMap() {
        return bitgetMarketService.getTickerPriceMap();
    }

    public Object getCandles(String symbol, String granularity, String limit, String endTime, String productType) {
        return bitgetMarketService.getCandles(symbol, granularity, limit, endTime, productType);
    }

    // ============================================================
    // Binance 위임
    // ============================================================
    public Object getBinanceSpotTickers() {
        return binanceMarketService.getBinanceSpotTickers();
    }

    public Object getBinanceFuturesTickers() {
        return binanceMarketService.getBinanceFuturesTickers();
    }

    public Object getBinanceSpotTicker(String symbol) {
        return binanceMarketService.getBinanceSpotTicker(symbol);
    }

    public Object getBinanceFuturesTicker(String symbol) {
        return binanceMarketService.getBinanceFuturesTicker(symbol);
    }

    public Object getBinanceFuturesCandles(String symbol, String interval, String limit, String endTime) {
        return binanceMarketService.getBinanceFuturesCandles(symbol, interval, limit, endTime);
    }

    public Object getBinanceSpotCandles(String symbol, String interval, String limit, String endTime) {
        return binanceMarketService.getBinanceSpotCandles(symbol, interval, limit, endTime);
    }

    public Object getBinanceFuturesDepth(String symbol, String limit) {
        return binanceMarketService.getBinanceFuturesDepth(symbol, limit);
    }

    public Object getBinanceSpotDepth(String symbol, String limit) {
        return binanceMarketService.getBinanceSpotDepth(symbol, limit);
    }

    // ============================================================
    // CoinGecko 위임
    // ============================================================
    public Object getExtraStats(String ticker) {
        return coinGeckoMarketService.getExtraStats(ticker);
    }

    public Map<String, String> getLogos() {
        return coinGeckoMarketService.getLogos();
    }

    // ============================================================
    // 다중 거래소 통합 로직 (Price Precision)
    // ============================================================
    private static final int PRECISION_TTL_SECONDS = 3600;
    private static final int PRECISION_RETRY_SECONDS = 60;

    /** 조회 결과 + stale 여부(guard가 차단·실패로 마지막 값을 돌려준 경우 true → 성공 TTL로 재캐시하지 않음). */
    record PrecisionPart(Map<String, Integer> map, boolean stale) {}

    private static final long PRECISION_TOTAL_TIMEOUT_SECONDS = 10; // 클라이언트 timeout 12초 안
    private final Map<String, Object> precisionLocks = new ConcurrentHashMap<>();

    /**
 * 가격 소수 자릿수 — 거래소·상품군별로 따로 캐시한다. 세 조회를 병렬로 돌리고 전체 10초 상한을 둔다
 * (예전엔 순차 5+5+10초라 클라이언트 12초 timeout을 넘길 수 있었다). 시간 초과·실패한 부분은 빈 Map(마지막 성공값 유지 규칙 그대로).
*/
    public Map<String, Integer> getPricePrecision() {
        List<CompletableFuture<Map<String, Integer>>> parts = List.of(
                CompletableFuture.supplyAsync(() -> precisionPart("price_precision_bitget_USDT-FUTURES", () -> loadBitgetPrecision("USDT-FUTURES"))),
                CompletableFuture.supplyAsync(() -> precisionPart("price_precision_bitget_USDC-FUTURES", () -> loadBitgetPrecision("USDC-FUTURES"))),
                CompletableFuture.supplyAsync(() -> precisionPart("price_precision_binance", this::loadBinancePrecision)));
        Map<String, Integer> result = new HashMap<>();
        for (CompletableFuture<Map<String, Integer>> f : parts) {
            try { result.putAll(f.get(PRECISION_TOTAL_TIMEOUT_SECONDS, TimeUnit.SECONDS)); }
            catch (Exception e) { log.warn("price-precision 부분 조회 실패/시간 초과: {}", e.toString()); }
        }
        return result;
    }

    /**
 * 거래소·상품군 단위 캐시. 빈 결과(실패)는 마지막 성공값이 있으면 그것을 유지하고 60초 뒤 재조회, 성공은 1시간.
 * stale(guard가 차단·실패로 마지막 값을 돌려줌)도 60초 — '새 성공'으로 1시간 굳지 않게.
 * 키별 lock — 같은 키의 실패 요청이 prev를 읽은 뒤 성공 요청의 새 값을 되돌리지 않게 갱신을 직렬화하되, 키가 다르면 병렬.
*/
    @SuppressWarnings("unchecked")
    private Map<String, Integer> precisionPart(String cacheKey, java.util.function.Supplier<PrecisionPart> loader) {
        synchronized (precisionLocks.computeIfAbsent(cacheKey, k -> new Object())) {
            if (isCacheValid(cacheKey)) {
                return (Map<String, Integer>) cache.get(cacheKey);
            }
            PrecisionPart loaded = loader.get();
            Map<String, Integer> part = loaded.map();
            if (part.isEmpty()) {
                Object prev = cache.get(cacheKey); // 만료됐지만 남아 있는 마지막 성공값
                if (prev instanceof Map<?, ?> m && !m.isEmpty()) part = (Map<String, Integer>) prev;
                putCache(cacheKey, part, PRECISION_RETRY_SECONDS);
                return part;
            }
            putCache(cacheKey, part, loaded.stale() ? PRECISION_RETRY_SECONDS : PRECISION_TTL_SECONDS);
            return part;
        }
    }

    /** Bitget futures contracts(productType 하나) → pricePlace */
    private PrecisionPart loadBitgetPrecision(String productType) {
        Map<String, Integer> result = new HashMap<>();
        {
            try {
                Object data = bitgetMarketService.getClient().get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/api/v2/mix/market/contracts")
                                .queryParam("productType", productType)
                                .build())
                        .retrieve()
                        .bodyToMono(Object.class)
                        .block(Duration.ofSeconds(5));

                if (data instanceof Map<?, ?> root) {
                    Object dataField = ((Map<?, ?>) root).get("data");
                    if (dataField instanceof List<?> rows) {
                        for (Object row : rows) {
                            if (!(row instanceof Map<?, ?> map)) continue;
                            Object symObj = map.get("symbol");
                            Object pricePlace = map.get("pricePlace");
                            if (symObj == null || pricePlace == null) continue;
                            String symbol = symObj.toString();
                            if (!symbol.isEmpty()) {
                                result.put(symbol, Integer.parseInt(pricePlace.toString()));
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Bitget contracts 조회 실패: productType={}, error={}", productType, e.getMessage());
            }
        }

        return new PrecisionPart(result, false);
    }

    /** Binance futures exchangeInfo → PRICE_FILTER tickSize (guard 경유, 차단 중 raw 호출 금지) */
    private PrecisionPart loadBinancePrecision() {
        Map<String, Integer> result = new HashMap<>();
        boolean stale = false;
        try {
            BinanceRestGuard.Result meta = binanceMarketService.getBinanceFuturesExchangeInfoWithMeta(); // guard 경유 — 차단 중 raw 호출 금지
            stale = meta.stale();
            Object data = meta.data();

            if (data instanceof Map<?, ?> root) {
                Object symbolsField = ((Map<?, ?>) root).get("symbols");
                if (symbolsField instanceof List<?> symbols) {
                    for (Object s : symbols) {
                        if (!(s instanceof Map<?, ?> sMap)) continue;
                        Object symObj = sMap.get("symbol");
                        if (symObj == null) continue;
                        String symbol = symObj.toString();
                        Object filters = sMap.get("filters");
                        if (symbol.isEmpty() || !(filters instanceof List<?>)) continue;
                        for (Object f : (List<?>) filters) {
                            if (!(f instanceof Map<?, ?> fMap)) continue;
                            if (!"PRICE_FILTER".equals(fMap.get("filterType"))) continue;
                            Object tsObj = fMap.get("tickSize");
                            String tickSize = tsObj != null ? tsObj.toString() : "";
                            if (!tickSize.isEmpty()) {
                                result.put("BN_" + symbol, tickSizeToDecimals(tickSize));
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Binance futures exchangeInfo 조회 실패: {}", e.getMessage());
        }

        return new PrecisionPart(result, stale);
    }

    private int tickSizeToDecimals(String tickSize) {
        String stripped = tickSize.replaceAll("0+$", "");
        int dot = stripped.indexOf('.');
        return dot == -1 ? 0 : stripped.length() - dot - 1;
    }
}
