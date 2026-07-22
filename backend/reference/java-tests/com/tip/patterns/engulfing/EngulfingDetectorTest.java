package com.tip.patterns.engulfing;

import com.tip.market.model.Candle;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EngulfingDetectorTest {

    @Test
    void detectsBullishEngulfing() {
        List<Candle> series = baseSeries();
        // prior bearish, signal bullish engulf
        long t = series.get(series.size() - 1).time() + 300;
        series.add(new Candle(t, 105, 105.5, 100, 100.5, 1000)); // bearish-ish prior
        // fix prior to clear bearish
        series.set(series.size() - 1, new Candle(t, 105, 105.2, 100, 100.2, 1000));
        series.add(new Candle(t + 300, 100, 106, 99.5, 105.5, 2000)); // bullish engulf

        var det = EngulfingDetector.tryDetect(
                "NSE_EQ|X", "5m", series, false, EngulfingConfig.defaults(), Instant.now());
        assertTrue(det.isPresent());
        assertEquals(PatternType.BULLISH_ENGULFING, det.get().patternType());
    }

    @Test
    void geometryHelpers() {
        Candle prior = new Candle(1, 105, 106, 100, 100.5, 1);
        Candle signal = new Candle(2, 100, 107, 99, 106, 1);
        assertTrue(EngulfingDetector.isBullishEngulfing(prior, signal));
    }

    private static List<Candle> baseSeries() {
        List<Candle> list = new ArrayList<>();
        long t = 1_000_000L;
        double px = 100;
        for (int i = 0; i < 20; i++) {
            list.add(new Candle(t, px, px + 1, px - 1, px + 0.2, 500));
            px += 0.3;
            t += 300;
        }
        return list;
    }
}
