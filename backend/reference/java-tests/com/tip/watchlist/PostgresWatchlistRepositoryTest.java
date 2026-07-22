package com.tip.watchlist;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PostgresWatchlistRepositoryTest {

    @Autowired
    private WatchlistRepository watchlistRepository;

    @Autowired
    private WatchlistSymbolJpaRepository jpaRepository;

    @BeforeEach
    void clean() {
        jpaRepository.deleteAll();
    }

    @Test
    void saveFindPrimaryAndSoftDelete() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        Instant t1 = Instant.parse("2026-01-01T00:01:00Z");

        watchlistRepository.save(entry("NSE_INDEX|Nifty 50", "Nifty 50", t0));
        watchlistRepository.save(entry("NSE_EQ|INE002A01018", "RELIANCE", t1));

        assertEquals(2, watchlistRepository.countActive());
        assertEquals("NSE_INDEX|Nifty 50", watchlistRepository.findPrimary().orElseThrow().symbolId());

        List<WatchlistEntry> active = watchlistRepository.findAllActive();
        assertEquals(List.of("Nifty 50", "RELIANCE"),
                active.stream().map(WatchlistEntry::tradingSymbol).toList());

        assertTrue(watchlistRepository.remove("NSE_INDEX|Nifty 50"));
        assertEquals(1, watchlistRepository.countActive());
        assertEquals("NSE_EQ|INE002A01018", watchlistRepository.findPrimary().orElseThrow().symbolId());
        assertTrue(watchlistRepository.findBySymbolId("NSE_INDEX|Nifty 50").isEmpty());

        // Soft-deleted row remains in table
        assertTrue(jpaRepository.findById("NSE_INDEX|Nifty 50").isPresent());
        assertFalse(jpaRepository.findById("NSE_INDEX|Nifty 50").orElseThrow().isActive());
    }

    @Test
    void reAddReactivatesSoftDeletedRow() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        Instant t1 = Instant.parse("2026-01-02T00:00:00Z");

        watchlistRepository.save(entry("NSE_EQ|INE002A01018", "RELIANCE", t0));
        watchlistRepository.remove("NSE_EQ|INE002A01018");

        WatchlistEntry readded = watchlistRepository.save(entry("NSE_EQ|INE002A01018", "RELIANCE", t1));
        assertTrue(readded.active());
        assertEquals(t1, readded.addedAt());
        assertEquals(1, watchlistRepository.countActive());
        assertEquals(1, jpaRepository.count()); // same PK, not a second row
    }

    @Test
    void updatePreservesAddedAt() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        watchlistRepository.save(entry("NSE_EQ|INE002A01018", "RELIANCE", t0));

        WatchlistEntry pending = watchlistRepository.findBySymbolId("NSE_EQ|INE002A01018").orElseThrow();
        watchlistRepository.save(new WatchlistEntry(
                pending.symbolId(),
                pending.tradingSymbol(),
                pending.exchange(),
                pending.segment(),
                pending.instrumentType(),
                pending.displayName(),
                Instant.parse("2099-01-01T00:00:00Z"), // must be ignored on update
                true,
                SymbolBootstrapStatus.READY,
                null
        ));

        Optional<WatchlistEntry> after = watchlistRepository.findBySymbolId("NSE_EQ|INE002A01018");
        assertTrue(after.isPresent());
        assertEquals(t0, after.get().addedAt());
        assertEquals(SymbolBootstrapStatus.READY, after.get().bootstrapStatus());
    }

    @Test
    void publicQueriesExcludeRemoving() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        watchlistRepository.save(entry("NSE_EQ|INE002A01018", "RELIANCE", t0));
        WatchlistEntry e = watchlistRepository.findBySymbolId("NSE_EQ|INE002A01018").orElseThrow();
        watchlistRepository.save(new WatchlistEntry(
                e.symbolId(), e.tradingSymbol(), e.exchange(), e.segment(), e.instrumentType(),
                e.displayName(), e.addedAt(), true, SymbolBootstrapStatus.REMOVING, null
        ));

        assertEquals(0, watchlistRepository.countActive());
        assertTrue(watchlistRepository.findAllActive().isEmpty());
        assertTrue(watchlistRepository.findPrimary().isEmpty());
        assertFalse(watchlistRepository.containsSymbolId("NSE_EQ|INE002A01018"));
        // Internal lookup still sees REMOVING while active
        assertTrue(watchlistRepository.findBySymbolId("NSE_EQ|INE002A01018").isPresent());
    }

    private static WatchlistEntry entry(String symbolId, String tradingSymbol, Instant addedAt) {
        return new WatchlistEntry(
                symbolId,
                tradingSymbol,
                "NSE",
                symbolId.startsWith("NSE_INDEX") ? "NSE_INDEX" : "NSE_EQ",
                symbolId.startsWith("NSE_INDEX") ? "INDEX" : "EQ",
                tradingSymbol,
                addedAt,
                true,
                SymbolBootstrapStatus.PENDING,
                null
        );
    }
}
