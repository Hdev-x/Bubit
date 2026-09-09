package com.bubit.market.coin;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * 공개 KRW 캔들 API(/coin/api/{upbit,bithumb}/candles) 입력 검증 .
 * 예전엔 count·symbol·to를 그대로 캐시 키에 넣어 count=0 같은 값이 상류 호출 없이 키만 무한히 남겼다.
 * 순수 함수 — 컨트롤러가 호출하고, 위반이면 IllegalArgumentException(→ 400).
*/
public final class KrwCandleParams {

    static final int MAX_COUNT = 1200;
    static final Pattern SYMBOL = Pattern.compile("^[A-Z0-9]{2,20}KRW$");
    /** web granularity 중 업비트·빗썸 v1이 지원하는 값(3Dutc는 둘 다 미지원). 6Hutc·12Hutc는 빗썸만. */
    static final Set<String> UPBIT_GRANULARITIES = Set.of("1min", "3min", "5min", "15min", "30min", "1h", "4h", "1Dutc", "1Wutc", "1Mutc");
    static final Set<String> BITHUMB_GRANULARITIES = Set.of("1min", "3min", "5min", "15min", "30min", "1h", "4h", "6Hutc", "12Hutc", "1Dutc", "1Wutc", "1Mutc");

    private KrwCandleParams() {}

    public static void validateUpbit(String symbol, String granularity, int count, Long to) {
        validate(symbol, granularity, count, to, UPBIT_GRANULARITIES);
    }

    public static void validateBithumb(String symbol, String granularity, int count, Long to) {
        validate(symbol, granularity, count, to, BITHUMB_GRANULARITIES);
    }

    private static void validate(String symbol, String granularity, int count, Long to, Set<String> granularities) {
        if (symbol == null || !SYMBOL.matcher(symbol).matches()) throw new IllegalArgumentException("symbol");
        if (granularity == null || !granularities.contains(granularity)) throw new IllegalArgumentException("granularity");
        if (count < 1 || count > MAX_COUNT) throw new IllegalArgumentException("count 1~" + MAX_COUNT);
        if (to != null && to <= 0) throw new IllegalArgumentException("to");
    }
}
