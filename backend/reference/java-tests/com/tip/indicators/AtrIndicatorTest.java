package com.tip.indicators;

import com.tip.market.model.Candle;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AtrIndicatorTest {

    @Test
    void emptyWhenInsufficientBars() {
        List<Candle> bars = flatBars(14, 100.0);
        assertTrue(AtrIndicator.latest(bars, 14).isEmpty());
    }

    @Test
    void computesWilderAtrOnSimpleSeries() {
        // 15 bars: first TR uses bars 1..14 vs prior closes → SMA TR = 1.0 if high-low=1 always and no gaps
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < 15; i++) {
            double base = 100 + i;
            bars.add(new Candle(i, base, base + 1, base, base + 0.5, 1000));
        }
        double atr = AtrIndicator.latest(bars, 14).orElseThrow();
        assertTrue(atr > 0);
        // True range is at least high-low = 1; with rising closes TR often > 1
        assertTrue(atr >= 1.0);
    }

    @Test
    void trueRangeUsesPriorClose() {
        Candle prev = new Candle(1, 10, 10, 10, 10, 0);
        Candle gapUp = new Candle(2, 15, 16, 14, 15, 0);
        // TR = max(2, |16-10|, |14-10|) = 6
        assertEquals(6.0, AtrIndicator.trueRange(gapUp, prev.close()), 1e-9);
    }

    private static List<Candle> flatBars(int n, double price) {
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            bars.add(new Candle(i, price, price, price, price, 0));
        }
        return bars;
    }
}
