package com.tip.patterns.breakout;

import com.tip.market.model.Candle;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.ConfirmationMode;
import com.tip.patterns.model.PatternStage;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BreakoutDetectorTest {

    private static final Instant NOW = Instant.parse("2026-07-13T10:00:00Z");

    @Test
    void detectsCloseAbovePriorDonchian() {
        List<Candle> series = risingSeries(25, 100);
        // last bar already close above prior highs in rising series
        Optional<ActivePattern> det = BreakoutDetector.tryDetect(
                "NSE_EQ|X", "5m", series, Double.NEGATIVE_INFINITY, false,
                BreakoutConfig.defaults(), NOW);

        assertTrue(det.isPresent());
        ActivePattern p = det.get();
        assertEquals(PatternStage.DETECTED, p.status());
        assertTrue(p.entryPrice() > p.referenceLevel());
        assertEquals(p.referenceLevel() + 2 * p.atrAtDetect(), p.targetLevel(), 1e-6);
    }

    @Test
    void rejectsWhenCloseNotAboveReference() {
        List<Candle> series = flatThenDip(25);
        Optional<ActivePattern> det = BreakoutDetector.tryDetect(
                "S", "5m", series, Double.NEGATIVE_INFINITY, false,
                BreakoutConfig.defaults(), NOW);
        assertTrue(det.isEmpty());
    }

    @Test
    void antiSpamBlocksEqualOrLowerReference() {
        List<Candle> series = risingSeries(25, 100);
        Optional<ActivePattern> first = BreakoutDetector.tryDetect(
                "S", "5m", series, Double.NEGATIVE_INFINITY, false,
                BreakoutConfig.defaults(), NOW);
        assertTrue(first.isPresent());
        double ref = first.get().referenceLevel();

        Optional<ActivePattern> second = BreakoutDetector.tryDetect(
                "S", "5m", series, ref, false,
                BreakoutConfig.defaults(), NOW);
        assertTrue(second.isEmpty());
    }

    @Test
    void indexUsesCloseFallback() {
        List<Candle> series = risingSeries(25, 100);
        // zero volumes
        series = zeroVolume(series);
        Optional<ActivePattern> det = BreakoutDetector.tryDetect(
                "NSE_INDEX|Nifty 50", "5m", series, Double.NEGATIVE_INFINITY, true,
                BreakoutConfig.defaults(), NOW);
        assertTrue(det.isPresent());
        assertEquals(ConfirmationMode.CLOSE_FALLBACK, det.get().confirmationModeUsed());
        assertFalse(det.get().volumeOkAtDetect());
    }

    @Test
    void insufficientHistoryReturnsEmpty() {
        List<Candle> shortSeries = risingSeries(10, 100);
        assertTrue(BreakoutDetector.tryDetect(
                "S", "5m", shortSeries, Double.NEGATIVE_INFINITY, false,
                BreakoutConfig.defaults(), NOW).isEmpty());
    }

    /** Rising closes so each bar breaks prior window highs. */
    static List<Candle> risingSeries(int n, double start) {
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double c = start + i;
            bars.add(new Candle(i, c - 0.5, c + 0.2, c - 0.6, c, 1000 + i * 10L));
        }
        return bars;
    }

    static List<Candle> flatThenDip(int n) {
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < n - 1; i++) {
            bars.add(new Candle(i, 100, 101, 99, 100, 1000));
        }
        bars.add(new Candle(n - 1, 100, 100.5, 98, 99, 1000));
        return bars;
    }

    static List<Candle> zeroVolume(List<Candle> in) {
        List<Candle> out = new ArrayList<>();
        for (Candle c : in) {
            out.add(new Candle(c.time(), c.open(), c.high(), c.low(), c.close(), 0));
        }
        return out;
    }
}
