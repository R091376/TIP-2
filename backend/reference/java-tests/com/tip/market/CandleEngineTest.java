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

class CandleEngineTest {

    private static final String INSTRUMENT = "NSE_EQ|INE002A01018";
    private static final String TIMEFRAME = "5m";

    private final List<CandleClosedEvent> closedEvents = new ArrayList<>();
    private final List<CandleUpdatedEvent> updatedEvents = new ArrayList<>();
    private CandleEngine candleEngine;

    @BeforeEach
    void setUp() {
        closedEvents.clear();
        updatedEvents.clear();
        ApplicationEventPublisher publisher = event -> {
            if (event instanceof CandleClosedEvent closed) {
                closedEvents.add(closed);
            } else if (event instanceof CandleUpdatedEvent updated) {
                updatedEvents.add(updated);
            }
        };
        candleEngine = new CandleEngine(publisher);
    }

    @Test
    void alignsFiveMinuteBoundariesToIstClock() {
        ZonedDateTime tickTime = ZonedDateTime.of(2026, 7, 7, 14, 47, 30, 0, CandleBoundaryUtils.NSE_ZONE);
        long boundary = CandleBoundaryUtils.floorToCandleStartEpochSecond(
                tickTime.toInstant().toEpochMilli(),
                5
        );
        assertEquals(
                ZonedDateTime.of(2026, 7, 7, 14, 45, 0, 0, CandleBoundaryUtils.NSE_ZONE).toEpochSecond(),
                boundary
        );
    }

    @Test
    void oneHourLiveBarAlignsToSessionOpenNotWallClock() {
        // Seed last closed = 10:15 (Upstox style); live tick at 10:40 must continue 10:15, not 10:00
        long t915 = ZonedDateTime.of(2026, 7, 13, 9, 15, 0, 0, CandleBoundaryUtils.NSE_ZONE).toEpochSecond();
        long t1015 = ZonedDateTime.of(2026, 7, 13, 10, 15, 0, 0, CandleBoundaryUtils.NSE_ZONE).toEpochSecond();
        candleEngine.seed(INSTRUMENT, "1h", List.of(
                new Candle(t915, 100, 101, 99, 100.5, 1000),
                new Candle(t1015, 100.5, 102, 100, 101, 500)
        ));

        ZonedDateTime tickAt = ZonedDateTime.of(2026, 7, 13, 10, 40, 0, 0, CandleBoundaryUtils.NSE_ZONE);
        candleEngine.processTick(tick(tickAt, 101.5, 2000), "1h");

        List<Candle> all = candleEngine.getAllCandles(INSTRUMENT, "1h");
        assertEquals(2, all.size());
        assertEquals(t915, all.get(0).time());
        assertEquals(t1015, all.get(1).time());
        // Monotonic
        assertTrue(all.get(1).time() > all.get(0).time());
        assertEquals(101.5, all.get(1).close());
    }

    @Test
    void closesCandleWhenBoundaryCrosses() {
        ZonedDateTime first = ZonedDateTime.of(2026, 7, 7, 14, 44, 10, 0, CandleBoundaryUtils.NSE_ZONE);
        ZonedDateTime second = ZonedDateTime.of(2026, 7, 7, 14, 45, 10, 0, CandleBoundaryUtils.NSE_ZONE);

        candleEngine.processTick(tick(first, 100.0, 1000), TIMEFRAME);
        candleEngine.processTick(tick(second, 101.0, 1100), TIMEFRAME);

        assertEquals(1, closedEvents.size());
        assertEquals(100.0, closedEvents.get(0).candle().close());
        assertTrue(candleEngine.getCurrentCandle(INSTRUMENT, TIMEFRAME).isPresent());
        assertEquals(101.0, candleEngine.getCurrentCandle(INSTRUMENT, TIMEFRAME).orElseThrow().close());
    }

    @Test
    void getClosedCandlesExcludesInProgressBar() {
        ZonedDateTime first = ZonedDateTime.of(2026, 7, 7, 14, 44, 10, 0, CandleBoundaryUtils.NSE_ZONE);
        ZonedDateTime second = ZonedDateTime.of(2026, 7, 7, 14, 45, 10, 0, CandleBoundaryUtils.NSE_ZONE);

        candleEngine.processTick(tick(first, 100.0, 1000), TIMEFRAME);
        candleEngine.processTick(tick(second, 101.0, 1100), TIMEFRAME);

        List<Candle> closed = candleEngine.getClosedCandles(INSTRUMENT, TIMEFRAME);
        List<Candle> all = candleEngine.getAllCandles(INSTRUMENT, TIMEFRAME);

        assertEquals(1, closed.size());
        assertEquals(100.0, closed.get(0).close());
        assertEquals(2, all.size());
        assertEquals(101.0, all.get(1).close());
    }

    @Test
    void seedDoesNotPublishClosedEvents() {
        long t = ZonedDateTime.of(2026, 7, 7, 10, 0, 0, 0, CandleBoundaryUtils.NSE_ZONE).toEpochSecond();
        candleEngine.seed(INSTRUMENT, TIMEFRAME, List.of(
                new Candle(t, 1, 1, 1, 1, 0),
                new Candle(t + 300, 2, 2, 2, 2, 0)
        ));
        assertEquals(0, closedEvents.size());
        assertEquals(2, candleEngine.getClosedCandles(INSTRUMENT, TIMEFRAME).size());
    }

    @Test
    void accumulatesVolumeFromVttDelta() {
        ZonedDateTime tickTime = ZonedDateTime.of(2026, 7, 7, 14, 45, 10, 0, CandleBoundaryUtils.NSE_ZONE);

        candleEngine.processTick(tick(tickTime, 100.0, 1000), TIMEFRAME);
        candleEngine.processTick(tick(tickTime.plusSeconds(1), 100.5, 1250), TIMEFRAME);

        Candle current = candleEngine.getCurrentCandle(INSTRUMENT, TIMEFRAME).orElseThrow();
        assertEquals(250L, current.volume());
    }

    @Test
    void evictRemovesAllTimeframesForInstrument() {
        String other = "NSE_INDEX|Nifty 50";
        candleEngine.seed(INSTRUMENT, "5m", List.of(new Candle(1000L, 1, 1, 1, 1, 0)));
        candleEngine.seed(INSTRUMENT, "15m", List.of(new Candle(1000L, 2, 2, 2, 2, 0)));
        candleEngine.seed(other, "5m", List.of(new Candle(1000L, 3, 3, 3, 3, 0)));

        candleEngine.evict(INSTRUMENT);

        assertTrue(candleEngine.getAllCandles(INSTRUMENT, "5m").isEmpty());
        assertTrue(candleEngine.getAllCandles(INSTRUMENT, "15m").isEmpty());
        assertEquals(1, candleEngine.getAllCandles(other, "5m").size());
        assertEquals(3.0, candleEngine.getAllCandles(other, "5m").get(0).close());
    }

    @Test
    void evictIsSafeWhenNoState() {
        candleEngine.evict("NSE_EQ|DOES_NOT_EXIST");
        candleEngine.evict(null);
        candleEngine.evict("");
    }

    private Tick tick(ZonedDateTime time, double price, long vtt) {
        return new Tick(INSTRUMENT, price, vtt, time.toInstant().toEpochMilli());
    }
}