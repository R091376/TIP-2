package com.tip.market;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TimeframeParserTest {

    @Test
    void parseMinutesUnits() {
        TimeframeParser.TimeframeSpec s = TimeframeParser.parse("15m");
        assertEquals("minutes", s.unit());
        assertEquals(15, s.interval());
        assertEquals(15, s.intervalMinutes());
    }

    @Test
    void parseHoursUsesMinutesForEngine() {
        TimeframeParser.TimeframeSpec s = TimeframeParser.parse("4h");
        assertEquals("hours", s.unit());
        assertEquals(4, s.interval());
        assertEquals(240, s.intervalMinutes());
    }

    @Test
    void parseOneHour() {
        TimeframeParser.TimeframeSpec s = TimeframeParser.parse("1h");
        assertEquals("hours", s.unit());
        assertEquals(1, s.interval());
        assertEquals(60, s.intervalMinutes());
    }

    @Test
    void parseDays() {
        TimeframeParser.TimeframeSpec s = TimeframeParser.parse("1d");
        assertEquals("days", s.unit());
        assertEquals(1, s.interval());
        assertEquals(24 * 60, s.intervalMinutes());
    }

    @Test
    void parseInvalidThrows() {
        assertThrows(IllegalArgumentException.class, () -> TimeframeParser.parse("15"));
        assertThrows(IllegalArgumentException.class, () -> TimeframeParser.parse("w1"));
    }
}
