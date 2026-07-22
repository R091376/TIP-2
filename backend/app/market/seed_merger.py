from __future__ import annotations

from app.market.models import Candle


def merge_candles(historical: list[Candle], intraday: list[Candle]) -> list[Candle]:
    by_time: dict[int, Candle] = {}
    for c in historical:
        by_time[c.time] = c
    for c in intraday:
        by_time[c.time] = c
    return [by_time[t] for t in sorted(by_time)]
