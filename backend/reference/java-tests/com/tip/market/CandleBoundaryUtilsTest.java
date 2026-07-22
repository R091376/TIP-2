package com.tip.market;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CandleBoundaryUtilsTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static long epochMs(int y, int m, int d, int h, int min) {
        return ZonedDateTime.of(LocalDateTime.of(y, m, d, h, min), IST).toInstant().toEpochMilli();
    }

    private static long floorSec(int y, int m, int d, int h, int min, int intervalMinutes) {
        return CandleBoundaryUtils.floorToCandleStartEpochSecond(
                epochMs(y, m, d, h, min), intervalMinutes);
    }

    private static long expectedSec(int y, int m, int d, int h, int min) {
        return ZonedDateTime.of(LocalDateTime.of(y, m, d, h, min), IST).toEpochSecond();
    }

    @Test
    void floorsFifteenMinutes() {
        assertEquals(expectedSec(2026, 7, 10, 10, 15), floorSec(2026, 7, 10, 10, 17, 15));
        assertEquals(expectedSec(2026, 7, 10, 10, 30), floorSec(2026, 7, 10, 10, 44, 15));
        // Session open is a boundary
        assertEquals(expectedSec(2026, 7, 10, 9, 15), floorSec(2026, 7, 10, 9, 15, 15));
        assertEquals(expectedSec(2026, 7, 10, 9, 15), floorSec(2026, 7, 10, 9, 20, 15));
    }

    @Test
    void floorsFiveMinutesAlignedToSession() {
        assertEquals(expectedSec(2026, 7, 10, 9, 15), floorSec(2026, 7, 10, 9, 17, 5));
        assertEquals(expectedSec(2026, 7, 10, 9, 20), floorSec(2026, 7, 10, 9, 20, 5));
        assertEquals(expectedSec(2026, 7, 10, 10, 25), floorSec(2026, 7, 10, 10, 29, 5));
    }

    @Test
    void floorsOneHourAlignedToSessionOpen() {
        // Upstox 1h NSE bars: 09:15, 10:15, 11:15, … (not wall-clock :00)
        assertEquals(expectedSec(2026, 7, 10, 9, 15), floorSec(2026, 7, 10, 9, 15, 60));
        assertEquals(expectedSec(2026, 7, 10, 9, 15), floorSec(2026, 7, 10, 10, 14, 60));
        assertEquals(expectedSec(2026, 7, 10, 10, 15), floorSec(2026, 7, 10, 10, 15, 60));
        assertEquals(expectedSec(2026, 7, 10, 10, 15), floorSec(2026, 7, 10, 10, 45, 60));
        assertEquals(expectedSec(2026, 7, 10, 11, 15), floorSec(2026, 7, 10, 11, 15, 60));
        assertEquals(expectedSec(2026, 7, 10, 14, 15), floorSec(2026, 7, 10, 15, 0, 60));
    }

    @Test
    void floorsFourHoursAlignedToSessionOpen() {
        // Upstox 4h NSE bars: 09:15, 13:15 (not 08:00 / 12:00 wall clock)
        assertEquals(expectedSec(2026, 7, 10, 9, 15), floorSec(2026, 7, 10, 9, 15, 240));
        assertEquals(expectedSec(2026, 7, 10, 9, 15), floorSec(2026, 7, 10, 12, 30, 240));
        assertEquals(expectedSec(2026, 7, 10, 13, 15), floorSec(2026, 7, 10, 13, 15, 240));
        assertEquals(expectedSec(2026, 7, 10, 13, 15), floorSec(2026, 7, 10, 15, 30, 240));
    }

    @Test
    void floorsDailyToMidnight() {
        assertEquals(expectedSec(2026, 7, 10, 0, 0), floorSec(2026, 7, 10, 15, 30, 24 * 60));
    }
}
