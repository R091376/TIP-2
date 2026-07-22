package com.tip.market;

import com.upstox.ApiClient;
import com.upstox.feeder.MarketDataStreamerV3;
import com.upstox.feeder.constants.Mode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class UpstoxFeedClientTest {

    private MarketStatusService marketStatusService;
    private MarketDataStreamerV3 streamer;
    private AtomicInteger createCount;
    private UpstoxFeedClient client;

    @BeforeEach
    void setUp() {
        marketStatusService = mock(MarketStatusService.class);
        streamer = mock(MarketDataStreamerV3.class);
        createCount = new AtomicInteger();
        ApiClient apiClient = mock(ApiClient.class);

        client = new UpstoxFeedClient(apiClient, marketStatusService, (api, keys) -> {
            createCount.incrementAndGet();
            return streamer;
        });
    }

    @Test
    void connectThenSubscribe_doesNotRecreateStreamer() {
        client.connect(Set.of("A"), tick -> {
        });
        assertEquals(1, createCount.get());
        assertTrue(client.subscribedKeys().contains("A"));
        verify(streamer).connect();

        client.subscribe(Set.of("B"));
        assertEquals(1, createCount.get());
        assertEquals(Set.of("A", "B"), client.subscribedKeys());
        verify(streamer).subscribe(eq(Set.of("B")), eq(Mode.FULL));
        verify(streamer, never()).disconnect();
    }

    @Test
    void connectWhileLive_onlySubscribesMissingKeys_noRecreate() {
        client.connect(Set.of("A"), tick -> {
        });
        client.connect(Set.of("A", "B"), tick -> {
        });

        assertEquals(1, createCount.get());
        assertEquals(Set.of("A", "B"), client.subscribedKeys());
        verify(streamer, times(1)).connect();
        verify(streamer).subscribe(eq(Set.of("B")), eq(Mode.FULL));
        verify(streamer, never()).disconnect();
    }

    @Test
    void subscribeFailure_rollsBackLocalKeys() {
        client.connect(Set.of("A"), tick -> {
        });
        doThrow(new RuntimeException("SOCKET_NOT_OPEN"))
                .when(streamer).subscribe(eq(Set.of("B")), eq(Mode.FULL));

        client.subscribe(Set.of("B"));

        assertFalse(client.subscribedKeys().contains("B"));
        assertEquals(Set.of("A"), client.subscribedKeys());
    }

    @Test
    void unsubscribeFailure_restoresLocalKeys() {
        client.connect(Set.of("A", "B"), tick -> {
        });
        doThrow(new RuntimeException("SOCKET_NOT_OPEN"))
                .when(streamer).unsubscribe(eq(Set.of("B")));

        client.unsubscribe(Set.of("B"));

        assertTrue(client.subscribedKeys().contains("B"));
        assertEquals(Set.of("A", "B"), client.subscribedKeys());
    }

    @Test
    void unsubscribeSuccess_removesLocalKeyWithoutDisconnect() {
        client.connect(Set.of("A", "B"), tick -> {
        });
        client.unsubscribe(Set.of("B"));

        assertEquals(Set.of("A"), client.subscribedKeys());
        assertTrue(client.isStreamerLive());
        verify(streamer).unsubscribe(eq(Set.of("B")));
        verify(streamer, never()).disconnect();
    }

    @Test
    void disconnect_clearsLocalSet() {
        client.connect(Set.of("A"), tick -> {
        });
        client.disconnect();

        assertTrue(client.subscribedKeys().isEmpty());
        assertFalse(client.isStreamerLive());
        verify(streamer).disconnect();
    }
}
