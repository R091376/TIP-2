package com.tip.api;

import com.tip.config.PatternProperties;
import com.tip.journal.PatternJournal;
import com.tip.patterns.PatternFeatureGuard;
import com.tip.watchlist.SymbolBootstrapStatus;
import com.tip.watchlist.WatchlistEntry;
import com.tip.watchlist.WatchlistRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PatternStatisticsControllerTest {

    private PatternFeatureGuard guard;
    private PatternJournal journal;
    private WatchlistRepository watchlist;
    private PatternStatisticsController controller;

    @BeforeEach
    void setUp() {
        guard = mock(PatternFeatureGuard.class);
        journal = mock(PatternJournal.class);
        watchlist = mock(WatchlistRepository.class);
        controller = new PatternStatisticsController(
                guard,
                journal,
                new PatternProperties(),
                watchlist
        );
        when(guard.isFullyEnabled()).thenReturn(true);
    }

    @Test
    void patternsDisabledThrows() {
        when(guard.isFullyEnabled()).thenReturn(false);
        assertThrows(PatternsDisabledException.class, () -> controller.list(null, null));
    }

    @Test
    void emptyWatchlistReturnsEmptyItems() {
        when(watchlist.findAllActive()).thenReturn(List.of());
        when(journal.findStatisticsForSymbols(eq(List.of()), isNull(), isNull()))
                .thenReturn(List.of());

        Map<String, Object> body = controller.list(null, null);
        assertEquals(20, body.get("minSampleSize"));
        assertEquals(0, body.get("count"));
        assertTrue(((List<?>) body.get("items")).isEmpty());
    }

    @Test
    void insufficientHistoryKeepsCountsButNullRates() {
        WatchlistEntry entry = entry("NSE_EQ|X", "RELIANCE");
        when(watchlist.findAllActive()).thenReturn(List.of(entry));
        when(journal.findStatisticsForSymbols(any(), isNull(), isNull()))
                .thenReturn(List.of(snapshot("NSE_EQ|X", "breakout", "5m", 7, 3, 2, 2)));

        Map<String, Object> body = controller.list(null, null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        assertEquals(1, items.size());
        Map<String, Object> item = items.get(0);
        assertEquals("insufficient_history", item.get("status"));
        assertEquals(7, item.get("sampleSize"));
        assertEquals(3, item.get("successCount"));
        assertEquals(2, item.get("failCount"));
        assertEquals(2, item.get("expiredCount"));
        assertNull(item.get("resolvedSuccessRate"));
        assertNull(item.get("avgMfeR"));
        assertEquals("RELIANCE", item.get("tradingSymbol"));
    }

    @Test
    void readyRowExposesRates() {
        WatchlistEntry entry = entry("NSE_EQ|X", "RELIANCE");
        when(watchlist.findAllActive()).thenReturn(List.of(entry));
        when(journal.findStatisticsForSymbols(any(), eq("breakout"), eq("5m")))
                .thenReturn(List.of(snapshot("NSE_EQ|X", "breakout", "5m", 22, 10, 8, 4)));

        Map<String, Object> body = controller.list("breakout", "5m");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        Map<String, Object> item = items.get(0);
        assertEquals("ok", item.get("status"));
        // 10 success / (10+8) resolved
        assertEquals(10.0 / 18.0, (Double) item.get("resolvedSuccessRate"), 1e-9);
        assertEquals(1.5, item.get("avgMfeR"));
        assertEquals(0.6, item.get("avgMaeR"));
    }

    private static WatchlistEntry entry(String symbolId, String trading) {
        return new WatchlistEntry(
                symbolId,
                trading,
                "NSE",
                "NSE_EQ",
                "EQ",
                trading,
                Instant.now(),
                true,
                SymbolBootstrapStatus.READY,
                null
        );
    }

    private static PatternJournal.PatternStatisticsSnapshot snapshot(
            String symbolId,
            String type,
            String tf,
            int sample,
            int success,
            int fail,
            int expired
    ) {
        int resolved = success + fail;
        double inventory = sample == 0 ? 0 : (double) success / sample;
        Double resolvedRate = resolved == 0 ? null : (double) success / resolved;
        return new PatternJournal.PatternStatisticsSnapshot(
                symbolId,
                type,
                tf,
                sample,
                success,
                fail,
                expired,
                inventory,
                resolvedRate,
                resolved,
                0.8,
                12.0,
                1.5,
                0.6,
                sample,
                sample,
                sample,
                Instant.parse("2026-07-17T10:00:00Z")
        );
    }
}
