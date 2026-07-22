package com.tip.market;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NseMarketClockPhaseTest {

    @Test
    void closedAtExactly1530Inclusive() {
        ZonedDateTime atClose = ZonedDateTime.of(
                2026, 7, 13, 15, 30, 0, 0, CandleBoundaryUtils.NSE_ZONE);
        assertEquals(MarketPhase.CLOSED, NseMarketClock.phaseAt(atClose));
    }

    @Test
    void openJustBefore1530() {
        ZonedDateTime justBefore = ZonedDateTime.of(
                2026, 7, 13, 15, 29, 59, 0, CandleBoundaryUtils.NSE_ZONE);
        assertEquals(MarketPhase.OPEN, NseMarketClock.phaseAt(justBefore));
    }

    @Test
    void preOpenBetween900And915() {
        ZonedDateTime pre = ZonedDateTime.of(
                2026, 7, 13, 9, 5, 0, 0, CandleBoundaryUtils.NSE_ZONE);
        assertEquals(MarketPhase.PRE_OPEN, NseMarketClock.phaseAt(pre));
    }

    @Test
    void openAt915() {
        ZonedDateTime open = ZonedDateTime.of(
                2026, 7, 13, 9, 15, 0, 0, CandleBoundaryUtils.NSE_ZONE);
        assertEquals(MarketPhase.OPEN, NseMarketClock.phaseAt(open));
    }

    @Test
    void weekendIsClosed() {
        // 2026-07-11 is Saturday
        ZonedDateTime sat = ZonedDateTime.of(
                2026, 7, 11, 10, 0, 0, 0, CandleBoundaryUtils.NSE_ZONE);
        assertEquals(MarketPhase.CLOSED, NseMarketClock.phaseAt(sat));
        assertFalse(NseMarketClock.isTradingDay(LocalDate.of(2026, 7, 11)));
    }

    @Test
    void independenceDayHolidayIsClosed() {
        LocalDate holiday = LocalDate.of(2026, 8, 15);
        assertTrue(NseHolidayCalendar.isHoliday(holiday));
        ZonedDateTime midday = ZonedDateTime.of(
                holiday, LocalTime.of(11, 0), CandleBoundaryUtils.NSE_ZONE);
        assertEquals(MarketPhase.CLOSED, NseMarketClock.phaseAt(midday));
    }
}
