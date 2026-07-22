package com.tip.patterns.insidebar;

import com.tip.market.model.Candle;
import com.tip.patterns.model.PatternDirection;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InsideBarDetectorTest {

    @Test
    void detectsLongBreakOfMother() {
        List<Candle> series = baseSeries();
        long t = series.get(series.size() - 1).time() + 300;
        // mother wide
        series.add(new Candle(t, 100, 110, 95, 102, 1000));
        // inside
        series.add(new Candle(t + 300, 101, 108, 97, 103, 800));
        // break above mother high 110
        series.add(new Candle(t + 600, 109, 112, 108, 111, 1200));

        var det = InsideBarDetector.tryDetect(
                "NSE_EQ|X", "5m", series, false, InsideBarConfig.defaults(), Instant.now());
        assertTrue(det.isPresent());
        assertEquals(PatternType.INSIDE_BAR, det.get().patternType());
        assertEquals(PatternDirection.LONG, det.get().direction());
        assertEquals(95.0, det.get().stopLevel(), 1e-9);
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
