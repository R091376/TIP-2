package com.tip.patterns.insidebar;

import com.tip.market.model.Candle;
import com.tip.patterns.model.PatternDirection;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InsideBarDelayedBreakTest {

    @Test
    void detectsBreakTwoBarsAfterInside() {
        List<Candle> series = baseSeries();
        long t = series.get(series.size() - 1).time() + 300;
        series.add(new Candle(t, 100, 110, 95, 102, 1000)); // mother
        series.add(new Candle(t + 300, 101, 108, 97, 103, 800)); // inside
        series.add(new Candle(t + 600, 103, 107, 102, 104, 700)); // still inside mother
        series.add(new Candle(t + 900, 104, 112, 103, 111, 1200)); // break

        var det = InsideBarDetector.tryDetect(
                "NSE_EQ|X", "5m", series, false, InsideBarConfig.defaults(), Instant.now());
        assertTrue(det.isPresent());
        assertEquals(PatternDirection.LONG, det.get().direction());
    }

    private static List<Candle> baseSeries() {
        List<Candle> list = new ArrayList<>();
        long t = 1_000_000L;
        double px = 100;
        for (int i = 0; i < 20; i++) {
            list.add(new Candle(t, px, px + 0.5, px - 0.5, px + 0.1, 500));
            px += 0.2;
            t += 300;
        }
        return list;
    }
}
