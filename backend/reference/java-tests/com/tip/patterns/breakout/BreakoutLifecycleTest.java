package com.tip.patterns.breakout;

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

class BreakoutLifecycleTest {

    private static final Instant NOW = Instant.parse("2026-07-13T10:00:00Z");
    private static final BreakoutConfig CFG = BreakoutConfig.defaults();

    @Test
    void failsWhenCloseBackBelowReference() {
        ActivePattern p = openAt(100, 100, 2.0, 105, ConfirmationMode.CLOSE);
        Candle bar = new Candle(2, 99, 101, 98, 99, 1000);

        List<PatternStageEvent> events = BreakoutLifecycle.onCandle(p, bar, CFG, NOW);

        assertEquals(1, events.size());
        assertEquals(PatternStage.FAILED, events.get(0).stage());
        assertTrue(p.isTerminal());
        assertEquals(FinalOutcome.FAILED, p.finalOutcome());
    }

    @Test
    void succeedsWhenHighReachesAtrTargetWithoutConfirm() {
        // target = 100 + 2*2 = 104
        ActivePattern p = openAt(100, 100, 2.0, 102, ConfirmationMode.BOTH);
        Candle bar = new Candle(2, 103, 105, 102, 104, 1000);

        List<PatternStageEvent> events = BreakoutLifecycle.onCandle(p, bar, CFG, NOW);

        assertEquals(PatternStage.SUCCEEDED, events.get(0).stage());
        assertEquals(FinalOutcome.SUCCEEDED, p.finalOutcome());
        assertFalse(p.flagConfirmed());
    }

    @Test
    void failedBeatsSucceededSameBar() {
        ActivePattern p = openAt(100, 100, 2.0, 102, ConfirmationMode.CLOSE);
        // high clears target 104 but close invalidates
        Candle bar = new Candle(2, 103, 106, 99, 99, 1000);

        List<PatternStageEvent> events = BreakoutLifecycle.onCandle(p, bar, CFG, NOW);

        assertEquals(1, events.size());
        assertEquals(PatternStage.FAILED, events.get(0).stage());
    }

    @Test
    void closeModeConfirmsOnLaterBarStillAbove() {
        ActivePattern p = openAt(100, 100, 2.0, 101, ConfirmationMode.CLOSE);
        Candle later = new Candle(2, 101, 102, 100.5, 101.5, 1000);

        List<PatternStageEvent> events = BreakoutLifecycle.onCandle(p, later, CFG, NOW);

        assertTrue(p.flagConfirmed());
        // high 102 may also strengthen (ref+1*ATR = 102) same bar — status is highest ordinal
        assertTrue(events.stream().anyMatch(e -> e.stage() == PatternStage.CONFIRMED));
        assertTrue(p.status() == PatternStage.CONFIRMED || p.status() == PatternStage.STRENGTHENED);
    }

    @Test
    void closeModeDoesNotConfirmOnDetectBar() {
        ActivePattern p = openAt(100, 100, 2.0, 101, ConfirmationMode.CLOSE);
        Candle detectBar = new Candle(1, 100, 102, 100, 101, 5000);

        List<PatternStageEvent> events = BreakoutLifecycle.onCandle(p, detectBar, CFG, NOW);

        assertFalse(p.flagConfirmed());
        assertTrue(events.isEmpty());
    }

    @Test
    void volumeModeConfirmsOnDetectBarWhenVolumeOk() {
        ActivePattern p = openAt(100, 100, 2.0, 101, ConfirmationMode.VOLUME);
        // rebuild with volumeOk
        p = ActivePattern.builder()
                .id(p.id())
                .patternType(PatternType.BREAKOUT)
                .symbolId("S")
                .timeframe("5m")
                .direction(PatternDirection.LONG)
                .status(PatternStage.DETECTED)
                .volumeOkAtDetect(true)
                .confirmationModeUsed(ConfirmationMode.VOLUME)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(2)
                .volumeAtDetect(5000)
                .entryPrice(101)
                .stopLevel(100)
                .targetLevel(104)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(102)
                .maePrice(100)
                .build();

        Candle detectBar = new Candle(1, 100, 102, 100, 101, 5000);
        List<PatternStageEvent> events = BreakoutLifecycle.onCandle(p, detectBar, CFG, NOW);

        assertTrue(p.flagConfirmed());
        assertEquals(PatternStage.CONFIRMED, events.get(0).stage());
    }

    @Test
    void bothModeNeedsVolumeOkAndLaterBar() {
        ActivePattern p = ActivePattern.builder()
                .patternType(PatternType.BREAKOUT)
                .symbolId("S")
                .timeframe("5m")
                .volumeOkAtDetect(true)
                .confirmationModeUsed(ConfirmationMode.BOTH)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(2)
                .entryPrice(101)
                .stopLevel(100)
                .targetLevel(104)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(101)
                .maePrice(101)
                .build();

        assertTrue(BreakoutLifecycle.onCandle(p, new Candle(1, 101, 102, 100, 101, 5000), CFG, NOW).isEmpty());
        assertFalse(p.flagConfirmed());

        List<PatternStageEvent> events = BreakoutLifecycle.onCandle(
                p, new Candle(2, 101, 102, 100.5, 101.2, 1000), CFG, NOW);
        assertTrue(p.flagConfirmed());
        assertEquals(PatternStage.CONFIRMED, events.get(0).stage());
    }

    @Test
    void retestAndStrengthenUpdateFlagsWithoutDemotion() {
        ActivePattern p = ActivePattern.builder()
                .patternType(PatternType.BREAKOUT)
                .symbolId("S")
                .timeframe("5m")
                .flagConfirmed(true)
                .confirmationModeUsed(ConfirmationMode.CLOSE)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(4)
                .entryPrice(101)
                .stopLevel(100)
                .targetLevel(108)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(101)
                .maePrice(101)
                .build();

        // Strengthen: high >= 100+4 = 104
        BreakoutLifecycle.onCandle(p, new Candle(2, 103, 105, 102, 104, 1000), CFG, NOW);
        assertTrue(p.flagStrengthened());
        assertEquals(PatternStage.STRENGTHENED, p.status());

        // Retest after strengthen: low in band (100 + 0.25*4 = 101), close >= ref
        BreakoutLifecycle.onCandle(p, new Candle(3, 101, 102, 100.5, 101, 1000), CFG, NOW);
        assertTrue(p.flagRetested());
        assertEquals(100.5, p.retestFloor());
        // status stays STRENGTHENED (no demotion)
        assertEquals(PatternStage.STRENGTHENED, p.status());
        // measured target: risk = 100-100.5 negative? low 100.5 >? wait 100.5 > 100 so retest_floor not < ref
        // low 100.5 > ref 100 — keep ATR target 108
        assertEquals(108.0, p.targetLevel(), 1e-9);
    }

    @Test
    void retestBelowReferenceUpdatesMeasuredTarget() {
        ActivePattern p = ActivePattern.builder()
                .patternType(PatternType.BREAKOUT)
                .symbolId("S")
                .timeframe("5m")
                .flagConfirmed(true)
                .confirmationModeUsed(ConfirmationMode.CLOSE)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(4)
                .entryPrice(101)
                .stopLevel(100)
                .targetLevel(108)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(101)
                .maePrice(101)
                .build();

        // low 99.5 within band? retestBand = 100 + 1 = 101; 99.5 <= 101, close 100.2 >= 100
        // but close >= ref and we didn't fail (close 100.2 > 100? close must be >= ref, fail is close < ref
        BreakoutLifecycle.onCandle(p, new Candle(2, 100.5, 101, 99.5, 100.2, 1000), CFG, NOW);
        assertTrue(p.flagRetested());
        assertEquals(99.5, p.retestFloor());
        // risk = 0.5, target = 100 + 2*0.5 = 101
        assertEquals(101.0, p.targetLevel(), 1e-9);
    }

    @Test
    void updatesMfeMae() {
        ActivePattern p = openAt(100, 100, 2.0, 101, ConfirmationMode.CLOSE);
        // initial mfe/mae = entry 101
        BreakoutLifecycle.onCandle(p, new Candle(2, 102, 110, 95, 105, 1000), CFG, NOW);
        // close 105 > ref → not failed; mfe=110, mae=min(101,95)=95
        assertEquals(110.0, p.mfePrice());
        assertEquals(95.0, p.maePrice());
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
                .patternType(PatternType.BREAKOUT)
                .symbolId("NSE_EQ|TEST")
                .timeframe("5m")
                .direction(PatternDirection.LONG)
                .status(PatternStage.DETECTED)
                .volumeOkAtDetect(true)
                .confirmationModeUsed(mode)
                .referenceLevel(ref)
                .lookbackHigh(lookback)
                .atrAtDetect(atr)
                .volumeAtDetect(1000)
                .entryPrice(entry)
                .stopLevel(ref)
                .targetLevel(ref + 2 * atr)
                .detectCandleTime(1)
                .detectedAt(NOW)
                .mfePrice(entry)
                .maePrice(entry)
                .build();
    }
}
