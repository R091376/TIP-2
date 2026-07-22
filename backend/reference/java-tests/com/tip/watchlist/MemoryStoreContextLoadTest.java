package com.tip.watchlist;

import com.tip.journal.NoOpPatternJournal;
import com.tip.journal.PatternJournal;
import com.tip.patterns.PatternFeatureGuard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the app boots without PostgreSQL when profile {@code memory} is active.
 */
@SpringBootTest
@ActiveProfiles("memory")
@TestPropertySource(properties = {
        "tip.market.live-feed-enabled=false",
        "tip.upstox.access-token="
})
class MemoryStoreContextLoadTest {

    @Autowired
    private ApplicationContext context;

    @Autowired
    private WatchlistRepository watchlistRepository;

    @Autowired
    private Environment environment;

    @Autowired
    private PatternJournal patternJournal;

    @Autowired
    private PatternFeatureGuard patternFeatureGuard;

    @Test
    void contextLoadsWithInMemoryWatchlistAndNoDataSource() {
        assertNotNull(watchlistRepository);
        assertTrue(watchlistRepository instanceof InMemoryWatchlistRepository);
        assertTrue(context.getBeansOfType(PostgresWatchlistRepository.class).isEmpty());
        assertTrue(context.getBeansOfType(DataSource.class).isEmpty(),
                "memory mode must not create a DataSource");
        assertFalse(environment.getProperty("spring.flyway.enabled", Boolean.class, true));
        assertTrue(patternJournal instanceof NoOpPatternJournal);
        assertFalse(patternJournal.isActive());
        assertFalse(patternFeatureGuard.isFullyEnabled());
    }
}
