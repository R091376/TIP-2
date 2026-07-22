package com.tip.market;

import com.tip.market.event.MarketPhaseChangedEvent;
import com.upstox.feeder.MarketUpdateV3;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

class MarketStatusServiceTest {

    private final List<Object> events = new ArrayList<>();
    private MarketStatusService service;

    @BeforeEach
    void setUp() {
        events.clear();
        ApplicationEventPublisher publisher = events::add;
        service = new MarketStatusService(publisher);
    }

    @Test
    void selectSegmentStatus_eqOnly_usesEq() {
        Map<String, MarketUpdateV3.MarketStatus> map = Map.of(
                "NSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_OPEN
        );
        assertSame(MarketUpdateV3.MarketStatus.NORMAL_OPEN,
                MarketStatusService.selectSegmentStatus(map));
    }

    @Test
    void selectSegmentStatus_indexOnly_usesIndex() {
        Map<String, MarketUpdateV3.MarketStatus> map = Map.of(
                "NSE_INDEX", MarketUpdateV3.MarketStatus.PRE_OPEN_START
        );
        assertSame(MarketUpdateV3.MarketStatus.PRE_OPEN_START,
                MarketStatusService.selectSegmentStatus(map));
    }

    @Test
    void selectSegmentStatus_both_prefersEq() {
        Map<String, MarketUpdateV3.MarketStatus> map = Map.of(
                "NSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_CLOSE,
                "NSE_INDEX", MarketUpdateV3.MarketStatus.NORMAL_OPEN
        );
        assertSame(MarketUpdateV3.MarketStatus.NORMAL_CLOSE,
                MarketStatusService.selectSegmentStatus(map));
    }

    @Test
    void selectSegmentStatus_neither_returnsNull() {
        assertNull(MarketStatusService.selectSegmentStatus(Map.of()));
        assertNull(MarketStatusService.selectSegmentStatus(null));
        assertNull(MarketStatusService.selectSegmentStatus(
                Map.of("BSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_OPEN)));
    }

    @Test
    void updateFromSegmentStatus_eqOnly_setsOpen() {
        service.updateFromSegmentStatus(Map.of(
                "NSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_OPEN
        ));
        assertEquals(MarketPhase.OPEN, service.getMarketPhase());
    }

    @Test
    void updateFromSegmentStatus_indexOnly_setsPreOpen() {
        // Force a known prior phase then update from INDEX-only
        service.refreshPhaseFromClock();
        MarketPhase before = service.getMarketPhase();
        service.updateFromSegmentStatus(Map.of(
                "NSE_INDEX", MarketUpdateV3.MarketStatus.PRE_OPEN_END
        ));
        assertEquals(MarketPhase.PRE_OPEN, service.getMarketPhase());
        if (before != MarketPhase.PRE_OPEN) {
            assertEquals(1, events.stream().filter(MarketPhaseChangedEvent.class::isInstance).count());
        }
    }

    @Test
    void updateFromSegmentStatus_both_prefersEqClosed() {
        service.updateFromSegmentStatus(Map.of(
                "NSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_CLOSE,
                "NSE_INDEX", MarketUpdateV3.MarketStatus.NORMAL_OPEN
        ));
        assertEquals(MarketPhase.CLOSED, service.getMarketPhase());
    }

    @Test
    void updateFromSegmentStatus_neither_keepsPriorPhase() {
        service.updateFromSegmentStatus(Map.of(
                "NSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_OPEN
        ));
        assertEquals(MarketPhase.OPEN, service.getMarketPhase());
        int eventCount = events.size();

        service.updateFromSegmentStatus(Map.of(
                "BSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_CLOSE
        ));
        assertEquals(MarketPhase.OPEN, service.getMarketPhase());
        assertEquals(eventCount, events.size());
    }

    @Test
    void refreshPhaseFromClock_whenFeedFresh_keepsOpenUnlessClockClosed() {
        service.setLiveFeedConnected(true);
        service.updateFromSegmentStatus(Map.of(
                "NSE_EQ", MarketUpdateV3.MarketStatus.NORMAL_OPEN
        ));
        assertEquals(MarketPhase.OPEN, service.getMarketPhase());

        // Without mocking wall clock we can only assert: if clock is OPEN, feed OPEN is kept.
        // When clock is CLOSED (weekend/after hours/holiday), force CLOSED.
        MarketPhase clock = NseMarketClock.phaseFromClock();
        service.refreshPhaseFromClock();
        if (clock == MarketPhase.CLOSED) {
            assertEquals(MarketPhase.CLOSED, service.getMarketPhase());
        } else {
            assertEquals(MarketPhase.OPEN, service.getMarketPhase());
        }
    }

    @Test
    void refreshPhaseFromClock_withoutFeed_usesClock() {
        service.setLiveFeedConnected(false);
        service.refreshPhaseFromClock();
        assertEquals(NseMarketClock.phaseFromClock(), service.getMarketPhase());
    }
}
