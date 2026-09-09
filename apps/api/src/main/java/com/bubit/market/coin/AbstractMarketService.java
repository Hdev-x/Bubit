package com.bubit.market.coin;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * [클래스 읽기] 캐싱(TTL) 공통 로직을 처리하는 추상 클래스.
 * ConcurrentHashMap을 사용해 멀티스레드 환경에서 안전하게 인메모리 캐싱을 수행합니다.
 */
public abstract class AbstractMarketService {

    /** 캐시 저장소: key → 응답 데이터 (Object) */
    protected final Map<String, Object> cache = new ConcurrentHashMap<>();

    /** 캐시 만료 시각 저장: key → 만료 Unix 밀리초 */
    protected final Map<String, Long> cacheExpiry = new ConcurrentHashMap<>();

    /**
     * 해당 캐시 키가 아직 유효한지 확인한다.
     * @param key 캐시 키
     * @return true = 캐시 사용 가능, false = 재조회 필요
     */
    protected boolean isCacheValid(String key) {
        Long expiry = cacheExpiry.get(key);
        return expiry != null && expiry > System.currentTimeMillis();
    }

    /**
     * 캐시에 데이터를 저장하고 만료 시각을 기록한다.
     * @param key     캐시 키
     * @param data    저장할 응답 데이터
     * @param seconds 캐시 유효 시간 (초 단위)
     */
    protected void putCache(String key, Object data, int seconds) {
        long now = System.currentTimeMillis();
        cache.put(key, data);
        cacheExpiry.put(key, now + (seconds * 1000L));
        if (cache.size() > MAX_ENTRIES) evict(now);
    }

    /** 항목 수 상한 — 캔들 페이징 키(symbol·count·to)가 무한히 쌓이지 않게. BinanceRestGuard.put과 같은 규칙.*/
    static final int MAX_ENTRIES = 1_000;

    /** 만료 항목을 지우고, 그래도 많으면 만료 시각이 이른 순으로 3/4 크기까지 줄인다. */
    private synchronized void evict(long now) {
        for (Map.Entry<String, Long> e : cacheExpiry.entrySet()) {
            if (e.getValue() <= now) { cache.remove(e.getKey()); cacheExpiry.remove(e.getKey()); }
        }
        int drop = cache.size() - MAX_ENTRIES * 3 / 4;
        if (drop <= 0) return;
        cacheExpiry.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .limit(drop)
                .map(Map.Entry::getKey)
                .toList()
                .forEach(k -> { cache.remove(k); cacheExpiry.remove(k); });
    }
}
