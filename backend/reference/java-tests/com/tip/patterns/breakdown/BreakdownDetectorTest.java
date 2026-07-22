package com.tip.patterns.breakdown;

import com.tip.market.model.Candle;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.ConfirmationMode;
import com.tip.patterns.model.PatternDirection;
import com.tip.patterns.model.PatternStage;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BreakdownDetectorTest {

    private static final Instant NOW = Instant.parse("2026-07-13T10:00:00Z");

    @Test
    void detectsCloseBelowPriorDonchianLow() {
        List<Candle> series = fallingSeries(25, 120);
        Optional<ActivePattern> det = BreakdownDetector.tryDetect(
                "NSE_EQ|X", "5m", series, Double.POSITIVE_INFINITY, false,
                BreakdownConfig.defaults(), NOW);

        assertTrue(det.isPresent());
        ActivePattern p = det.get();
        assertEquals(PatternStage.DETECTED, p.status());
        assertEquals(PatternType.BREAKDOWN, p.patternType());
        assertEquals(PatternDirection.SHORT, p.direction());
        assertTrue(p.entryPrice() < p.referenceLevel());
        assertEquals(p.referenceLevel() - 2 * p.atrAtDetect(), p.targetLevel(), 1e-6);
    }

    @Test
    void rejectsWhenCloseNotBelowReference() {
        List<Candle> series = flatThenRally(25);
        Optional<ActivePattern> det = BreakdownDetector.tryDetect(
                "S", "5m", series, Double.POSITIVE_INFINITY, false,
                BreakdownConfig.defaults(), NOW);
        assertTrue(det.isEmpty());
    }

    @Test
    void antiSpamBlocksEqualOrHigherReference() {
        List<Candle> series = fallingSeries(25, 120);
        Optional<ActivePattern> first = BreakdownDetector.tryDetect(
                "S", "5m", series, Double.POSITIVE_INFINITY, false,
                BreakdownConfig.defaults(), NOW);
        assertTrue(first.isPresent());
        double ref = first.get().referenceLevel();

        Optional<ActivePattern> second = BreakdownDetector.tryDetect(
                "S", "5m", series, ref, false,
                BreakdownConfig.defaults(), NOW);
        assertTrue(second.isEmpty());
    }

    @Test
    void indexUsesCloseFallback() {
        List<Candle> series = zeroVolume(fallingSeries(25, 120));
        Optional<ActivePattern> det = BreakdownDetector.tryDetect(
                "NSE_INDEX|Nifty 50", "5m", series, Double.POSITIVE_INFINITY, true,
                BreakdownConfig.defaults(), NOW);
        assertTrue(det.isPresent());
        assertEquals(ConfirmationMode.CLOSE_FALLBACK, det.get().confirmationModeUsed());
        assertFalse(det.get().volumeOkAtDetect());
    }

    @Test
    void insufficientHistoryReturnsEmpty() {
        List<Candle> shortSeries = fallingSeries(10, 120);
        assertTrue(BreakdownDetector.tryDetect(
                "S", "5m", shortSeries, Double.POSITIVE_INFINITY, false,
                BreakdownConfig.defaults(), NOW).isEmpty());
    }

    /** Falling closes so each bar breaks prior window lows. */
    static List<Candle> fallingSeries(int n, double start) {
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double c = start - i;
            bars.add(new Candle(i, c + 0.5, c + 0.6, c - 0.2, c, 1000 + i * 10L));
        }
        return bars;
    }

    static List<Candle> flatThenRally(int n) {
        List<Candle> bars = new ArrayList<>();
        for (int i = 0; i < n - 1; i++) {
            bars.add(new Candle(i, 100, 101, 99, 100, 1000));
        }
        bars.add(new Candle(n - 1, 100, 102, 99.5, 101, 1000));
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
