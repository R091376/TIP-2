from __future__ import annotations

from app.market.models import Candle


class DonchianIndicator:
    DEFAULT_PERIOD = 20

    @staticmethod
    def highest_high(closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD) -> float | None:
        return DonchianIndicator._extremum(closed_ascending, period, high=True, exclude_last=False)

    @staticmethod
    def lowest_low(closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD) -> float | None:
        return DonchianIndicator._extremum(closed_ascending, period, high=False, exclude_last=False)

    @staticmethod
    def prior_highest_high(
        closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD
    ) -> float | None:
        return DonchianIndicator._extremum(closed_ascending, period, high=True, exclude_last=True)

    @staticmethod
    def prior_lowest_low(
        closed_ascending: list[Candle] | None, period: int = DEFAULT_PERIOD
    ) -> float | None:
        return DonchianIndicator._extremum(closed_ascending, period, high=False, exclude_last=True)

    @staticmethod
    def _extremum(
        closed_ascending: list[Candle] | None,
        period: int,
        high: bool,
        exclude_last: bool,
    ) -> float | None:
        if period < 1:
            raise ValueError("period must be >= 1")
        if closed_ascending is None:
            return None
        n = len(closed_ascending)
        end_exclusive = n - 1 if exclude_last else n
        start = end_exclusive - period
        if start < 0 or end_exclusive <= start:
            return None
        value = closed_ascending[start].high if high else closed_ascending[start].low
        for i in range(start + 1, end_exclusive):
            c = closed_ascending[i]
            value = max(value, c.high) if high else min(value, c.low)
        return value
