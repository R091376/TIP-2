package com.tip.market;

import com.tip.market.model.Candle;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MarketSeedMergerTest {

    @Test
    void intradayOverridesHistoricalForSameTimestamp() {
        List<Candle> historical = List.of(
                new Candle(1000L, 10.0, 11.0, 9.5, 10.0, 100L),
                new Candle(2000L, 20.0, 21.0, 19.5, 20.0, 200L)
        );
        List<Candle> intraday = List.of(
                new Candle(2000L, 20.5, 21.5, 19.0, 20.5, 250L),
                new Candle(3000L, 30.0, 31.0, 29.5, 30.0, 300L)
        );

        List<Candle> merged = MarketSeedMerger.merge(historical, intraday);

        assertEquals(3, merged.size());
        assertEquals(20.5, merged.get(1).close());
        assertEquals(250L, merged.get(1).volume());
    }
}