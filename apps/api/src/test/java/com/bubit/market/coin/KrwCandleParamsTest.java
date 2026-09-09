package com.bubit.market.coin;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class KrwCandleParamsTest {
    @Test
    void 정상_입력은_통과한다() {
        assertDoesNotThrow(() -> KrwCandleParams.validateUpbit("BTCKRW", "1h", 1200, null));
        assertDoesNotThrow(() -> KrwCandleParams.validateBithumb("XRPKRW", "6Hutc", 500, 1_700_000_000_000L));
        assertDoesNotThrow(() -> KrwCandleParams.validateBithumb("XRPKRW", "12Hutc", 300, null));
    }
    @Test
    void count_0이나_201_잘못된_symbol_granularity_to는_400이다() {
        assertThrows(IllegalArgumentException.class, () -> KrwCandleParams.validateUpbit("BTCKRW", "1h", 0, null));
        assertThrows(IllegalArgumentException.class, () -> KrwCandleParams.validateUpbit("BTCKRW", "1h", 1201, null));
        assertThrows(IllegalArgumentException.class, () -> KrwCandleParams.validateUpbit("btc", "1h", 10, null));
        assertThrows(IllegalArgumentException.class, () -> KrwCandleParams.validateUpbit("BTCKRW", "3Dutc", 10, null));
        assertThrows(IllegalArgumentException.class, () -> KrwCandleParams.validateUpbit("BTCKRW", "6Hutc", 10, null));
        assertThrows(IllegalArgumentException.class, () -> KrwCandleParams.validateUpbit("BTCKRW", "1h", 10, 0L));
        assertThrows(IllegalArgumentException.class, () -> KrwCandleParams.validateUpbit("BTC KRW; drop", "1h", 10, null));
    }
}
