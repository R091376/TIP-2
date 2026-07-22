from __future__ import annotations

from datetime import datetime

from app.market.models import Candle


def from_raw_candles(raw_candles: list | None) -> list[Candle]:
    if not raw_candles:
        return []
    candles: list[Candle] = []
    for raw in raw_candles:
        if not raw or len(raw) < 6:
            continue
        candles.append(
            Candle(
                time=_parse_timestamp(raw[0]),
                open=_to_float(raw[1]),
                high=_to_float(raw[2]),
                low=_to_float(raw[3]),
                close=_to_float(raw[4]),
                volume=_to_int(raw[5]),
            )
        )
    candles.sort(key=lambda c: c.time)
    return candles


def _parse_timestamp(value) -> int:
    s = str(value)
    # ISO-8601 with offset
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except ValueError:
        return int(float(s))


def _to_float(value) -> float:
    return float(value)


def _to_int(value) -> int:
    return int(float(value))
