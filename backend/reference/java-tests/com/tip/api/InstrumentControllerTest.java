package com.tip.api;

import com.tip.instrument.InstrumentMasterCache;
import com.tip.instrument.ResolvedInstrument;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc(addFilters = false)
@WebMvcTest(InstrumentController.class)
class InstrumentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private InstrumentMasterCache instrumentMasterCache;

    @Test
    void searchReturnsHits() throws Exception {
        when(instrumentMasterCache.search(eq("rel"), eq(15))).thenReturn(List.of(
                new ResolvedInstrument(
                        "NSE_EQ|INE002A01018",
                        "RELIANCE",
                        "NSE",
                        "NSE_EQ",
                        "EQ",
                        "Reliance",
                        "INE002A01018"
                )
        ));

        mockMvc.perform(get("/api/instruments/search").param("q", "rel"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].instrumentKey").value("NSE_EQ|INE002A01018"))
                .andExpect(jsonPath("$[0].tradingSymbol").value("RELIANCE"))
                .andExpect(jsonPath("$[0].displayName").value("Reliance"))
                .andExpect(jsonPath("$[0].segment").value("NSE_EQ"));
    }

    @Test
    void searchPassesCustomLimit() throws Exception {
        when(instrumentMasterCache.search(eq("tc"), eq(5))).thenReturn(List.of());

        mockMvc.perform(get("/api/instruments/search").param("q", "tc").param("limit", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
