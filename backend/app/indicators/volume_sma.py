from __future__ import annotations

from app.market.models import Candle


class VolumeSmaIndicator:
    DEFAULT_PERIOD = 20

    @staticmethod
    def latest(closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD) -> float | None:
        return VolumeSmaIndicator.average(closed_ascending, period)

    @staticmethod
    def average(closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD) -> float | None:
        if period < 1:
            raise ValueError("period must be >= 1")
        if closed_ascending is None or len(closed_ascending) < period:
            return None
        n = len(closed_ascending)
        total = sum(closed_ascending[i].volume for i in range(n - period, n))
        return total / period

    @staticmethod
    def prior_average(
        closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD
    ) -> float | None:
        if period < 1:
            raise ValueError("period must be >= 1")
        if closed_ascending is None or len(closed_ascending) < period + 1:
            return None
        end_exclusive = len(closed_ascending) - 1
        start = end_exclusive - period
        total = sum(closed_ascending[i].volume for i in range(start, end_exclusive))
        return total / period
