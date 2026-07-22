package com.tip.patterns.volumebreakout;

import com.tip.market.model.Candle;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VolumeBreakoutDetectorTest {

    @Test
    void detectsHighVolumeWideBar() {
        List<Candle> series = new ArrayList<>();
        long t = 1_000L;
        for (int i = 0; i < 25; i++) {
            series.add(new Candle(t, 100, 101, 99, 100.2, 1000));
            t += 300;
        }
        // Huge volume + wide range
        series.add(new Candle(t, 100, 108, 99, 107, 5000));

        var det = VolumeBreakoutDetector.tryDetect(
                "NSE_EQ|X",
                "5m",
                series,
                false,
                false,
                VolumeBreakoutConfig.defaults(),
                Instant.now());
        assertTrue(det.isPresent());
        assertEquals(PatternType.VOLUME_BREAKOUT, det.get().patternType());
    }

    @Test
    void skipsIndexSegment() {
        List<Candle> series = new ArrayList<>();
        long t = 1_000L;
        for (int i = 0; i < 25; i++) {
            series.add(new Candle(t, 100, 101, 99, 100.2, 1000));
            t += 300;
        }
        series.add(new Candle(t, 100, 108, 99, 107, 5000));
        assertTrue(VolumeBreakoutDetector.tryDetect(
                "NSE_INDEX|Nifty 50", "5m", series, false, true,
                VolumeBreakoutConfig.defaults(), Instant.now()).isEmpty());
    }
}
