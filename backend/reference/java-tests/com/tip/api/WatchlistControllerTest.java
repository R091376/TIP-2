package com.tip.api;

import com.tip.api.dto.AddWatchlistRequest;
import com.tip.watchlist.SymbolBootstrapStatus;
import com.tip.watchlist.WatchlistEntry;
import com.tip.watchlist.WatchlistService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc(addFilters = false)
@WebMvcTest(WatchlistController.class)
class WatchlistControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private WatchlistService watchlistService;

    @Test
    void listReturnsActiveEntries() throws Exception {
        when(watchlistService.listActive()).thenReturn(List.of(
                entry("NSE_INDEX|Nifty 50", "Nifty 50", SymbolBootstrapStatus.READY)
        ));

        mockMvc.perform(get("/api/watchlist"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].symbolId").value("NSE_INDEX|Nifty 50"))
                .andExpect(jsonPath("$[0].tradingSymbol").value("Nifty 50"))
                .andExpect(jsonPath("$[0].bootstrapStatus").value("READY"));
    }

    @Test
    void postAddReturns200WithReadyEntry() throws Exception {
        when(watchlistService.add(eq("TATASTEEL"), eq(null))).thenReturn(
                entry("NSE_EQ|INE081A01020", "TATASTEEL", SymbolBootstrapStatus.READY)
        );

        mockMvc.perform(post("/api/watchlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"symbol\":\"TATASTEEL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tradingSymbol").value("TATASTEEL"))
                .andExpect(jsonPath("$.bootstrapStatus").value("READY"));
    }

    @Test
    void postAddByInstrumentKeyReturns200() throws Exception {
        when(watchlistService.add(eq(null), eq("NSE_EQ|INE002A01018"))).thenReturn(
                entry("NSE_EQ|INE002A01018", "RELIANCE", SymbolBootstrapStatus.READY)
        );

        mockMvc.perform(post("/api/watchlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"instrumentKey\":\"NSE_EQ|INE002A01018\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tradingSymbol").value("RELIANCE"))
                .andExpect(jsonPath("$.symbolId").value("NSE_EQ|INE002A01018"));
    }

    @Test
    void postAddDuplicateReturns409() throws Exception {
        when(watchlistService.add(eq("RELIANCE"), eq(null))).thenThrow(
                new ResponseStatusException(HttpStatus.CONFLICT, "Symbol already on watchlist: RELIANCE")
        );

        mockMvc.perform(post("/api/watchlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"symbol\":\"RELIANCE\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void postAddAtHardMaxReturns409() throws Exception {
        when(watchlistService.add(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Watchlist is full (max 50 symbols)"));

        mockMvc.perform(post("/api/watchlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"symbol\":\"TATASTEEL\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void postAddUnknownSymbolReturns404() throws Exception {
        when(watchlistService.add(eq("FOOBAR"), eq(null))).thenThrow(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown trading symbol: FOOBAR")
        );

        mockMvc.perform(post("/api/watchlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"symbol\":\"FOOBAR\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteEncodedPipeAndSpaceReturns204() throws Exception {
        // Path template encodes | and space once
        doNothing().when(watchlistService).remove("NSE_INDEX|Nifty 50");

        mockMvc.perform(delete("/api/watchlist/{symbolId}", "NSE_INDEX|Nifty 50"))
                .andExpect(status().isNoContent());

        verify(watchlistService).remove(eq("NSE_INDEX|Nifty 50"));
    }

    @Test
    void deleteEncodedEquityKeyReturns204() throws Exception {
        doNothing().when(watchlistService).remove("NSE_EQ|INE002A01018");

        mockMvc.perform(delete("/api/watchlist/{symbolId}", "NSE_EQ|INE002A01018"))
                .andExpect(status().isNoContent());

        verify(watchlistService).remove(eq("NSE_EQ|INE002A01018"));
    }

    @Test
    void deletePreEncodedUriDecodesPipe() throws Exception {
        doNothing().when(watchlistService).remove("NSE_EQ|INE002A01018");

        mockMvc.perform(delete(java.net.URI.create("/api/watchlist/NSE_EQ%7CINE002A01018")))
                .andExpect(status().isNoContent());

        verify(watchlistService).remove(eq("NSE_EQ|INE002A01018"));
    }

    @Test
    void deleteUnknownReturns404() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbol not on watchlist: X"))
                .when(watchlistService).remove("missing");

        mockMvc.perform(delete("/api/watchlist/missing"))
                .andExpect(status().isNotFound());
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
