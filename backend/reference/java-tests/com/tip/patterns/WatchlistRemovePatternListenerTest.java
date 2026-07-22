package com.tip.patterns;

import com.tip.journal.PatternJournal;
import com.tip.patterns.model.ActivePattern;
import com.tip.patterns.model.ConfirmationMode;
import com.tip.patterns.model.PatternDirection;
import com.tip.patterns.model.PatternStage;
import com.tip.patterns.model.PatternType;
import com.tip.watchlist.event.WatchlistSymbolRemovedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WatchlistRemovePatternListenerTest {

    private PatternFeatureGuard guard;
    private ActiveInstanceStore store;
    private PatternJournal journal;
    private PatternEventPublisher publisher;
    private WatchlistRemovePatternListener listener;

    @BeforeEach
    void setUp() {
        guard = mock(PatternFeatureGuard.class);
        store = new ActiveInstanceStore();
        journal = mock(PatternJournal.class);
        publisher = mock(PatternEventPublisher.class);
        listener = new WatchlistRemovePatternListener(
                guard, store, journal, publisher, new PatternSeriesGate());
        when(guard.isFullyEnabled()).thenReturn(true);
    }

    @Test
    void prefersMemoryInstanceAndKeepsExcursions() {
        ActivePattern live = open("NSE_EQ|X", "5m");
        live.setMfePrice(120);
        live.setMaePrice(99);
        store.put(live);
        when(journal.findOpenForSymbol("NSE_EQ|X")).thenReturn(List.of());

        listener.onRemoved(new WatchlistSymbolRemovedEvent("NSE_EQ|X"));

        ArgumentCaptor<ActivePattern> cap = ArgumentCaptor.forClass(ActivePattern.class);
        verify(journal).applyEvents(cap.capture(), anyList());
        ActivePattern expired = cap.getValue();
        assertTrue(expired.isTerminal());
        assertTrue(!expired.suppressExcursionStats(), "memory path should keep excursions");
        assertTrue(store.getOpenForSymbol("NSE_EQ|X").isEmpty());
    }

    @Test
    void journalOnlySuppressesExcursions() {
        ActivePattern journalOnly = open("NSE_EQ|X", "5m");
        // mapper-like seed: mfe=mae=entry would poison stats if counted
        when(journal.findOpenForSymbol("NSE_EQ|X")).thenReturn(List.of(journalOnly));

        listener.onRemoved(new WatchlistSymbolRemovedEvent("NSE_EQ|X"));

        ArgumentCaptor<ActivePattern> cap = ArgumentCaptor.forClass(ActivePattern.class);
        verify(journal).applyEvents(cap.capture(), anyList());
        assertTrue(cap.getValue().suppressExcursionStats());
    }

    @Test
    void disabledOnlyClearsStore() {
        when(guard.isFullyEnabled()).thenReturn(false);
        store.put(open("NSE_EQ|X", "5m"));
        listener.onRemoved(new WatchlistSymbolRemovedEvent("NSE_EQ|X"));
        verify(journal, never()).applyEvents(any(), anyList());
        assertTrue(store.getOpenForSymbol("NSE_EQ|X").isEmpty());
    }

    private static ActivePattern open(String symbolId, String tf) {
        return ActivePattern.builder()
                .id(UUID.randomUUID())
                .patternType(PatternType.BREAKOUT)
                .symbolId(symbolId)
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
