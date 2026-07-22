package com.tip.market;

import com.tip.config.MarketProperties;
import com.tip.config.UpstoxProperties;
import com.tip.market.model.Candle;
import com.tip.watchlist.InMemoryWatchlistRepository;
import com.tip.watchlist.SymbolBootstrapStatus;
import com.tip.watchlist.WatchlistEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.inOrder;

class MarketBootstrapServiceTest {

    private MarketDataProvider marketDataProvider;
    private CandleEngine candleEngine;
    private MarketStatusService marketStatusService;
    private InMemoryWatchlistRepository repository;
    private MarketBootstrapService service;

    @BeforeEach
    void setUp() {
        marketDataProvider = mock(MarketDataProvider.class);
        candleEngine = new CandleEngine(event -> {
        });
        marketStatusService = mock(MarketStatusService.class);
        repository = new InMemoryWatchlistRepository();

        MarketProperties marketProperties = new MarketProperties(
                "Nifty 50",
                "NSE_INDEX|Nifty 50",
                "5m",
                List.of("5m", "15m"),
                null,
                null,
                false
        );
        UpstoxProperties upstoxProperties = new UpstoxProperties("test-token");

        service = new MarketBootstrapService(
                marketDataProvider,
                candleEngine,
                marketProperties,
                upstoxProperties,
                marketStatusService,
                repository
        );
        ReflectionTestUtils.setField(service, "liveFeedEnabled", true);
    }

    @Test
    void bootstrapSymbol_readyWhenAtLeastOneTfSeeded() {
        WatchlistEntry entry = pending("NSE_INDEX|Nifty 50", "Nifty 50");
        repository.save(entry);

        when(marketDataProvider.fetchIntradayCandles(eq(entry.symbolId()), anyString()))
                .thenReturn(List.of(new Candle(1000L, 1, 1, 1, 1, 0)));
        when(marketDataProvider.fetchHistoricalCandles(eq(entry.symbolId()), anyString(), any(), any()))
                .thenReturn(List.of());

        MarketBootstrapService.BootstrapSymbolResult result = service.bootstrapSymbol(entry);

        assertEquals(SymbolBootstrapStatus.READY, result.status());
        assertEquals(2, result.seededTimeframeCount());
        assertEquals(SymbolBootstrapStatus.READY,
                repository.findBySymbolId(entry.symbolId()).orElseThrow().bootstrapStatus());
    }

    @Test
    void bootstrapSymbol_emptyCandlesDoNotCountAsSuccessfulTf() {
        WatchlistEntry entry = pending("NSE_INDEX|Nifty 50", "Nifty 50");
        repository.save(entry);

        when(marketDataProvider.fetchIntradayCandles(anyString(), anyString()))
                .thenReturn(List.of());
        when(marketDataProvider.fetchHistoricalCandles(anyString(), anyString(), any(), any()))
                .thenReturn(List.of());

        MarketBootstrapService.BootstrapSymbolResult result = service.bootstrapSymbol(entry);

        assertEquals(SymbolBootstrapStatus.FAILED, result.status());
        assertEquals(0, result.seededTimeframeCount());
        assertEquals(SymbolBootstrapStatus.FAILED,
                repository.findBySymbolId(entry.symbolId()).orElseThrow().bootstrapStatus());
    }

    @Test
    void bootstrapSymbol_failedWhenZeroTfSeeded() {
        WatchlistEntry entry = pending("NSE_EQ|INE002A01018", "RELIANCE");
        repository.save(entry);

        when(marketDataProvider.fetchIntradayCandles(anyString(), anyString()))
                .thenThrow(new UpstoxMarketDataException("boom", new RuntimeException("401 Unauthorized")));
        when(marketDataProvider.fetchHistoricalCandles(anyString(), anyString(), any(), any()))
                .thenThrow(new UpstoxMarketDataException("boom", new RuntimeException("401 Unauthorized")));

        MarketBootstrapService.BootstrapSymbolResult result = service.bootstrapSymbol(entry);

        assertEquals(SymbolBootstrapStatus.FAILED, result.status());
        assertEquals(SymbolBootstrapStatus.FAILED,
                repository.findBySymbolId(entry.symbolId()).orElseThrow().bootstrapStatus());
    }

    @Test
    void bootstrapSymbol_abortsWhenRemoving() {
        WatchlistEntry entry = pending("NSE_EQ|INE002A01018", "RELIANCE");
        repository.save(entry);
        // mark REMOVING before bootstrap
        repository.save(new WatchlistEntry(
                entry.symbolId(), entry.tradingSymbol(), entry.exchange(), entry.segment(),
                entry.instrumentType(), entry.displayName(), entry.addedAt(), true,
                SymbolBootstrapStatus.REMOVING, null
        ));

        MarketBootstrapService.BootstrapSymbolResult result = service.bootstrapSymbol(entry);

        assertEquals(SymbolBootstrapStatus.REMOVING, result.status());
        verify(marketDataProvider, never()).fetchIntradayCandles(anyString(), anyString());
    }

    @Test
    void recoverAllActive_globalReadyWhenOneSymbolReady_andConnectsAllKeys() {
        repository.save(pending("NSE_INDEX|Nifty 50", "Nifty 50"));
        repository.save(pending("NSE_EQ|INE002A01018", "RELIANCE"));

        when(marketDataProvider.fetchIntradayCandles(anyString(), anyString()))
                .thenReturn(List.of(new Candle(1000L, 1, 1, 1, 1, 0)));
        when(marketDataProvider.fetchHistoricalCandles(anyString(), anyString(), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(List.of());

        AtomicReference<Set<String>> connectedKeys = new AtomicReference<>();
        doAnswer(inv -> {
            connectedKeys.set(inv.getArgument(0));
            return null;
        }).when(marketDataProvider).connectLiveFeed(any(Set.class), any(TickHandler.class));

        service.recoverAllActive();

        var order = inOrder(marketStatusService);
        order.verify(marketStatusService).setBootstrapPending();
        order.verify(marketStatusService).setBootstrapReady(org.mockito.ArgumentMatchers.anyInt());
        verify(marketDataProvider, times(1)).connectLiveFeed(any(Set.class), any(TickHandler.class));
        assertEquals(2, connectedKeys.get().size());
        assertTrue(connectedKeys.get().contains("NSE_INDEX|Nifty 50"));
        assertTrue(connectedKeys.get().contains("NSE_EQ|INE002A01018"));
        assertEquals(SymbolBootstrapStatus.READY,
                repository.findBySymbolId("NSE_INDEX|Nifty 50").orElseThrow().bootstrapStatus());
    }

    @Test
    void recoverAllActive_tokenBlank_setsPendingThenFailsWithoutFetch() {
        UpstoxProperties blank = new UpstoxProperties("");
        MarketProperties marketProperties = new MarketProperties(
                "Nifty 50", "NSE_INDEX|Nifty 50", "5m", List.of("5m"), null, null, false);
        service = new MarketBootstrapService(
                marketDataProvider, candleEngine, marketProperties, blank,
                marketStatusService, repository);
        repository.save(pending("NSE_INDEX|Nifty 50", "Nifty 50"));

        service.recoverAllActive();

        var order = inOrder(marketStatusService);
        order.verify(marketStatusService).setBootstrapPending();
        order.verify(marketStatusService).setBootstrapFailed(
                org.mockito.ArgumentMatchers.contains("UPSTOX_ACCESS_TOKEN"));
        verify(marketDataProvider, never()).fetchIntradayCandles(anyString(), anyString());
    }

    private static WatchlistEntry pending(String symbolId, String tradingSymbol) {
        return new WatchlistEntry(
                symbolId,
                tradingSymbol,
                "NSE",
                symbolId.startsWith("NSE_INDEX") ? "NSE_INDEX" : "NSE_EQ",
                symbolId.startsWith("NSE_INDEX") ? "INDEX" : "EQ",
                tradingSymbol,
                Instant.parse("2026-07-10T00:00:00Z"),
                true,
                SymbolBootstrapStatus.PENDING,
                null
        );
    }
}
