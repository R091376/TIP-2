package com.tip.market;

import com.tip.market.event.CandleClosedEvent;
import com.tip.market.event.CandleUpdatedEvent;
import com.tip.market.model.Candle;
import com.tip.market.model.Tick;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CandleEngineCloseStaleTest {

    private static final String INSTRUMENT = "NSE_EQ|INE002A01018";
    private static final String TIMEFRAME = "5m";

    private final List<CandleClosedEvent> closedEvents = new ArrayList<>();
    private CandleEngine candleEngine;

    @BeforeEach
    void setUp() {
        closedEvents.clear();
        ApplicationEventPublisher publisher = event -> {
            if (event instanceof CandleClosedEvent closed) {
                closedEvents.add(closed);
            }
        };
        candleEngine = new CandleEngine(publisher);
    }

    @Test
    void closeStaleOpenCandles_closesPriorBucketWithoutNewTick() {
        ZonedDateTime openAt = ZonedDateTime.of(2026, 7, 13, 14, 45, 10, 0, CandleBoundaryUtils.NSE_ZONE);
        candleEngine.processTick(tick(openAt, 100.0, 1000), TIMEFRAME);

        assertTrue(candleEngine.getCurrentCandle(INSTRUMENT, TIMEFRAME).isPresent());
        assertEquals(0, closedEvents.size());

        // Next 5m boundary is 14:50 — force-close without a live tick.
        long nowMs = ZonedDateTime.of(2026, 7, 13, 14, 50, 5, 0, CandleBoundaryUtils.NSE_ZONE)
                .toInstant().toEpochMilli();
        int n = candleEngine.closeStaleOpenCandles(nowMs);

        assertEquals(1, n);
        assertEquals(1, closedEvents.size());
        assertTrue(candleEngine.getCurrentCandle(INSTRUMENT, TIMEFRAME).isEmpty());
        List<Candle> closed = candleEngine.getClosedCandles(INSTRUMENT, TIMEFRAME);
        assertEquals(1, closed.size());
        assertEquals(
                ZonedDateTime.of(2026, 7, 13, 14, 45, 0, 0, CandleBoundaryUtils.NSE_ZONE).toEpochSecond(),
                closed.get(0).time());
    }

    @Test
    void closeStaleOpenCandles_leavesActiveBucketOpen() {
        ZonedDateTime openAt = ZonedDateTime.of(2026, 7, 13, 14, 47, 0, 0, CandleBoundaryUtils.NSE_ZONE);
        candleEngine.processTick(tick(openAt, 100.0, 1000), TIMEFRAME);

        long stillInBucket = ZonedDateTime.of(2026, 7, 13, 14, 49, 30, 0, CandleBoundaryUtils.NSE_ZONE)
                .toInstant().toEpochMilli();
        int n = candleEngine.closeStaleOpenCandles(stillInBucket);

        assertEquals(0, n);
        assertEquals(0, closedEvents.size());
        assertTrue(candleEngine.getCurrentCandle(INSTRUMENT, TIMEFRAME).isPresent());
    }

    private static Tick tick(ZonedDateTime at, double price, long vtt) {
        return new Tick(INSTRUMENT, price, vtt, at.toInstant().toEpochMilli());
    }
}
