package com.tip.patterns.consolidation;

import com.tip.market.model.Candle;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.ConfirmationMode;
import com.tip.patterns.model.FinalOutcome;
import com.tip.patterns.model.PatternDirection;
import com.tip.patterns.model.PatternStage;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConsolidationLifecycleTest {

    private final ConsolidationConfig config = ConsolidationConfig.defaults();
    private final Instant now = Instant.parse("2026-07-15T10:00:00Z");

    @Test
    void expansionSucceeds() {
        ActivePattern p = openConsol(100, 98); // high 100 low 98
        List<Candle> series = base();
        Candle breakout = new Candle(9_000L, 99.5, 101, 99, 100.5, 100);
        series.add(breakout);
        ConsolidationLifecycle.onCandle(p, breakout, series, config, now);
        assertTrue(p.isTerminal());
        assertEquals(FinalOutcome.SUCCEEDED, p.finalOutcome());
    }

    @Test
    void rollingWindowRangeComputes() {
        List<Candle> series = new ArrayList<>();
        series.add(new Candle(1, 10, 12, 9, 11, 1));
        series.add(new Candle(2, 11, 13, 10, 12, 1));
        series.add(new Candle(3, 12, 12.5, 11.5, 12, 1));
        var r = ConsolidationLifecycle.rollingWindowRange(series, 3);
        assertTrue(r.isPresent());
        assertEquals(4.0, r.getAsDouble(), 1e-9); // 13 - 9
    }

    private static List<Candle> base() {
        List<Candle> list = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            list.add(new Candle(1_000L + i, 99, 99.5, 98.5, 99, 100));
        }
        return list;
    }

    private ActivePattern openConsol(double rangeHigh, double rangeLow) {
        return ActivePattern.builder()
                .id(UUID.randomUUID())
                .patternType(PatternType.CONSOLIDATION)
                .symbolId("NSE_EQ|X")
                .timeframe("5m")
                .direction(PatternDirection.LONG)
                .status(PatternStage.DETECTED)
                .confirmationModeUsed(ConfirmationMode.CLOSE)
                .referenceLevel(rangeLow)
                .lookbackHigh(rangeHigh)
                .atrAtDetect(2)
                .entryPrice((rangeHigh + rangeLow) / 2)
                .stopLevel(rangeLow)
                .targetLevel(rangeHigh)
                .detectCandleTime(1_000L)
                .detectedAt(now)
                .mfePrice(rangeHigh - 0.1)
                .maePrice(rangeLow + 0.1)
                .durationCandles(1)
                .detectorVersion("consolidation-v1")
                .build();
    }
}
