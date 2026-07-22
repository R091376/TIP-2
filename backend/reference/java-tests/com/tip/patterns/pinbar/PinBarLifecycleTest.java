package com.tip.patterns.pinbar;

import com.tip.market.model.Candle;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.ConfirmationMode;
import com.tip.patterns.model.FinalOutcome;
import com.tip.patterns.model.PatternDirection;
import com.tip.patterns.model.PatternStage;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PinBarLifecycleTest {

    private final PinBarConfig config = PinBarConfig.defaults();
    private final Instant now = Instant.parse("2026-07-15T10:00:00Z");

    @Test
    void hammerFailsOnCloseBelowStop() {
        ActivePattern p = hammer(100, 98, 95, 2.0);
        Candle bad = new Candle(2_000L, 99, 99.5, 94, 94.5, 100);
        PinBarLifecycle.onCandle(p, bad, config, now);
        assertTrue(p.isTerminal());
        assertEquals(FinalOutcome.FAILED, p.finalOutcome());
    }

    @Test
    void hammerConfirmsAboveSignalHigh() {
        ActivePattern p = hammer(100, 98, 95, 2.0);
        // close > signal high 100, but high < target 101 so not Succeeded yet
        Candle hold = new Candle(2_000L, 100, 100.8, 99.5, 100.5, 100);
        List<?> events = PinBarLifecycle.onCandle(p, hold, config, now);
        assertTrue(p.flagConfirmed());
        assertEquals(PatternStage.CONFIRMED, p.status());
        assertTrue(events.size() >= 1);
    }

    @Test
    void hammerSucceedsAtTarget() {
        ActivePattern p = hammer(100, 98, 95, 2.0);
        // target = 98 + 1.5*2 = 101
        Candle win = new Candle(2_000L, 100, 102, 99, 101.5, 100);
        PinBarLifecycle.onCandle(p, win, config, now);
        assertTrue(p.isTerminal());
        assertEquals(FinalOutcome.SUCCEEDED, p.finalOutcome());
    }

    private ActivePattern hammer(double signalHigh, double entry, double stop, double atr) {
        double target = entry + config.successAtrMult() * atr;
        return ActivePattern.builder()
                .id(UUID.randomUUID())
                .patternType(PatternType.HAMMER)
                .symbolId("NSE_EQ|X")
                .timeframe("5m")
                .direction(PatternDirection.LONG)
                .status(PatternStage.DETECTED)
                .confirmationModeUsed(ConfirmationMode.CLOSE)
                .referenceLevel(stop)
                .lookbackHigh(signalHigh)
                .atrAtDetect(atr)
                .entryPrice(entry)
                .stopLevel(stop)
                .targetLevel(target)
                .detectCandleTime(1_000L)
                .detectedAt(now)
                .mfePrice(signalHigh)
                .maePrice(stop)
                .durationCandles(1)
                .detectorVersion("pinbar-v1")
                .build();
    }
}
