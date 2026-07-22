package com.tip.api.websocket;

import com.tip.market.event.CandleUpdatedEvent;
import com.tip.market.model.Candle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class LiveCandleBroadcasterTest {

    private LiveWebSocketHandler webSocketHandler;
    private LiveCandleBroadcaster broadcaster;

    @BeforeEach
    void setUp() {
        webSocketHandler = mock(LiveWebSocketHandler.class);
        broadcaster = new LiveCandleBroadcaster(webSocketHandler, 1000L);
    }

    @Test
    void evictThrottleKeysAllowsImmediateResendForInstrument() {
        String key = "NSE_EQ|INE002A01018";
        Candle candle = new Candle(1000L, 1, 1, 1, 1, 0);

        broadcaster.onCandleUpdated(new CandleUpdatedEvent(key, "5m", candle, false));
        // throttled
        broadcaster.onCandleUpdated(new CandleUpdatedEvent(key, "5m", candle, false));
        verify(webSocketHandler, times(1)).broadcast(eq(key), eq("5m"), any());

        broadcaster.evictThrottleKeys(key);

        broadcaster.onCandleUpdated(new CandleUpdatedEvent(key, "5m", candle, false));
        verify(webSocketHandler, times(2)).broadcast(eq(key), eq("5m"), any());
    }
}
