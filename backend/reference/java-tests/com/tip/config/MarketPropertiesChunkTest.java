package com.tip.config;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MarketPropertiesChunkTest {

    @Test
    void chunkDaysRespectUpstoxMaxRanges() {
        MarketProperties props = new MarketProperties(
                "Nifty 50",
                "NSE_INDEX|Nifty 50",
                "5m",
                List.of("1m", "5m", "15m", "1h", "4h", "1d"),
                30,
                Map.of(),
                false
        );

        // minutes 1–15 → max 1 month (~28–31 days)
        assertTrue(props.historicalChunkDaysFor("1m") <= 31);
        assertTrue(props.historicalChunkDaysFor("5m") <= 31);
        assertTrue(props.historicalChunkDaysFor("15m") <= 31,
                "15m chunk must be ≤1 month (Upstox UDAPI1148)");

        // hours → max 1 quarter
        assertTrue(props.historicalChunkDaysFor("1h") <= 92);
        assertTrue(props.historicalChunkDaysFor("4h") <= 92,
                "4h chunk must be ≤1 quarter (Upstox UDAPI1148)");
    }

    @Test
    void seedLogDetailDefaultsOff() {
        MarketProperties props = new MarketProperties(
                "Nifty 50",
                "NSE_INDEX|Nifty 50",
                "5m",
                List.of("5m"),
                30,
                Map.of(),
                null
        );
        assertFalse(props.seedLogDetailEnabled());
        assertTrue(new MarketProperties(
                "Nifty 50", "NSE_INDEX|Nifty 50", "5m", List.of("5m"), 30, Map.of(), true
        ).seedLogDetailEnabled());
    }
}
