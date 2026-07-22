package com.tip.market;

import com.upstox.feeder.MarketUpdateV3;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class NseMarketClockTest {

    @Test
    void mapsUpstoxSegmentStatusToMarketPhase() {
        assertEquals(MarketPhase.OPEN, mapStatus(MarketUpdateV3.MarketStatus.NORMAL_OPEN));
        assertEquals(MarketPhase.CLOSED, mapStatus(MarketUpdateV3.MarketStatus.NORMAL_CLOSE));
        assertEquals(MarketPhase.PRE_OPEN, mapStatus(MarketUpdateV3.MarketStatus.PRE_OPEN_START));
    }

    private MarketPhase mapStatus(MarketUpdateV3.MarketStatus status) {
        MarketStatusService service = new MarketStatusService(event -> {});
        service.updateFromSegmentStatus(Map.of("NSE_EQ", status));
        return service.getMarketPhase();
    }
}