package com.tip.patterns.structure;

import com.tip.market.model.Candle;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SwingPointsTest {

    @Test
    void detectsPivotHighWidth2() {
        List<Candle> bars = new ArrayList<>();
        // indices 0..6; pivot high at 3
        bars.add(c(100, 101, 99, 100));
        bars.add(c(100, 102, 99, 101));
        bars.add(c(101, 103, 100, 102));
        bars.add(c(102, 110, 101, 105)); // pivot high 110
        bars.add(c(105, 106, 100, 101));
        bars.add(c(101, 104, 100, 102));
        bars.add(c(102, 103, 100, 101));
        assertTrue(SwingPoints.isPivotHigh(bars, 3, 2));
        assertFalse(SwingPoints.isPivotHigh(bars, 2, 2));
    }

    private static Candle c(double o, double h, double l, double cl) {
        return new Candle(1L, o, h, l, cl, 1);
    }
}
