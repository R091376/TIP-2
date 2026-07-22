package com.tip.api;

import com.tip.api.dto.PatternListResponse;
import com.tip.config.PatternProperties;
import com.tip.journal.PatternJournal;
import com.tip.patterns.ActiveInstanceStore;
import com.tip.patterns.PatternFeatureGuard;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.ConfirmationMode;
import com.tip.patterns.model.FinalOutcome;
import com.tip.patterns.model.PatternDirection;
import com.tip.patterns.model.PatternStage;
import com.tip.patterns.model.PatternType;
import com.tip.watchlist.WatchlistRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PatternControllerTest {

    private PatternFeatureGuard guard;
    private PatternJournal journal;
    private WatchlistRepository watchlist;
    private ActiveInstanceStore store;
    private PatternController controller;

    @BeforeEach
    void setUp() {
        guard = mock(PatternFeatureGuard.class);
        journal = mock(PatternJournal.class);
        watchlist = mock(WatchlistRepository.class);
        store = new ActiveInstanceStore();
        controller = new PatternController(
                guard,
                journal,
                store,
                new PatternProperties(),
                watchlist
        );
        when(guard.isFullyEnabled()).thenReturn(true);
        when(watchlist.containsSymbolId(anyString())).thenReturn(true);
        when(journal.isActive()).thenReturn(true);
    }

    @Test
    void patternsDisabledThrowsPatternsDisabledException() {
        when(guard.isFullyEnabled()).thenReturn(false);
        assertThrows(PatternsDisabledException.class,
                () -> controller.listPatterns("NSE_EQ|X", "active", "5m"));
    }

    @Test
    void statusClosedDoesNotReturnActives() {
        ActivePattern open = openPattern("5m");
        store.put(open);

        ActivePattern closed = openPattern("5m");
        closed.markTerminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "price_target", 110.0);

        when(journal.findRecent(eq("NSE_EQ|X"), eq("closed"), anyInt()))
                .thenReturn(List.of(closed));

        PatternListResponse active = controller.listPatterns("NSE_EQ|X", "active", "5m");
        assertEquals(1, active.patterns().size());
        assertEquals("detected", active.patterns().get(0).status());

        PatternListResponse closedResp = controller.listPatterns("NSE_EQ|X", "closed", "5m");
        assertEquals("closed", closedResp.statusFilter());
        assertEquals(1, closedResp.patterns().size());
        assertEquals("succeeded", closedResp.patterns().get(0).status());
    }

    @Test
    void invalidStatusRejected() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> controller.listPatterns("NSE_EQ|X", "weird", null)
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void statsInsufficientHistory() {
        when(journal.findStatistics(eq("NSE_EQ|X"), eq("breakout"), eq("5m")))
                .thenReturn(Optional.of(new PatternJournal.PatternStatisticsSnapshot(
                        "NSE_EQ|X", "breakout", "5m",
                        3, 1, 1, 1, 0.33, 0.5, 2,
                        0.1, 5, 0.2, 0.1, 2, 2, 2, Instant.now()
                )));
        Map<String, Object> body = controller.statistics("NSE_EQ|X", "breakout", "5m");
        assertEquals("insufficient_history", body.get("status"));
        assertEquals(3, body.get("sampleSize"));
    }

    private static ActivePattern openPattern(String tf) {
        return ActivePattern.builder()
                .id(UUID.randomUUID())
                .patternType(PatternType.BREAKOUT)
                .symbolId("NSE_EQ|X")
                .timeframe(tf)
                .direction(PatternDirection.LONG)
                .status(PatternStage.DETECTED)
                .confirmationModeUsed(ConfirmationMode.CLOSE)
                .referenceLevel(100)
                .lookbackHigh(100)
                .atrAtDetect(2)
                .entryPrice(101)
                .stopLevel(100)
                .targetLevel(104)
                .detectCandleTime(1)
                .detectedAt(Instant.now())
                .mfePrice(101)
                .maePrice(101)
                .build();
    }
}
