package com.tip.config;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PatternPropertiesTimeframeTest {

    @Test
    void defaultDisables1mAndEnablesOtherCommonTfs() {
        PatternProperties props = new PatternProperties();
        assertFalse(props.isTimeframeEnabled("1m"));
        assertTrue(props.isTimeframeEnabled("5m"));
        assertTrue(props.isTimeframeEnabled("15m"));
        assertTrue(props.isTimeframeEnabled("1h"));
        assertTrue(props.isTimeframeEnabled("4h"));
        assertTrue(props.isTimeframeEnabled("1d"));
    }

    @Test
    void blankTimeframeIsDisabled() {
        PatternProperties props = new PatternProperties();
        assertFalse(props.isTimeframeEnabled(null));
        assertFalse(props.isTimeframeEnabled("  "));
    }

    @Test
    void canReEnable1mViaSetter() {
        PatternProperties props = new PatternProperties();
        Map<String, Boolean> map = new LinkedHashMap<>(props.getEnabledTimeframes());
        map.put("1m", true);
        props.setEnabledTimeframes(map);
        assertTrue(props.isTimeframeEnabled("1m"));
    }

    @Test
    void unknownTimeframeDefaultsToEnabled() {
        PatternProperties props = new PatternProperties();
        assertTrue(props.isTimeframeEnabled("2h"));
    }
}
