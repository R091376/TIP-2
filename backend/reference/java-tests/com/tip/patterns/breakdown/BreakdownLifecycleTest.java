package com.tip.patterns.breakdown;

import com.tip.market.model.Candle;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.ConfirmationMode;
import com.tip.patterns.model.FinalOutcome;
import com.tip.patterns.model.PatternDirection;
import com.tip.patterns.model.PatternStage;
import com.tip.patterns.model.PatternStageEvent;
import com.tip.patterns.model.PatternType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BreakdownLifecycleTest {

    private static final Instant NOW = Instant.parse("2026-07-13T10:00:00Z");
    private static final BreakdownConfig CFG = BreakdownConfig.defaults();

    @Test
    void failsWhenCloseBackAboveReference() {
        ActivePattern p = openAt(100, 100, 2.0, 99, ConfirmationMode.CLOSE);
        Candle bar = new Candle(2, 100, 102, 99, 101, 1000);

        List<PatternStageEvent> events = BreakdownLifecycle.onCandle(p, bar, CFG, NOW);

        assertEquals(1, events.size());
        assertEquals(PatternStage.FAILED, events.get(0).stage());
        assertTrue(p.isTerminal());
        assertEquals(FinalOutcome.FAILED, p.finalOutcome());
    }

    @Test
    void succeedsWhenLowReachesAtrTargetWithoutConfirm() {
        // target = 100 - 2*2 = 96
        ActivePattern p = openAt(100, 100, 2.0, 98, ConfirmationMode.BOTH);
        Candle bar = new Candle(2, 98, 99, 95, 96, 1000);

        List<PatternStageEvent> events = BreakdownLifecycle.onCandle(p, bar, CFG, NOW);

        assertEquals(PatternStage.SUCCEEDED, events.get(0).stage());
        assertEquals(FinalOutcome.SUCCEEDED, p.finalOutcome());
        assertFalse(p.flagConfirmed());
    }

    @Test
    void failedBeatsSucceededSameBar() {
        ActivePattern p = openAt(100, 100, 2.0, 98, ConfirmationMode.CLOSE);
        // low clears target 96 but close invalidates above ref
        Candle bar = new Candle(2, 98, 102, 95, 101, 1000);

        List<PatternStageEvent> events = BreakdownLifecycle.onCandle(p, bar, CFG, NOW);

        assertEquals(1, events.size());
        assertEquals(PatternStage.FAILED, events.get(0).stage());
    }

    @Test
    void closeModeConfirmsOnLaterBarStillBelow() {
        ActivePattern p = openAt(100, 100, 2.0, 99, ConfirmationMode.CLOSE);
        Candle later = new Candle(2, 99, 99.5, 98.5, 98.8, 1000);

        List<PatternStageEvent> events = BreakdownLifecycle.onCandle(p, later, CFG, NOW);

        assertTrue(p.flagConfirmed());
        assertTrue(events.stream().anyMatch(e -> e.stage() == PatternStage.CONFIRMED));
        // same bar may also retest (high in band) or strengthen — status never demotes
        assertTrue(
                p.status() == PatternStage.CONFIRMED
                        || p.status() == PatternStage.RETESTED
                        || p.status() == PatternStage.STRENGTHENED
        );
    }

    @Test
    void closeModeDoesNotConfirmOnDetectBar() {
        ActivePattern p = openAt(100, 100, 2.0, 99, ConfirmationMode.CLOSE);
        Candle detectBar = new Candle(1, 100, 100, 98, 99, 5000);

        List<PatternStageEvent> events = BreakdownLifecycle.onCandle(p, detectBar, CFG, NOW);

        assertFalse(p.flagConfirmed());
        assertTrue(events.isEmpty());
    }

    @Test
    void volumeModeConfirmsOnDetectBarWhenVolumeOk() {
        ActivePattern p = ActivePattern.builder()
                .id(UUID.randomUUID())
                .patternType(PatternType.BREAKDOWN)
                .symbolId("S")
                .timeframe("5m")
                .direction(PatternDirection.SHORT)
                .status(PatternStage.DETECTED)
                .volumeOkAtDetect(true)
                .confirmationModeUsed(ConfirmationMode.VOLUME)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(2)
                .volumeAtDetect(5000)
                .entryPrice(99)
                .stopLevel(100)
                .targetLevel(96)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(100)
                .maePrice(98)
                .build();

        Candle detectBar = new Candle(1, 100, 100, 98, 99, 5000);
        List<PatternStageEvent> events = BreakdownLifecycle.onCandle(p, detectBar, CFG, NOW);

        assertTrue(p.flagConfirmed());
        assertEquals(PatternStage.CONFIRMED, events.get(0).stage());
    }

    @Test
    void bothModeNeedsVolumeOkAndLaterBar() {
        ActivePattern p = ActivePattern.builder()
                .patternType(PatternType.BREAKDOWN)
                .symbolId("S")
                .timeframe("5m")
                .direction(PatternDirection.SHORT)
                .volumeOkAtDetect(true)
                .confirmationModeUsed(ConfirmationMode.BOTH)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(2)
                .entryPrice(99)
                .stopLevel(100)
                .targetLevel(96)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(99)
                .maePrice(99)
                .build();

        assertTrue(BreakdownLifecycle.onCandle(p, new Candle(1, 99, 100, 98, 99, 5000), CFG, NOW).isEmpty());
        assertFalse(p.flagConfirmed());

        List<PatternStageEvent> events = BreakdownLifecycle.onCandle(
                p, new Candle(2, 99, 99.5, 98.5, 98.8, 1000), CFG, NOW);
        assertTrue(p.flagConfirmed());
        assertEquals(PatternStage.CONFIRMED, events.get(0).stage());
    }

    @Test
    void retestAndStrengthenUpdateFlagsWithoutDemotion() {
        ActivePattern p = ActivePattern.builder()
                .patternType(PatternType.BREAKDOWN)
                .symbolId("S")
                .timeframe("5m")
                .direction(PatternDirection.SHORT)
                .flagConfirmed(true)
                .confirmationModeUsed(ConfirmationMode.CLOSE)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(4)
                .entryPrice(99)
                .stopLevel(100)
                .targetLevel(92)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(99)
                .maePrice(99)
                .build();

        // Strengthen: low <= 100-4 = 96
        BreakdownLifecycle.onCandle(p, new Candle(2, 97, 98, 95, 96, 1000), CFG, NOW);
        assertTrue(p.flagStrengthened());
        assertEquals(PatternStage.STRENGTHENED, p.status());

        // Retest after strengthen: high in band (100 - 0.25*4 = 99), close <= ref
        BreakdownLifecycle.onCandle(p, new Candle(3, 99, 99.5, 98, 99, 1000), CFG, NOW);
        assertTrue(p.flagRetested());
        assertEquals(99.5, p.retestFloor());
        // high 99.5 < ref 100 — keep ATR target 92
        assertEquals(92.0, p.targetLevel(), 1e-9);
        assertEquals(PatternStage.STRENGTHENED, p.status());
    }

    @Test
    void retestAboveReferenceUpdatesMeasuredTarget() {
        ActivePattern p = ActivePattern.builder()
                .patternType(PatternType.BREAKDOWN)
                .symbolId("S")
                .timeframe("5m")
                .direction(PatternDirection.SHORT)
                .flagConfirmed(true)
                .confirmationModeUsed(ConfirmationMode.CLOSE)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(4)
                .entryPrice(99)
                .stopLevel(100)
                .targetLevel(92)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(99)
                .maePrice(99)
                .build();

        // high 100.5 within band? retestBand = 100 - 1 = 99; high 100.5 >= 99, close 99.8 <= 100
        BreakdownLifecycle.onCandle(p, new Candle(2, 99.5, 100.5, 99, 99.8, 1000), CFG, NOW);
        assertTrue(p.flagRetested());
        assertEquals(100.5, p.retestFloor());
        // risk = 0.5, target = 100 - 2*0.5 = 99
        assertEquals(99.0, p.targetLevel(), 1e-9);
    }

    @Test
    void updatesMfeMaeExtremes() {
        ActivePattern p = openAt(100, 100, 2.0, 99, ConfirmationMode.CLOSE);
        BreakdownLifecycle.onCandle(p, new Candle(2, 98, 105, 90, 95, 1000), CFG, NOW);
        // close 95 < ref → not failed; mfe=max high=105, mae=min low=90
        assertEquals(105.0, p.mfePrice());
        assertEquals(90.0, p.maePrice());
    }

    @Test
    void shortRMetricsUseDirectionAwareFormulas() {
        ActivePattern p = openAt(100, 100, 2.0, 99, ConfirmationMode.CLOSE);
        // end price via succeed path would set endPrice; set extremes manually
        p.setMfePrice(105); // adverse for short
        p.setMaePrice(90);  // favorable for short
        assertEquals((99 - 90) / 2.0, p.maxFavorableR(), 1e-9);
        assertEquals((105 - 99) / 2.0, p.maxAdverseR(), 1e-9);
    }

    private static ActivePattern openAt(
            double ref,
            double lookback,
            double atr,
            double entry,
            ConfirmationMode mode
    ) {
        return ActivePattern.builder()
                .id(UUID.randomUUID())
                .patternType(PatternType.BREAKDOWN)
                .symbolId("NSE_EQ|TEST")
                .timeframe("5m")
                .direction(PatternDirection.SHORT)
                .status(PatternStage.DETECTED)
                .volumeOkAtDetect(true)
                .confirmationModeUsed(mode)
                .referenceLevel(ref)
                .lookbackHigh(lookback)
                .atrAtDetect(atr)
                .volumeAtDetect(1000)
                .entryPrice(entry)
                .stopLevel(ref)
                .targetLevel(ref - 2 * atr)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(entry)
                .maePrice(entry)
                .build();
    }
}
