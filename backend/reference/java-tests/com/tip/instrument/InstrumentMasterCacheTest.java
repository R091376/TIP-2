package com.tip.instrument;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tip.config.InstrumentProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Objects;
import java.util.zip.GZIPOutputStream;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InstrumentMasterCacheTest {

    private static final Path FIXTURE = classpathFixture();

    @TempDir
    Path tempDir;

    private InstrumentMasterCache cache;

    private static Path classpathFixture() {
        try {
            URL url = Objects.requireNonNull(
                    InstrumentMasterCacheTest.class.getResource("/instruments/nse-seed-fixture.json"),
                    "classpath fixture /instruments/nse-seed-fixture.json missing");
            return Paths.get(url.toURI());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to resolve classpath instrument fixture", e);
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        InstrumentProperties props = new InstrumentProperties(
                "https://example.invalid/NSE.json.gz",
                tempDir.toString(),
                false
        );
        cache = new InstrumentMasterCache(props, new ObjectMapper());
        assertTrue(Files.isRegularFile(FIXTURE), "fixture missing: " + FIXTURE.toAbsolutePath());
        cache.loadFromFile(FIXTURE);
    }

    @Test
    void resolve_nifty50_caseAndWhitespaceVariants() {
        for (String input : new String[]{
                "Nifty 50",
                "NIFTY 50",
                "nifty 50",
                "  Nifty   50  ",
                "\tnifty  50\n"
        }) {
            ResolvedInstrument resolved = cache.resolve(input);
            assertEquals("NSE_INDEX|Nifty 50", resolved.instrumentKey(), "input=" + input);
            assertEquals("NSE_INDEX", resolved.segment());
            assertEquals("INDEX", resolved.instrumentType());
        }
    }

    @Test
    void resolve_nifty_tradingSymbol() {
        // BOD trading_symbol for Nifty 50 index is "NIFTY"
        ResolvedInstrument resolved = cache.resolve("NIFTY");
        assertEquals("NSE_INDEX|Nifty 50", resolved.instrumentKey());
    }

    @Test
    void resolve_reliance_caseAndWhitespace() {
        for (String input : new String[]{"RELIANCE", "reliance", "  Reliance  "}) {
            ResolvedInstrument resolved = cache.resolve(input);
            assertEquals("NSE_EQ|INE002A01018", resolved.instrumentKey(), "input=" + input);
            assertEquals("RELIANCE", resolved.tradingSymbol());
            assertEquals("NSE_EQ", resolved.segment());
            assertEquals("EQ", resolved.instrumentType());
            assertEquals("INE002A01018", resolved.isin());
        }
    }

    @Test
    void resolve_seedEquities() {
        assertEquals("NSE_EQ|INE467B01029", cache.resolve("TCS").instrumentKey());
        assertEquals("NSE_EQ|INE040A01034", cache.resolve("HDFCBANK").instrumentKey());
        assertEquals("NSE_EQ|INE009A01021", cache.resolve("INFY").instrumentKey());
        assertEquals("NSE_EQ|INE090A01021", cache.resolve("ICICIBANK").instrumentKey());
        assertEquals("NSE_EQ|INE030A01027", cache.resolve("HINDUNILVR").instrumentKey());
        assertEquals("NSE_EQ|INE154A01025", cache.resolve("ITC").instrumentKey());
        assertEquals("NSE_EQ|INE062A01020", cache.resolve("SBIN").instrumentKey());
        assertEquals("NSE_EQ|INE397D01024", cache.resolve("BHARTIARTL").instrumentKey());
    }

    @Test
    void findByInstrumentKey_hitAndMiss() {
        Optional<ResolvedInstrument> hit = cache.findByInstrumentKey("NSE_EQ|INE002A01018");
        assertTrue(hit.isPresent());
        assertEquals("RELIANCE", hit.get().tradingSymbol());

        assertTrue(cache.findByInstrumentKey("NSE_EQ|DOES_NOT_EXIST").isEmpty());
        assertTrue(cache.findByInstrumentKey("  ").isEmpty());
        assertTrue(cache.findByInstrumentKey(null).isEmpty());
    }

    @Test
    void search_prefixTradingSymbolRanksRelianceFirst() {
        List<ResolvedInstrument> hits = cache.search("rel", 15);
        assertFalse(hits.isEmpty());
        assertEquals("RELIANCE", hits.get(0).tradingSymbol());
        assertEquals("NSE_EQ|INE002A01018", hits.get(0).instrumentKey());
    }

    @Test
    void search_niftyFindsIndex() {
        List<ResolvedInstrument> hits = cache.search("nifty", 15);
        assertTrue(hits.stream().anyMatch(r ->
                "NSE_INDEX|Nifty 50".equals(r.instrumentKey())));
    }

    @Test
    void search_shortQueryReturnsEmpty() {
        assertTrue(cache.search("r", 15).isEmpty());
        assertTrue(cache.search("", 15).isEmpty());
        assertTrue(cache.search(null, 15).isEmpty());
    }

    @Test
    void search_respectsLimit() {
        List<ResolvedInstrument> hits = cache.search("a", 2);
        // "a" is length 1 → empty; use "in" which matches INFY / many names
        hits = cache.search("in", 2);
        assertTrue(hits.size() <= 2);
    }

    @Test
    void search_containsDisplayName() {
        // short_name "Reliance" / name RELIANCE INDUSTRIES — query "industries" may match name via display
        // displayName prefers short_name "Reliance"; use "reli" instead already covered.
        // "infosys" matches displayName Infosys (normalized)
        List<ResolvedInstrument> hits = cache.search("infosys", 10);
        assertTrue(hits.stream().anyMatch(r -> "INFY".equals(r.tradingSymbol())));
    }

    @Test
    void resolve_prefersEqOverBe() {
        ResolvedInstrument reliance = cache.resolve("RELIANCE");
        assertEquals("EQ", reliance.instrumentType());
        assertEquals("NSE_EQ|INE002A01018", reliance.instrumentKey());
    }

    @Test
    void resolve_doesNotIndexFoRows() {
        // FO row uses trading_symbol "NIFTY 25JUL FUT" and name "Nifty 50" — FO must be dropped.
        // Nifty 50 still resolves via INDEX name, not FO.
        assertEquals("NSE_INDEX|Nifty 50", cache.resolve("Nifty 50").instrumentKey());
        assertThrows(InstrumentNotFoundException.class, () -> cache.resolve("NIFTY 25JUL FUT"));
    }

    @Test
    void resolve_unknownThrows() {
        InstrumentNotFoundException ex = assertThrows(
                InstrumentNotFoundException.class,
                () -> cache.resolve("NOT_A_REAL_SYMBOL_XYZ")
        );
        assertTrue(ex.getMessage().contains("NOT_A_REAL_SYMBOL_XYZ"));
        assertEquals("NOT_A_REAL_SYMBOL_XYZ", ex.getTradingSymbol());
    }

    @Test
    void ensureLoaded_cdnFailureLeavesEmptyCacheNoCrash() throws Exception {
        Path emptyCache = tempDir.resolve("empty-cdn");
        InstrumentProperties props = new InstrumentProperties(
                "https://cdn.example/NSE.json.gz",
                emptyCache.toString(),
                true
        );
        HttpClient failingClient = mock(HttpClient.class);
        when(failingClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("CDN unreachable"));

        InstrumentMasterCache failing = new InstrumentMasterCache(
                props,
                new ObjectMapper(),
                failingClient
        );
        failing.ensureLoaded();
        assertTrue(failing.isLoaded());
        assertEquals(0, failing.size());
        assertThrows(InstrumentNotFoundException.class, () -> failing.resolve("RELIANCE"));
    }

    @Test
    void ensureLoaded_invalidDownloadKeepsPreviousCache() throws Exception {
        Path cacheDir = tempDir.resolve("keep-good-cache");
        Files.createDirectories(cacheDir);
        Path cacheFile = cacheDir.resolve("NSE.json.gz");

        // Seed a valid prior cache from the fixture.
        Files.write(cacheFile, gzipBytes(Files.readAllBytes(FIXTURE)));

        InstrumentProperties props = new InstrumentProperties(
                "https://cdn.example/NSE.json.gz",
                cacheDir.toString(),
                true
        );

        // HTTP 200 with corrupt body must not overwrite the good cache.
        @SuppressWarnings("unchecked")
        HttpResponse<InputStream> badResponse = mock(HttpResponse.class);
        when(badResponse.statusCode()).thenReturn(200);
        when(badResponse.body()).thenReturn(new ByteArrayInputStream("not-gzip".getBytes()));

        HttpClient badPayloadClient = mock(HttpClient.class);
        when(badPayloadClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(badResponse);

        InstrumentMasterCache reloading = new InstrumentMasterCache(
                props,
                new ObjectMapper(),
                badPayloadClient
        );
        reloading.ensureLoaded();

        assertTrue(Files.isRegularFile(cacheFile), "prior good cache must remain");
        assertEquals("NSE_EQ|INE002A01018", reloading.resolve("RELIANCE").instrumentKey());
        assertEquals("NSE_INDEX|Nifty 50", reloading.resolve("Nifty 50").instrumentKey());
    }

    @Test
    void normalize_collapsesWhitespaceAndUppercases() {
        assertEquals("NIFTY 50", InstrumentMasterCache.normalize("  nifty   50  "));
        assertEquals("RELIANCE", InstrumentMasterCache.normalize("reliance"));
        assertEquals("", InstrumentMasterCache.normalize("   "));
        assertEquals("", InstrumentMasterCache.normalize(null));
    }

    private static byte[] gzipBytes(byte[] raw) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(baos)) {
            gzip.write(raw);
        }
        return baos.toByteArray();
    }
}
