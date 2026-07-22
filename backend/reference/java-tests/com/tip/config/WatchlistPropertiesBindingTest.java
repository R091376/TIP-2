package com.tip.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
class WatchlistPropertiesBindingTest {

    @Autowired
    private WatchlistProperties watchlistProperties;

    @Autowired
    private InstrumentProperties instrumentProperties;

    @Autowired
    private MarketProperties marketProperties;

    @Test
    void watchlistProperties_bindSeedListAndCaps() {
        assertNotNull(watchlistProperties);
        // application-test.yml clears seed-symbols so tip_test is not polluted
        assertEquals(List.of(), watchlistProperties.seedSymbols());
        assertEquals(40, watchlistProperties.softWarnSize());
        assertEquals(50, watchlistProperties.hardMaxSize());
    }

    @Test
    void instrumentProperties_bindMasterSettings() {
        assertNotNull(instrumentProperties);
        assertTrue(instrumentProperties.masterUrl().contains("NSE.json.gz"));
        assertNotNull(instrumentProperties.cacheDir());
        assertFalse(instrumentProperties.cacheDir().isBlank());
        assertTrue(instrumentProperties.refreshOnStartup());
    }

    @Test
    void marketDefaults_matchNifty50IndexSeed() {
        assertEquals("Nifty 50", marketProperties.defaultSymbol());
        assertEquals("NSE_INDEX|Nifty 50", marketProperties.defaultInstrumentKey());
    }

    @Test
    void watchlistProperties_clampsSoftWarnAboveHardMax() {
        WatchlistProperties props = new WatchlistProperties(
                List.of("RELIANCE"),
                Map.of(),
                60,
                50
        );
        assertEquals(50, props.hardMaxSize());
        assertEquals(50, props.softWarnSize());
    }

    @Test
    void watchlistProperties_rejectsSeedLargerThanHardMax() {
        List<String> seeds = List.of("A", "B", "C");
        assertThrows(IllegalArgumentException.class,
                () -> new WatchlistProperties(seeds, Map.of(), 2, 2));
    }
}
