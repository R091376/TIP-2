"""Simple in-process event bus (replaces Spring ApplicationEventPublisher)."""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Callable
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class EventBus:
    def __init__(self) -> None:
        self._handlers: dict[type, list[Callable[[Any], None]]] = defaultdict(list)

    def subscribe(self, event_type: type[T], handler: Callable[[T], None]) -> None:
        self._handlers[event_type].append(handler)  # type: ignore[arg-type]

    def publish(self, event: Any) -> None:
        for handler in list(self._handlers.get(type(event), [])):
            try:
                handler(event)
            except Exception:
                logger.exception("Event handler failed for %s", type(event).__name__)


# Domain events
from dataclasses import dataclass

from app.market.models import Candle


@dataclass(frozen=True, slots=True)
class CandleUpdatedEvent:
    instrument_key: str
    timeframe: str
    candle: Candle
    is_final: bool


@dataclass(frozen=True, slots=True)
class CandleClosedEvent:
    instrument_key: str
    timeframe: str
    candle: Candle


@dataclass(frozen=True, slots=True)
class MarketPhaseChangedEvent:
    phase: str


@dataclass(frozen=True, slots=True)
class WatchlistSymbolRemovedEvent:
    symbol_id: str


@dataclass(frozen=True, slots=True)
class PatternStageEvent:
    instrument_key: str
    timeframe: str
    pattern_type: str
    stage: str
    payload: dict[str, Any]
