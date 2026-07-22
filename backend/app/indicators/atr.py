from __future__ import annotations

from app.market.models import Candle


class AtrIndicator:
    DEFAULT_PERIOD = 14

    @staticmethod
    def latest(closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD) -> float | None:
        if period < 1:
            raise ValueError("period must be >= 1")
        if closed_ascending is None or len(closed_ascending) < period + 1:
            return None
        atr = 0.0
        for i in range(1, period + 1):
            atr += AtrIndicator.true_range(closed_ascending[i], closed_ascending[i - 1].close)
        atr /= period
        for i in range(period + 1, len(closed_ascending)):
            tr = AtrIndicator.true_range(closed_ascending[i], closed_ascending[i - 1].close)
            atr = (atr * (period - 1) + tr) / period
        return atr

    @staticmethod
    def true_range(bar: Candle, previous_close: float) -> float:
        hl = bar.high - bar.low
        hc = abs(bar.high - previous_close)
        lc = abs(bar.low - previous_close)
        return max(hl, hc, lc)
