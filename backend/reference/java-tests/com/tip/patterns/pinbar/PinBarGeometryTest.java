package com.tip.patterns.pinbar;

import com.tip.market.model.Candle;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PinBarGeometryTest {

    private final PinBarConfig config = PinBarConfig.defaults();

    @Test
    void classifiesHammer() {
        // low=90, open=98, close=100, high=100.5 → long lower wick, small upper
        Candle c = new Candle(1_000L, 98, 100.5, 90, 100, 1000);
        double atr = 5.0; // range 10.5 >= 0.5*5
        assertEquals(PinBarGeometry.Kind.HAMMER, PinBarGeometry.classify(c, atr, config).orElseThrow());
    }

    @Test
    void classifiesShootingStar() {
        Candle c = new Candle(1_000L, 100, 110, 99.5, 100.5, 1000);
        double atr = 5.0;
        assertEquals(PinBarGeometry.Kind.SHOOTING_STAR, PinBarGeometry.classify(c, atr, config).orElseThrow());
    }

    @Test
    void rejectsLargeBody() {
        // Full-range body
        Candle c = new Candle(1_000L, 90, 100, 90, 100, 1000);
        assertTrue(PinBarGeometry.classify(c, 5.0, config).isEmpty());
    }

    @Test
    void rejectsTinyRangeVsAtr() {
        Candle c = new Candle(1_000L, 100, 100.2, 99.8, 100.1, 1000);
        assertTrue(PinBarGeometry.classify(c, 10.0, config).isEmpty());
    }
}
