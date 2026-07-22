package com.tip.patterns.breakout;

import com.tip.market.model.Candle;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.PatternStage;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BreakoutBarEvaluatorTest {

    private static final Instant NOW = Instant.parse("2026-07-13T10:00:00Z");

    @Test
    void endToEndDetectThenConfirmOnNextBar() {
        // CLOSE mode: confirm needs a later bar still above (no volume dependency)
        BreakoutConfig cfg = new BreakoutConfig(
                20, 14, 20,
                com.tip.patterns.model.ConfirmationMode.CLOSE,
                1.5, 0.25, 1.0, 2.0, 2.0, "breakout-v1-test"
        );
        List<Candle> series = BreakoutDetectorTest.risingSeries(25, 100);
        List<ActivePattern> open = new ArrayList<>();

        BreakoutBarEvaluation e1 = BreakoutBarEvaluator.evaluate(
                "S", "5m", open, series, false, cfg, NOW);

        assertEquals(1, e1.newlyDetected().size());
        assertEquals(1, e1.stillOpen().size());
        assertTrue(e1.events().stream().anyMatch(ev -> ev.stage() == PatternStage.DETECTED));
        ActivePattern live = e1.stillOpen().get(0);
        assertFalse(live.flagConfirmed());

        open = new ArrayList<>(e1.stillOpen());
        Candle last = series.get(series.size() - 1);
        // modest extension: stay above ref, avoid huge strengthen noise
        double nextClose = last.close() + 0.1;
        series = new ArrayList<>(series);
        series.add(new Candle(
                last.time() + 1,
                nextClose,
                nextClose + 0.05,
                Math.max(live.referenceLevel() + 0.01, nextClose - 0.05),
                nextClose,
                2000
        ));

        BreakoutBarEvaluation e2 = BreakoutBarEvaluator.evaluate(
                "S", "5m", open, series, false, cfg, NOW.plusSeconds(300));

        assertFalse(e2.stillOpen().isEmpty(), "instance should still be open");
        assertTrue(e2.stillOpen().get(0).flagConfirmed());
        assertTrue(e2.events().stream().anyMatch(ev -> ev.stage() == PatternStage.CONFIRMED));
    }

    @Test
    void multiInstanceAntiSpamOnSameSeries() {
        BreakoutConfig cfg = BreakoutConfig.defaults();
        List<Candle> series = BreakoutDetectorTest.risingSeries(25, 100);
        List<ActivePattern> open = new ArrayList<>();

        BreakoutBarEvaluation e1 = BreakoutBarEvaluator.evaluate(
                "S", "5m", open, series, false, cfg, NOW);
        open = new ArrayList<>(e1.stillOpen());
        assertEquals(1, open.size());

        // same series again — ref not higher than open max → no second detect
        BreakoutBarEvaluation e2 = BreakoutBarEvaluator.evaluate(
                "S", "5m", open, series, false, cfg, NOW);
        assertEquals(0, e2.newlyDetected().size());
        assertEquals(1, e2.stillOpen().size());
    }
}
