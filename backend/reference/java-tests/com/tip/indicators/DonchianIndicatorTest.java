package com.tip.indicators;

import com.tip.market.model.Candle;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DonchianIndicatorTest {

    @Test
    void priorHighestHighExcludesSignalBar() {
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            bars.add(new Candle(i, 100, 100 + i, 99, 100, 0));
        }
        // highs 100..119
        bars.add(new Candle(20, 200, 250, 200, 240, 0)); // signal bar spike

        double prior = DonchianIndicator.priorHighestHigh(bars, 20).orElseThrow();
        assertEquals(119.0, prior, 1e-9);

        double including = DonchianIndicator.highestHigh(bars, 20).orElseThrow();
        // last 20 bars are indices 1..20 with highs 101..119 and 250
        assertEquals(250.0, including, 1e-9);
    }

    @Test
    void priorHighestHighNeedsPeriodPlusOne() {
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            bars.add(new Candle(i, 1, 2, 1, 1.5, 0));
        }
        assertTrue(DonchianIndicator.priorHighestHigh(bars, 20).isEmpty());
    }

    @Test
    void lowestLowWindow() {
        List<Candle> bars = List.of(
                new Candle(1, 10, 11, 9, 10, 0),
                new Candle(2, 10, 12, 8, 10, 0),
                new Candle(3, 10, 13, 10, 11, 0)
        );
        assertEquals(8.0, DonchianIndicator.lowestLow(bars, 3).orElseThrow(), 1e-9);
        // prior 2 bars = indices 0..1, lows 9 and 8
        assertEquals(8.0, DonchianIndicator.priorLowestLow(bars, 2).orElseThrow(), 1e-9);
    }
}
