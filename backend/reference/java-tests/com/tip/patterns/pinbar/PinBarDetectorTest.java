package com.tip.patterns.pinbar;

import com.tip.market.model.Candle;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PinBarDetectorTest {

    @Test
    void detectsHammerWithDownContext() {
        List<Candle> series = descendingThenHammer();
        Optional<ActivePattern> det = PinBarDetector.tryDetect(
                "NSE_EQ|TEST", "5m", series, false, PinBarConfig.defaults(), Instant.parse("2026-07-15T10:00:00Z"));
        assertTrue(det.isPresent());
        assertEquals(PatternType.HAMMER, det.get().patternType());
        assertEquals(series.get(series.size() - 1).low(), det.get().stopLevel(), 1e-9);
    }

    @Test
    void skipsWhenPinBarAlreadyOpen() {
        List<Candle> series = descendingThenHammer();
        Optional<ActivePattern> det = PinBarDetector.tryDetect(
                "NSE_EQ|TEST", "5m", series, true, PinBarConfig.defaults(), Instant.now());
        assertTrue(det.isEmpty());
    }

    /** ~20 bars drifting down, then a classic hammer. */
    private static List<Candle> descendingThenHammer() {
        List<Candle> list = new ArrayList<>();
        long t = 1_000_000L;
        double px = 120;
        for (int i = 0; i < 20; i++) {
            double o = px;
            double c = px - 0.8;
            list.add(new Candle(t, o, o + 0.3, c - 0.2, c, 1000));
            px = c;
            t += 300;
        }
        // Hammer: long lower wick
        double open = px;
        double close = px + 0.4;
        double high = close + 0.1;
        double low = open - 3.0;
        list.add(new Candle(t, open, high, low, close, 2000));
        return list;
    }
}
