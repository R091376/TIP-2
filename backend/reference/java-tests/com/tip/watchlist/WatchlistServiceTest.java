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
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WatchlistServiceTest {

    @Mock
    private WatchlistRepository watchlistRepository;
    @Mock
    private InstrumentMasterCache instrumentMasterCache;
    @Mock
    private MarketBootstrapService marketBootstrapService;
    @Mock
    private MarketDataProvider marketDataProvider;
    @Mock
    private CandleEngine candleEngine;
    @Mock
    private LiveCandleBroadcaster liveCandleBroadcaster;
    @Mock
    private LiveWebSocketHandler liveWebSocketHandler;

    private WatchlistProperties watchlistProperties;
    private WatchlistService service;

    @BeforeEach
    void setUp() {
        watchlistProperties = new WatchlistProperties(
                List.of("Nifty 50"),
                Map.of("Nifty 50", "NSE_INDEX|Nifty 50"),
                40,
                50
        );
        service = new WatchlistService(
                watchlistRepository,
                watchlistProperties,
                instrumentMasterCache,
                marketBootstrapService,
                marketDataProvider,
                candleEngine,
                liveCandleBroadcaster,
                liveWebSocketHandler,
                mock(org.springframework.context.ApplicationEventPublisher.class)
        );
    }

    @Test
    void addResolvesInsertsPendingBootstrapsSubscribesAndReturnsReady() {
        ResolvedInstrument resolved = new ResolvedInstrument(
                "NSE_EQ|INE081A01020", "TATASTEEL", "NSE", "NSE_EQ", "EQ", "Tata Steel", null
        );
        when(instrumentMasterCache.resolve("TATASTEEL")).thenReturn(resolved);
        when(watchlistRepository.containsSymbolId(resolved.instrumentKey())).thenReturn(false);
        when(watchlistRepository.findByTradingSymbolIgnoreCase("TATASTEEL")).thenReturn(Optional.empty());
        // reserve: existing check empty; post-bootstrap: READY entry
        when(watchlistRepository.findBySymbolId(resolved.instrumentKey()))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(readyEntry(resolved)));
        when(watchlistRepository.countActive()).thenReturn(10);
        when(watchlistRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(marketBootstrapService.bootstrapSymbol(any(WatchlistEntry.class)))
                .thenReturn(new MarketBootstrapService.BootstrapSymbolResult(
                        resolved.instrumentKey(), SymbolBootstrapStatus.READY, 6, 100, null));

        WatchlistEntry result = service.add("TATASTEEL");

        assertThat(result.bootstrapStatus()).isEqualTo(SymbolBootstrapStatus.READY);
        assertThat(result.symbolId()).isEqualTo(resolved.instrumentKey());

        ArgumentCaptor<WatchlistEntry> saveCaptor = ArgumentCaptor.forClass(WatchlistEntry.class);
        verify(watchlistRepository).save(saveCaptor.capture());
        assertThat(saveCaptor.getValue().bootstrapStatus()).isEqualTo(SymbolBootstrapStatus.PENDING);

        verify(marketBootstrapService).bootstrapSymbol(any(WatchlistEntry.class));
        verify(marketBootstrapService).ensureLiveFeedConnected();
    }

    @Test
    void addByInstrumentKeySkipsTradingSymbolResolve() {
        ResolvedInstrument resolved = new ResolvedInstrument(
                "NSE_EQ|INE002A01018", "RELIANCE", "NSE", "NSE_EQ", "EQ", "Reliance", "INE002A01018"
        );
        when(instrumentMasterCache.findByInstrumentKey("NSE_EQ|INE002A01018"))
                .thenReturn(Optional.of(resolved));
        when(watchlistRepository.containsSymbolId(resolved.instrumentKey())).thenReturn(false);
        when(watchlistRepository.findByTradingSymbolIgnoreCase("RELIANCE")).thenReturn(Optional.empty());
        when(watchlistRepository.findBySymbolId(resolved.instrumentKey()))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(readyEntry(resolved)));
        when(watchlistRepository.countActive()).thenReturn(3);
        when(watchlistRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(marketBootstrapService.bootstrapSymbol(any(WatchlistEntry.class)))
                .thenReturn(new MarketBootstrapService.BootstrapSymbolResult(
                        resolved.instrumentKey(), SymbolBootstrapStatus.READY, 6, 50, null));

        WatchlistEntry result = service.add(null, "NSE_EQ|INE002A01018");

        assertThat(result.tradingSymbol()).isEqualTo("RELIANCE");
        verify(instrumentMasterCache, never()).resolve(any());
        verify(instrumentMasterCache).findByInstrumentKey("NSE_EQ|INE002A01018");
    }

    @Test
    void addRequiresSymbolOrInstrumentKey() {
        assertThatThrownBy(() -> service.add(null, null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThatThrownBy(() -> service.add("  ", "  "))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void addUnexpectedBootstrapExceptionMarksFailedAndReturnsEntry() {
        ResolvedInstrument resolved = new ResolvedInstrument(
                "NSE_EQ|INE081A01020", "TATASTEEL", "NSE", "NSE_EQ", "EQ", "Tata Steel", null
        );
        when(instrumentMasterCache.resolve("TATASTEEL")).thenReturn(resolved);
        when(watchlistRepository.containsSymbolId(resolved.instrumentKey())).thenReturn(false);
        when(watchlistRepository.findByTradingSymbolIgnoreCase("TATASTEEL")).thenReturn(Optional.empty());
        when(watchlistRepository.countActive()).thenReturn(5);
        when(watchlistRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        WatchlistEntry pending = pendingEntry(resolved);
        WatchlistEntry failed = new WatchlistEntry(
                resolved.instrumentKey(), resolved.tradingSymbol(), resolved.exchange(),
                resolved.segment(), resolved.instrumentType(), resolved.displayName(),
                Instant.parse("2026-07-10T00:00:00Z"), true, SymbolBootstrapStatus.FAILED,
                "Bootstrap failed unexpectedly: boom"
        );
        // reserve existing-check empty; markFailedIfStillPresent read; post-bootstrap read FAILED
        when(watchlistRepository.findBySymbolId(resolved.instrumentKey()))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(pending))
                .thenReturn(Optional.of(failed));

        when(marketBootstrapService.bootstrapSymbol(any(WatchlistEntry.class)))
                .thenThrow(new RuntimeException("boom"));

        WatchlistEntry result = service.add("TATASTEEL");

        assertThat(result.bootstrapStatus()).isEqualTo(SymbolBootstrapStatus.FAILED);
        ArgumentCaptor<WatchlistEntry> saves = ArgumentCaptor.forClass(WatchlistEntry.class);
        verify(watchlistRepository, org.mockito.Mockito.atLeast(2)).save(saves.capture());
        assertThat(saves.getAllValues().stream()
                .anyMatch(e -> e.bootstrapStatus() == SymbolBootstrapStatus.FAILED)).isTrue();
        verify(marketBootstrapService).ensureLiveFeedConnected();
    }

    @Test
    void addRemovedDuringBootstrapReturns404() {
        ResolvedInstrument resolved = new ResolvedInstrument(
                "NSE_EQ|INE081A01020", "TATASTEEL", "NSE", "NSE_EQ", "EQ", "Tata Steel", null
        );
        when(instrumentMasterCache.resolve("TATASTEEL")).thenReturn(resolved);
        when(watchlistRepository.containsSymbolId(resolved.instrumentKey())).thenReturn(false);
        when(watchlistRepository.findByTradingSymbolIgnoreCase("TATASTEEL")).thenReturn(Optional.empty());
        when(watchlistRepository.countActive()).thenReturn(5);
        when(watchlistRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(watchlistRepository.findBySymbolId(resolved.instrumentKey()))
                .thenReturn(Optional.empty()) // reserve
                .thenReturn(Optional.empty()); // post-bootstrap: hard-deleted by concurrent remove
        when(marketBootstrapService.bootstrapSymbol(any(WatchlistEntry.class)))
                .thenReturn(new MarketBootstrapService.BootstrapSymbolResult(
                        resolved.instrumentKey(), SymbolBootstrapStatus.REMOVING, 0, 0, "cancelled"));

        assertThatThrownBy(() -> service.add("TATASTEEL"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void addUnknownSymbolThrows404() {
        when(instrumentMasterCache.resolve("FOO")).thenThrow(new InstrumentNotFoundException("FOO"));

        assertThatThrownBy(() -> service.add("FOO"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void addDuplicateTradingSymbolThrows409() {
        ResolvedInstrument resolved = new ResolvedInstrument(
                "NSE_EQ|INE002A01018", "RELIANCE", "NSE", "NSE_EQ", "EQ", "Reliance", null
        );
        when(instrumentMasterCache.resolve("RELIANCE")).thenReturn(resolved);
        when(watchlistRepository.containsSymbolId(resolved.instrumentKey())).thenReturn(true);

        assertThatThrownBy(() -> service.add("RELIANCE"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        verify(marketBootstrapService, never()).bootstrapSymbol(any());
    }

    @Test
    void addAtHardMaxThrows409() {
        ResolvedInstrument resolved = new ResolvedInstrument(
                "NSE_EQ|INE081A01020", "TATASTEEL", "NSE", "NSE_EQ", "EQ", "Tata Steel", null
        );
        when(instrumentMasterCache.resolve("TATASTEEL")).thenReturn(resolved);
        when(watchlistRepository.containsSymbolId(resolved.instrumentKey())).thenReturn(false);
        when(watchlistRepository.findByTradingSymbolIgnoreCase("TATASTEEL")).thenReturn(Optional.empty());
        when(watchlistRepository.findBySymbolId(resolved.instrumentKey())).thenReturn(Optional.empty());
        when(watchlistRepository.countActive()).thenReturn(50);

        assertThatThrownBy(() -> service.add("TATASTEEL"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(rse.getReason()).contains("max 50");
                });

        verify(marketBootstrapService, never()).bootstrapSymbol(any());
    }

    @Test
    void addSoftWarnStillAllowsWhenBelowHardMax() {
        ResolvedInstrument resolved = new ResolvedInstrument(
                "NSE_EQ|INE081A01020", "TATASTEEL", "NSE", "NSE_EQ", "EQ", "Tata Steel", null
        );
        when(instrumentMasterCache.resolve("TATASTEEL")).thenReturn(resolved);
        when(watchlistRepository.containsSymbolId(resolved.instrumentKey())).thenReturn(false);
        when(watchlistRepository.findByTradingSymbolIgnoreCase("TATASTEEL")).thenReturn(Optional.empty());
        when(watchlistRepository.findBySymbolId(resolved.instrumentKey()))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(readyEntry(resolved)));
        when(watchlistRepository.countActive()).thenReturn(40);
        when(watchlistRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(marketBootstrapService.bootstrapSymbol(any(WatchlistEntry.class)))
                .thenReturn(new MarketBootstrapService.BootstrapSymbolResult(
                        resolved.instrumentKey(), SymbolBootstrapStatus.READY, 6, 50, null));

        WatchlistEntry result = service.add("TATASTEEL");
        assertThat(result.bootstrapStatus()).isEqualTo(SymbolBootstrapStatus.READY);
    }

    @Test
    void removeMarksRemovingUnsubscribesEvictsNotifiesAndHardDeletes() {
        String symbolId = "NSE_EQ|INE002A01018";
        WatchlistEntry existing = readyEntry(new ResolvedInstrument(
                symbolId, "RELIANCE", "NSE", "NSE_EQ", "EQ", "Reliance", null
        ));
        when(watchlistRepository.findBySymbolId(symbolId)).thenReturn(Optional.of(existing));
        when(watchlistRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(watchlistRepository.remove(symbolId)).thenReturn(true);

        service.remove(symbolId);

        ArgumentCaptor<WatchlistEntry> saveCaptor = ArgumentCaptor.forClass(WatchlistEntry.class);
        verify(watchlistRepository).save(saveCaptor.capture());
        assertThat(saveCaptor.getValue().bootstrapStatus()).isEqualTo(SymbolBootstrapStatus.REMOVING);

        InOrder order = inOrder(
                marketDataProvider, candleEngine, liveCandleBroadcaster, liveWebSocketHandler, watchlistRepository
        );
        order.verify(marketDataProvider).unsubscribeInstruments(eq(Set.of(symbolId)));
        order.verify(candleEngine).evict(symbolId);
        order.verify(liveCandleBroadcaster).evictThrottleKeys(symbolId);
        order.verify(liveWebSocketHandler).notifySymbolRemoved(symbolId);
        order.verify(watchlistRepository).remove(symbolId);
    }

    @Test
    void removeUnknownThrows404() {
        when(watchlistRepository.findBySymbolId("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.remove("missing"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void listActiveDelegatesToRepository() {
        when(watchlistRepository.findAllActive()).thenReturn(List.of());
        assertThat(service.listActive()).isEmpty();
        verify(watchlistRepository).findAllActive();
    }

    private static WatchlistEntry readyEntry(ResolvedInstrument r) {
        return new WatchlistEntry(
                r.instrumentKey(),
                r.tradingSymbol(),
                r.exchange(),
                r.segment(),
                r.instrumentType(),
                r.displayName(),
                Instant.parse("2026-07-10T00:00:00Z"),
                true,
                SymbolBootstrapStatus.READY,
                null
        );
    }

    private static WatchlistEntry pendingEntry(ResolvedInstrument r) {
        return new WatchlistEntry(
                r.instrumentKey(),
                r.tradingSymbol(),
                r.exchange(),
                r.segment(),
                r.instrumentType(),
                r.displayName(),
                Instant.parse("2026-07-10T00:00:00Z"),
                true,
                SymbolBootstrapStatus.PENDING,
                null
        );
    }
}
