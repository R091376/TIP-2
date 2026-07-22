package com.tip.patterns.consolidation;

import com.tip.market.model.Candle;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConsolidationDetectorTest {

    @Test
    void detectsTightRangeWindow() {
        List<Candle> series = new ArrayList<>();
        long t = 1_000L;
        // Wide history for ATR
        for (int i = 0; i < 20; i++) {
            series.add(new Candle(t, 100, 108, 92, 100, 1000));
            t += 300;
        }
        // 10 tight bars range ~2 vs large ATR from history
        for (int i = 0; i < 10; i++) {
            series.add(new Candle(t, 100, 100.8, 99.5, 100.2, 500));
            t += 300;
        }

        var det = ConsolidationDetector.tryDetect(
                "NSE_EQ|X", "5m", series, false, ConsolidationConfig.defaults(), Instant.now());
        assertTrue(det.isPresent());
        assertEquals(PatternType.CONSOLIDATION, det.get().patternType());
    }
}
