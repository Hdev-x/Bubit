package com.bubit.market.coin;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AbstractMarketServiceTest {
    @Test
    void 캐시는_상한을_넘으면_오래된_항목부터_지운다() {
        AbstractMarketService s = new AbstractMarketService() {};
        for (int i = 0; i < AbstractMarketService.MAX_ENTRIES + 100; i++) s.putCache("k" + i, i, 60);
        assertTrue(s.cache.size() <= AbstractMarketService.MAX_ENTRIES, "정상 페이징 키도 무한히 쌓이지 않는다: " + s.cache.size());
        assertTrue(s.cacheExpiry.size() == s.cache.size(), "만료 맵도 같이 정리");
    }
}
