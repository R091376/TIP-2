package com.tip.market;

import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class MarketPhaseClockReconcilerTest {

    @Test
    void scheduledTickDelegatesToMarketStatusService() {
        MarketStatusService status = mock(MarketStatusService.class);
        MarketPhaseClockReconciler reconciler = new MarketPhaseClockReconciler(status);

        reconciler.refreshPhaseFromClock();

        verify(status, times(1)).refreshPhaseFromClock();
    }
}
