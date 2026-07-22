package com.tip.market;

import com.upstox.feeder.MarketUpdateV3;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class IndexVolumeSupportTest {

    private IndexVolumeSupport support;

    @BeforeEach
    void setUp() {
        support = new IndexVolumeSupport();
    }

    @Test
    void prefersOneDayVolumeAsSessionCumulative() {
        MarketUpdateV3.IndexFullFeed feed = indexFeed(
                ohlc("I1", 1000L, 50),
                ohlc("1d", 1_700_000_000_000L, 12_500_000)
        );

        assertEquals(12_500_000L, support.resolveVolumeTradedToday("NSE_INDEX|Nifty 50", feed));
        // Day vol wins — I1 tracker not needed
        assertEquals(12_500_000L, support.resolveVolumeTradedToday("NSE_INDEX|Nifty 50", feed));
    }

    @Test
    void rebuildsSessionVolumeFromOneMinuteBarsWhenNoDayVol() {
        String key = "NSE_INDEX|Nifty 50";
        long t0 = 1_740_727_800_000L;

        assertEquals(
                100L,
                support.resolveVolumeTradedToday(key, indexFeed(ohlc("I1", t0, 100))));
        assertEquals(
                150L,
                support.resolveVolumeTradedToday(key, indexFeed(ohlc("I1", t0, 150))));
        // New minute: previous bar (150) locked into sum, current = 40 → 190
        assertEquals(
                190L,
                support.resolveVolumeTradedToday(key, indexFeed(ohlc("I1", t0 + 60_000L, 40))));
        assertEquals(
                210L,
                support.resolveVolumeTradedToday(key, indexFeed(ohlc("I1", t0 + 60_000L, 60))));
    }

    @Test
    void emptyOhlcReturnsZero() {
        MarketUpdateV3.IndexFullFeed feed = new MarketUpdateV3.IndexFullFeed();
        feed.setMarketOHLC(new MarketUpdateV3.MarketOHLC());
        assertEquals(0L, support.resolveVolumeTradedToday("NSE_INDEX|Nifty 50", feed));
    }

    @Test
    void clearRemovesTrackerState() {
        String key = "NSE_INDEX|Nifty Bank";
        long t0 = 1_740_727_800_000L;
        support.resolveVolumeTradedToday(key, indexFeed(ohlc("I1", t0, 100)));
        support.resolveVolumeTradedToday(key, indexFeed(ohlc("I1", t0 + 60_000L, 50)));
        support.clear(key);
        // Fresh tracker — only current I1
        assertEquals(50L, support.resolveVolumeTradedToday(key, indexFeed(ohlc("I1", t0 + 60_000L, 50))));
    }

    @Test
    void resolveExposesDayAndI1Diagnostics() {
        long t0 = 1_740_727_800_000L;
        IndexVolumeSupport.ResolveResult r = support.resolve(
                "NSE_INDEX|Nifty 50",
                indexFeed(ohlc("I1", t0, 80), ohlc("1d", t0, 9_000_000)));
        assertEquals(9_000_000L, r.volumeTradedToday());
        assertEquals(9_000_000L, r.dayVol());
        assertEquals(80L, r.i1Vol());
        assertEquals(t0, r.i1TsMs());
        assertEquals(2, r.ohlcCount());
        assertEquals("1d", r.source());
    }

    @Test
    void shouldLogFirstTickOncePerKey() {
        assertEquals(true, support.shouldLogFirstTick("NSE_INDEX|Nifty 50"));
        assertEquals(false, support.shouldLogFirstTick("NSE_INDEX|Nifty 50"));
        support.clear("NSE_INDEX|Nifty 50");
        assertEquals(true, support.shouldLogFirstTick("NSE_INDEX|Nifty 50"));
    }

    private static MarketUpdateV3.IndexFullFeed indexFeed(MarketUpdateV3.OHLC... bars) {
        MarketUpdateV3.IndexFullFeed feed = new MarketUpdateV3.IndexFullFeed();
        MarketUpdateV3.MarketOHLC marketOHLC = new MarketUpdateV3.MarketOHLC();
        List<MarketUpdateV3.OHLC> list = new ArrayList<>();
        for (MarketUpdateV3.OHLC bar : bars) {
            list.add(bar);
        }
        marketOHLC.setOhlc(list);
        feed.setMarketOHLC(marketOHLC);
        return feed;
    }

    private static MarketUpdateV3.OHLC ohlc(String interval, long ts, long vol) {
        MarketUpdateV3.OHLC bar = new MarketUpdateV3.OHLC();
        bar.setInterval(interval);
        bar.setTs(ts);
        bar.setVol(vol);
        bar.setOpen(1);
        bar.setHigh(1);
        bar.setLow(1);
        bar.setClose(1);
        return bar;
    }
}
