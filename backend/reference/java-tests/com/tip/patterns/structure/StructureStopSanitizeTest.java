package com.tip.patterns.structure;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class StructureStopSanitizeTest {

    @Test
    void longStopAlwaysBelowEntry() {
        double entry = 100;
        double stop = StructureDetector.sanitizeStop(true, entry, 105, 2);
        assertTrue(stop < entry);
        stop = StructureDetector.sanitizeStop(true, entry, 90, 2);
        assertTrue(stop < entry);
        assertTrue(stop == 90);
    }

    @Test
    void shortStopAlwaysAboveEntry() {
        double entry = 100;
        double stop = StructureDetector.sanitizeStop(false, entry, 95, 2);
        assertTrue(stop > entry);
        stop = StructureDetector.sanitizeStop(false, entry, 110, 2);
        assertTrue(stop > entry);
        assertTrue(stop == 110);
    }
}
