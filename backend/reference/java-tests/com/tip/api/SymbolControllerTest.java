package com.tip.api;

import com.tip.config.MarketProperties;
import com.tip.market.CandleEngine;
import com.tip.market.model.Candle;
import com.tip.watchlist.SymbolBootstrapStatus;
import com.tip.watchlist.WatchlistEntry;
import com.tip.watchlist.WatchlistRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc(addFilters = false)
@WebMvcTest(SymbolController.class)
class SymbolControllerTest {

    private static final String EQ_KEY = "NSE_EQ|INE002A01018";
    private static final String INDEX_KEY = "NSE_INDEX|Nifty 50";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private CandleEngine candleEngine;

    @MockBean
    private WatchlistRepository watchlistRepository;

    @MockBean
    private MarketProperties marketProperties;

    @BeforeEach
    void setUp() {
        when(marketProperties.defaultTimeframe()).thenReturn("5m");
        when(marketProperties.supportedTimeframes()).thenReturn(List.of("1m", "5m", "15m", "1h", "4h", "1d"));
        when(marketProperties.isSupportedTimeframe("5m")).thenReturn(true);
        when(marketProperties.isSupportedTimeframe("1m")).thenReturn(true);
        when(marketProperties.isSupportedTimeframe("99x")).thenReturn(false);
    }

    @Test
    void candlesEncodedPipeAndSpaceReadyReturns200() throws Exception {
        when(watchlistRepository.findBySymbolId(INDEX_KEY)).thenReturn(Optional.of(
                entry(INDEX_KEY, "Nifty 50", SymbolBootstrapStatus.READY)
        ));
        when(candleEngine.getAllCandles(INDEX_KEY, "5m")).thenReturn(List.of(
                new Candle(1000L, 10.0, 11.0, 9.5, 10.5, 100L)
        ));

        // Path template encodes | and space once (MockMvc double-encodes pre-encoded %7C strings)
        mockMvc.perform(get("/api/symbols/{symbolId}/candles", INDEX_KEY)
                        .param("timeframe", "5m"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].time").value(1000))
                .andExpect(jsonPath("$[0].close").value(10.5));
    }

    @Test
    void candlesEncodedEquityKeyReturns200() throws Exception {
        when(watchlistRepository.findBySymbolId(EQ_KEY)).thenReturn(Optional.of(
                entry(EQ_KEY, "RELIANCE", SymbolBootstrapStatus.READY)
        ));
        when(candleEngine.getAllCandles(EQ_KEY, "5m")).thenReturn(List.of(
                new Candle(2000L, 20.0, 21.0, 19.0, 20.5, 50L)
        ));

        mockMvc.perform(get("/api/symbols/{symbolId}/candles", EQ_KEY)
                        .param("timeframe", "5m"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].time").value(2000));
    }

    @Test
    void candlesNotOnWatchlistReturns404() throws Exception {
        when(watchlistRepository.findBySymbolId("NSE_EQ|MISSING")).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/symbols/{symbolId}/candles", "NSE_EQ|MISSING")
                        .param("timeframe", "5m"))
                .andExpect(status().isNotFound());
    }

    @Test
    void candlesRemovingReturns404() throws Exception {
        when(watchlistRepository.findBySymbolId(EQ_KEY)).thenReturn(Optional.of(
                entry(EQ_KEY, "RELIANCE", SymbolBootstrapStatus.REMOVING)
        ));

        mockMvc.perform(get("/api/symbols/{symbolId}/candles", EQ_KEY)
                        .param("timeframe", "5m"))
                .andExpect(status().isNotFound());
    }

    @Test
    void candlesFailedReturns503() throws Exception {
        when(watchlistRepository.findBySymbolId(EQ_KEY)).thenReturn(Optional.of(
                new WatchlistEntry(
                        EQ_KEY, "RELIANCE", "NSE", "NSE_EQ", "EQ", "Reliance",
                        Instant.parse("2026-07-10T00:00:00Z"), true,
                        SymbolBootstrapStatus.FAILED, "token expired"
                )
        ));

        mockMvc.perform(get("/api/symbols/{symbolId}/candles", EQ_KEY)
                        .param("timeframe", "5m"))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void candlesPendingReturns200EmptyArray() throws Exception {
        when(watchlistRepository.findBySymbolId(EQ_KEY)).thenReturn(Optional.of(
                entry(EQ_KEY, "RELIANCE", SymbolBootstrapStatus.PENDING)
        ));

        mockMvc.perform(get("/api/symbols/{symbolId}/candles", EQ_KEY)
                        .param("timeframe", "5m"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void candlesReadyEmptyEngineReturns200Empty() throws Exception {
        when(watchlistRepository.findBySymbolId(EQ_KEY)).thenReturn(Optional.of(
                entry(EQ_KEY, "RELIANCE", SymbolBootstrapStatus.READY)
        ));
        when(candleEngine.getAllCandles(EQ_KEY, "5m")).thenReturn(List.of());

        mockMvc.perform(get("/api/symbols/{symbolId}/candles", EQ_KEY)
                        .param("timeframe", "5m"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void candlesUnsupportedTimeframeReturns400() throws Exception {
        when(watchlistRepository.findBySymbolId(EQ_KEY)).thenReturn(Optional.of(
                entry(EQ_KEY, "RELIANCE", SymbolBootstrapStatus.READY)
        ));

        mockMvc.perform(get("/api/symbols/{symbolId}/candles", EQ_KEY)
                        .param("timeframe", "99x"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void candlesPreEncodedUriDecodesPipeAndSpace() throws Exception {
        // Client-style pre-encoded path via URI (avoids MockMvc double-encoding of % sequences)
        when(watchlistRepository.findBySymbolId(INDEX_KEY)).thenReturn(Optional.of(
                entry(INDEX_KEY, "Nifty 50", SymbolBootstrapStatus.READY)
        ));
        when(candleEngine.getAllCandles(INDEX_KEY, "5m")).thenReturn(List.of(
                new Candle(1000L, 10.0, 11.0, 9.5, 10.5, 100L)
        ));

        mockMvc.perform(get(java.net.URI.create("/api/symbols/NSE_INDEX%7CNifty%2050/candles?timeframe=5m")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].time").value(1000));
    }

    private static WatchlistEntry entry(String symbolId, String tradingSymbol, SymbolBootstrapStatus status) {
        return new WatchlistEntry(
                symbolId,
                tradingSymbol,
                "NSE",
                symbolId.startsWith("NSE_INDEX") ? "NSE_INDEX" : "NSE_EQ",
                symbolId.startsWith("NSE_INDEX") ? "INDEX" : "EQ",
                tradingSymbol,
                Instant.parse("2026-07-10T00:00:00Z"),
                true,
                status,
                null
        );
    }
}
