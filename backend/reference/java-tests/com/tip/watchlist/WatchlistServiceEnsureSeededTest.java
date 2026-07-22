package com.tip.watchlist;

import com.tip.api.websocket.LiveCandleBroadcaster;
import com.tip.api.websocket.LiveWebSocketHandler;
import com.tip.config.WatchlistProperties;
import com.tip.instrument.InstrumentMasterCache;
import com.tip.instrument.InstrumentNotFoundException;
import com.tip.instrument.ResolvedInstrument;
import com.tip.market.CandleEngine;
import com.tip.market.MarketBootstrapService;
import com.tip.market.MarketDataProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WatchlistServiceEnsureSeededTest {

    private InMemoryWatchlistRepository repository;
    private InstrumentMasterCache masterCache;
    private WatchlistService service;

    @BeforeEach
    void setUp() {
        repository = new InMemoryWatchlistRepository();
        masterCache = mock(InstrumentMasterCache.class);
        WatchlistProperties props = new WatchlistProperties(
                List.of("Nifty 50", "RELIANCE", "TCS"),
                Map.of("Nifty 50", "NSE_INDEX|Nifty 50"),
                40,
                50
        );
        service = newService(props);
    }

    private WatchlistService newService(WatchlistProperties props) {
        return new WatchlistService(
                repository,
                props,
                masterCache,
                mock(MarketBootstrapService.class),
                mock(MarketDataProvider.class),
                mock(CandleEngine.class),
                mock(LiveCandleBroadcaster.class),
                mock(LiveWebSocketHandler.class),
                mock(org.springframework.context.ApplicationEventPublisher.class)
        );
    }

    @Test
    void ensureSeeded_insertsPinnedKeyAndResolvedEquitiesInOrder() {
        when(masterCache.resolve("Nifty 50")).thenReturn(new ResolvedInstrument(
                "NSE_INDEX|Nifty 50", "Nifty 50", "NSE", "NSE_INDEX", "INDEX", "Nifty 50", null
        ));
        when(masterCache.resolve("RELIANCE")).thenReturn(new ResolvedInstrument(
                "NSE_EQ|INE002A01018", "RELIANCE", "NSE", "NSE_EQ", "EQ", "Reliance", "INE002A01018"
        ));
        when(masterCache.resolve("TCS")).thenReturn(new ResolvedInstrument(
                "NSE_EQ|INE467B01029", "TCS", "NSE", "NSE_EQ", "EQ", "TCS", "INE467B01029"
        ));

        service.ensureSeeded();

        List<WatchlistEntry> active = repository.findAllActive();
        assertEquals(3, active.size());
        assertEquals("NSE_INDEX|Nifty 50", active.get(0).symbolId());
        assertEquals("NSE_EQ|INE002A01018", active.get(1).symbolId());
        assertEquals("NSE_EQ|INE467B01029", active.get(2).symbolId());
        assertEquals("NSE_INDEX|Nifty 50", repository.findPrimary().orElseThrow().symbolId());
        assertEquals(SymbolBootstrapStatus.PENDING, active.get(0).bootstrapStatus());
    }

    @Test
    void ensureSeeded_skipsUnresolvedButKeepsPinnedIndex() {
        when(masterCache.resolve("Nifty 50")).thenThrow(new InstrumentNotFoundException("Nifty 50"));
        when(masterCache.resolve("RELIANCE")).thenThrow(new InstrumentNotFoundException("RELIANCE"));
        when(masterCache.resolve("TCS")).thenThrow(new InstrumentNotFoundException("TCS"));

        service.ensureSeeded();

        assertEquals(1, repository.countActive());
        assertEquals("NSE_INDEX|Nifty 50", repository.findPrimary().orElseThrow().symbolId());
        assertEquals("INDEX", repository.findPrimary().orElseThrow().instrumentType());
    }

    @Test
    void ensureSeeded_noopWhenAlreadyPopulated() {
        repository.save(new WatchlistEntry(
                "NSE_EQ|INE002A01018", "RELIANCE", "NSE", "NSE_EQ", "EQ", "RELIANCE",
                java.time.Instant.now(), true, SymbolBootstrapStatus.READY, null
        ));

        service.ensureSeeded();

        assertEquals(1, repository.countActive());
        verify(masterCache, never()).resolve(anyString());
    }

    @Test
    void ensureSeeded_emptySeedListLeavesEmpty() {
        WatchlistProperties empty = new WatchlistProperties(List.of(), Map.of(), 40, 50);
        service = newService(empty);
        service.ensureSeeded();
        assertTrue(repository.findAllActive().isEmpty());
    }
}
