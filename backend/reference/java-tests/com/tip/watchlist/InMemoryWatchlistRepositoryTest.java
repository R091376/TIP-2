package com.tip.watchlist;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InMemoryWatchlistRepositoryTest {

    private InMemoryWatchlistRepository repo;

    @BeforeEach
    void setUp() {
        repo = new InMemoryWatchlistRepository();
    }

    private static WatchlistEntry entry(
            String symbolId,
            String tradingSymbol,
            Instant addedAt,
            SymbolBootstrapStatus status) {
        return entry(symbolId, tradingSymbol, addedAt, status, true);
    }

    private static WatchlistEntry entry(
            String symbolId,
            String tradingSymbol,
            Instant addedAt,
            SymbolBootstrapStatus status,
            boolean active) {
        return new WatchlistEntry(
                symbolId,
                tradingSymbol,
                "NSE",
                symbolId.startsWith("NSE_INDEX") ? "NSE_INDEX" : "NSE_EQ",
                symbolId.startsWith("NSE_INDEX") ? "INDEX" : "EQ",
                tradingSymbol,
                addedAt,
                active,
                status,
                null
        );
    }

    @Test
    void findPrimary_isFirstPublicActiveInInsertionOrder_notSortedByAddedAt() {
        Instant later = Instant.parse("2026-07-10T12:00:00Z");
        Instant earlier = Instant.parse("2026-07-10T10:00:00Z");

        // Insert second with earlier addedAt first would still not win if inserted second —
        // primary follows insertion order, not addedAt.
        repo.save(entry("NSE_INDEX|Nifty 50", "Nifty 50", later, SymbolBootstrapStatus.READY));
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", earlier, SymbolBootstrapStatus.READY));

        Optional<WatchlistEntry> primary = repo.findPrimary();
        assertTrue(primary.isPresent());
        assertEquals("NSE_INDEX|Nifty 50", primary.get().symbolId());
        assertEquals("Nifty 50", primary.get().tradingSymbol());
    }

    @Test
    void findAllActive_preservesInsertionOrder() {
        Instant t = Instant.parse("2026-07-10T10:00:00Z");
        repo.save(entry("NSE_INDEX|Nifty 50", "Nifty 50", t, SymbolBootstrapStatus.READY));
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", t, SymbolBootstrapStatus.READY));
        repo.save(entry("NSE_EQ|TCS", "TCS", t, SymbolBootstrapStatus.PENDING));

        List<String> ids = repo.findAllActive().stream().map(WatchlistEntry::symbolId).toList();
        assertEquals(List.of("NSE_INDEX|Nifty 50", "NSE_EQ|RELIANCE", "NSE_EQ|TCS"), ids);
    }

    @Test
    void removing_excludedFromPublicApis_butVisibleToFindBySymbolId() {
        Instant t = Instant.parse("2026-07-10T10:00:00Z");
        repo.save(entry("NSE_INDEX|Nifty 50", "Nifty 50", t, SymbolBootstrapStatus.READY));
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", t, SymbolBootstrapStatus.READY));

        repo.save(entry("NSE_INDEX|Nifty 50", "Nifty 50", t, SymbolBootstrapStatus.REMOVING));

        assertFalse(repo.containsSymbolId("NSE_INDEX|Nifty 50"));
        assertTrue(repo.containsSymbolId("NSE_EQ|RELIANCE"));

        assertEquals(1, repo.countActive());
        assertEquals(List.of("NSE_EQ|RELIANCE"),
                repo.findAllActive().stream().map(WatchlistEntry::symbolId).toList());

        // Primary advances past REMOVING head
        assertEquals("NSE_EQ|RELIANCE", repo.findPrimary().orElseThrow().symbolId());

        // Internal lookup still sees REMOVING
        Optional<WatchlistEntry> removing = repo.findBySymbolId("NSE_INDEX|Nifty 50");
        assertTrue(removing.isPresent());
        assertEquals(SymbolBootstrapStatus.REMOVING, removing.get().bootstrapStatus());

        assertTrue(repo.findByTradingSymbolIgnoreCase("Nifty 50").isEmpty());
        assertTrue(repo.findByTradingSymbolIgnoreCase("reliance").isPresent());
    }

    @Test
    void inactive_excludedFromPublicApis_butVisibleToFindBySymbolId() {
        Instant t = Instant.parse("2026-07-10T10:00:00Z");
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", t, SymbolBootstrapStatus.READY, false));
        repo.save(entry("NSE_EQ|TCS", "TCS", t, SymbolBootstrapStatus.READY, true));

        assertFalse(repo.containsSymbolId("NSE_EQ|RELIANCE"));
        assertTrue(repo.containsSymbolId("NSE_EQ|TCS"));
        assertEquals(1, repo.countActive());
        assertEquals(List.of("NSE_EQ|TCS"),
                repo.findAllActive().stream().map(WatchlistEntry::symbolId).toList());
        assertEquals("NSE_EQ|TCS", repo.findPrimary().orElseThrow().symbolId());
        assertTrue(repo.findByTradingSymbolIgnoreCase("RELIANCE").isEmpty());

        Optional<WatchlistEntry> inactive = repo.findBySymbolId("NSE_EQ|RELIANCE");
        assertTrue(inactive.isPresent());
        assertFalse(inactive.get().active());
        assertEquals(SymbolBootstrapStatus.READY, inactive.get().bootstrapStatus());
    }

    @Test
    void save_updatePreservesAddedAtAndMapPosition() {
        Instant firstAdded = Instant.parse("2026-07-10T09:00:00Z");
        Instant ignored = Instant.parse("2026-07-10T11:00:00Z");
        Instant other = Instant.parse("2026-07-10T10:00:00Z");

        repo.save(entry("NSE_INDEX|Nifty 50", "Nifty 50", firstAdded, SymbolBootstrapStatus.PENDING));
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", other, SymbolBootstrapStatus.READY));

        WatchlistEntry updated = repo.save(entry(
                "NSE_INDEX|Nifty 50",
                "Nifty 50",
                ignored,
                SymbolBootstrapStatus.READY
        ));

        assertEquals(firstAdded, updated.addedAt());
        assertEquals(SymbolBootstrapStatus.READY, updated.bootstrapStatus());

        // Still first in insertion order
        assertEquals("NSE_INDEX|Nifty 50", repo.findPrimary().orElseThrow().symbolId());
        assertEquals(
                List.of("NSE_INDEX|Nifty 50", "NSE_EQ|RELIANCE"),
                repo.findAllActive().stream().map(WatchlistEntry::symbolId).toList()
        );
    }

    @Test
    void save_renameTradingSymbol_rekeysIndexAndPreservesOrderAndAddedAt() {
        Instant aAdded = Instant.parse("2026-07-10T09:00:00Z");
        Instant bAdded = Instant.parse("2026-07-10T10:00:00Z");
        Instant ignored = Instant.parse("2026-07-10T12:00:00Z");

        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", aAdded, SymbolBootstrapStatus.READY));
        repo.save(entry("NSE_EQ|TCS", "TCS", bAdded, SymbolBootstrapStatus.READY));

        WatchlistEntry renamed = repo.save(entry(
                "NSE_EQ|RELIANCE",
                "RELIANCE-NEW",
                ignored,
                SymbolBootstrapStatus.READY
        ));

        assertEquals(aAdded, renamed.addedAt());
        assertEquals("RELIANCE-NEW", renamed.tradingSymbol());

        assertTrue(repo.findByTradingSymbolIgnoreCase("RELIANCE").isEmpty());
        assertTrue(repo.findByTradingSymbolIgnoreCase("RELIANCE-NEW").isPresent());
        assertEquals("NSE_EQ|RELIANCE",
                repo.findByTradingSymbolIgnoreCase("reliance-new").orElseThrow().symbolId());
        assertTrue(repo.findByTradingSymbolIgnoreCase("TCS").isPresent());

        assertEquals(
                List.of("NSE_EQ|RELIANCE", "NSE_EQ|TCS"),
                repo.findAllActive().stream().map(WatchlistEntry::symbolId).toList()
        );
        assertEquals("NSE_EQ|RELIANCE", repo.findPrimary().orElseThrow().symbolId());
    }

    @Test
    void save_rejectsBlankSymbolIdAndTradingSymbol() {
        Instant t = Instant.parse("2026-07-10T10:00:00Z");

        assertThrows(IllegalArgumentException.class,
                () -> repo.save(entry("  ", "RELIANCE", t, SymbolBootstrapStatus.READY)));
        assertThrows(IllegalArgumentException.class,
                () -> repo.save(entry("NSE_EQ|RELIANCE", "   ", t, SymbolBootstrapStatus.READY)));
        assertThrows(NullPointerException.class,
                () -> repo.save(new WatchlistEntry(
                        null, "RELIANCE", "NSE", "NSE_EQ", "EQ", "RELIANCE",
                        t, true, SymbolBootstrapStatus.READY, null)));
        assertThrows(NullPointerException.class,
                () -> repo.save(new WatchlistEntry(
                        "NSE_EQ|RELIANCE", null, "NSE", "NSE_EQ", "EQ", "RELIANCE",
                        t, true, SymbolBootstrapStatus.READY, null)));

        assertEquals(0, repo.countActive());
    }

    @Test
    void remove_hardDeletes_includingRemoving() {
        Instant t = Instant.parse("2026-07-10T10:00:00Z");
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", t, SymbolBootstrapStatus.READY));
        repo.save(entry("NSE_EQ|TCS", "TCS", t, SymbolBootstrapStatus.REMOVING));

        assertTrue(repo.remove("NSE_EQ|RELIANCE"));
        assertTrue(repo.remove("NSE_EQ|TCS"));
        assertFalse(repo.remove("NSE_EQ|RELIANCE"));

        assertTrue(repo.findBySymbolId("NSE_EQ|RELIANCE").isEmpty());
        assertTrue(repo.findBySymbolId("NSE_EQ|TCS").isEmpty());
        assertEquals(0, repo.countActive());
        assertTrue(repo.findPrimary().isEmpty());
        assertTrue(repo.findByTradingSymbolIgnoreCase("RELIANCE").isEmpty());
    }

    @Test
    void findByTradingSymbolIgnoreCase_matchesNormalized() {
        Instant t = Instant.parse("2026-07-10T10:00:00Z");
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", t, SymbolBootstrapStatus.READY));

        assertTrue(repo.findByTradingSymbolIgnoreCase("reliance").isPresent());
        assertTrue(repo.findByTradingSymbolIgnoreCase("  Reliance  ").isPresent());
        assertTrue(repo.findByTradingSymbolIgnoreCase("TCS").isEmpty());
    }

    @Test
    void concurrentSave_doesNotCorruptStore() throws Exception {
        int threads = 8;
        int perThread = 50;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger failures = new AtomicInteger();

        for (int t = 0; t < threads; t++) {
            final int threadId = t;
            pool.submit(() -> {
                try {
                    start.await();
                    for (int i = 0; i < perThread; i++) {
                        String id = "NSE_EQ|SYM-" + threadId + "-" + i;
                        repo.save(entry(id, "SYM-" + threadId + "-" + i,
                                Instant.now(), SymbolBootstrapStatus.READY));
                    }
                } catch (Exception e) {
                    failures.incrementAndGet();
                } finally {
                    done.countDown();
                }
            });
        }

        start.countDown();
        assertTrue(done.await(30, TimeUnit.SECONDS));
        pool.shutdown();
        assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        assertEquals(0, failures.get());
        assertEquals(threads * perThread, repo.countActive());
        assertEquals(threads * perThread, repo.findAllActive().size());
    }

    @Test
    void hardMaxSize_helperSemantics_countActiveForCapCheck() {
        // Cap enforcement lives in service layer; repository exposes countActive for it.
        Instant t = Instant.parse("2026-07-10T10:00:00Z");
        int hardMax = 50;
        for (int i = 0; i < hardMax; i++) {
            repo.save(entry("NSE_EQ|S" + i, "S" + i, t, SymbolBootstrapStatus.READY));
        }
        assertEquals(hardMax, repo.countActive());
        // Caller would reject add when countActive() >= hardMax
        assertTrue(repo.countActive() >= hardMax);

        // REMOVING does not count toward the cap
        repo.save(entry("NSE_EQ|S0", "S0", t, SymbolBootstrapStatus.REMOVING));
        assertEquals(hardMax - 1, repo.countActive());
        assertFalse(repo.countActive() >= hardMax);
    }

    @Test
    void findPrimary_emptyWhenAllRemoving() {
        Instant t = Instant.parse("2026-07-10T10:00:00Z");
        repo.save(entry("NSE_EQ|RELIANCE", "RELIANCE", t, SymbolBootstrapStatus.REMOVING));
        assertTrue(repo.findPrimary().isEmpty());
        assertEquals(0, repo.countActive());
        assertEquals(List.of(), new ArrayList<>(repo.findAllActive()));
    }
}
