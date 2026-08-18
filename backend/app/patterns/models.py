from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class PatternType(str, Enum):
    BREAKOUT = "breakout"
    BREAKDOWN = "breakdown"
    CONSOLIDATION = "consolidation"
    VOLUME_BREAKOUT = "volume_breakout"
    HAMMER = "hammer"
    SHOOTING_STAR = "shooting_star"
    BULLISH_ENGULFING = "bullish_engulfing"
    BEARISH_ENGULFING = "bearish_engulfing"
    INSIDE_BAR = "inside_bar"
    HIGHER_HIGH = "higher_high"
    LOWER_LOW = "lower_low"

    def is_pin_bar(self) -> bool:
        return self in (PatternType.HAMMER, PatternType.SHOOTING_STAR)

    def is_engulfing(self) -> bool:
        return self in (PatternType.BULLISH_ENGULFING, PatternType.BEARISH_ENGULFING)

    def is_structure(self) -> bool:
        return self in (PatternType.HIGHER_HIGH, PatternType.LOWER_LOW)


class PatternStage(str, Enum):
    DETECTED = "detected"
    CONFIRMED = "confirmed"
    RETESTED = "retested"
    STRENGTHENED = "strengthened"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    EXPIRED = "expired"


class PatternDirection(str, Enum):
    LONG = "long"
    SHORT = "short"


class ConfirmationMode(str, Enum):
    VOLUME = "volume"
    CLOSE = "close"
    BOTH = "both"
    CLOSE_FALLBACK = "close_fallback"


class FinalOutcome(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    EXPIRED = "expired"


@dataclass
class PatternStageEvent:
    pattern_id: UUID
    stage: PatternStage
    candle_time: int
    price: float
    at: datetime


@dataclass
class ActivePattern:
    id: UUID
    pattern_type: PatternType
    symbol_id: str
    timeframe: str
    direction: PatternDirection
    status: PatternStage = PatternStage.DETECTED
    flag_confirmed: bool = False
    flag_retested: bool = False
    flag_strengthened: bool = False
    volume_ok_at_detect: bool = False
    confirmation_mode_used: ConfirmationMode = ConfirmationMode.BOTH
    reference_level: float = 0.0
    lookback_high: float = 0.0
    atr_at_detect: float = 0.0
    volume_at_detect: int = 0
    entry_price: float = 0.0
    stop_level: float = 0.0
    target_level: float = 0.0
    retest_floor: float | None = None
    detect_candle_time: int = 0
    detected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    confirmed_at: datetime | None = None
    mfe_price: float = 0.0
    mae_price: float = 0.0
    duration_candles: int = 1
    sessions_seen: int = 0
    detector_version: str = "v1"
    sr_method: str | None = None
    sr_session_date: date | None = None
    sr_nearest: str | None = None
    sr_near: bool | None = None
    sr_distance_atr: float | None = None
    sr_cross: str | None = None
    sr_confluence: bool | None = None
    sr_break: bool | None = None
    sr_open_through: str | None = None
    sr_gap_dir: str | None = None
    sr_ladder_json: dict | None = None
    terminal: bool = False
    final_outcome: FinalOutcome | None = None
    terminal_reason: str | None = None
    end_price: float | None = None
    suppress_excursion_stats: bool = False

    def is_terminal(self) -> bool:
        return self.terminal

    def mark_terminal(
        self,
        outcome: FinalOutcome,
        stage: PatternStage,
        reason: str,
        end_price: float | None,
        suppress_excursion_stats: bool = False,
    ) -> None:
        self.terminal = True
        self.final_outcome = outcome
        self.status = stage
        self.terminal_reason = reason
        self.end_price = end_price
        self.suppress_excursion_stats = suppress_excursion_stats

    def refresh_display_status(self) -> None:
        if self.terminal:
            return
        if self.flag_strengthened:
            self.status = PatternStage.STRENGTHENED
        elif self.flag_retested:
            self.status = PatternStage.RETESTED
        elif self.flag_confirmed:
            self.status = PatternStage.CONFIRMED
        else:
            self.status = PatternStage.DETECTED

    def favorable_extreme_price(self) -> float:
        """LONG: max high; SHORT: min low."""
        return self.mae_price if self.direction == PatternDirection.SHORT else self.mfe_price

    def adverse_extreme_price(self) -> float:
        """LONG: min low; SHORT: max high."""
        return self.mfe_price if self.direction == PatternDirection.SHORT else self.mae_price

    def max_favorable_r(self) -> float:
        if self.atr_at_detect <= 0:
            return 0.0
        if self.direction == PatternDirection.SHORT:
            return (self.entry_price - self.mae_price) / self.atr_at_detect
        return (self.mfe_price - self.entry_price) / self.atr_at_detect

    def max_adverse_r(self) -> float:
        if self.atr_at_detect <= 0:
            return 0.0
        if self.direction == PatternDirection.SHORT:
            return (self.mfe_price - self.entry_price) / self.atr_at_detect
        return (self.entry_price - self.mae_price) / self.atr_at_detect

    def move_r(self) -> float | None:
        if self.end_price is None or self.atr_at_detect <= 0:
            return None
        if self.direction == PatternDirection.SHORT:
            return (self.entry_price - self.end_price) / self.atr_at_detect
        return (self.end_price - self.entry_price) / self.atr_at_detect

    def to_dto(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "symbolId": self.symbol_id,
            "timeframe": self.timeframe,
            "patternType": self.pattern_type.value,
            "direction": self.direction.value,
            "stage": self.status.value,
            "status": self.status.value,
            "flagConfirmed": self.flag_confirmed,
            "flagRetested": self.flag_retested,
            "flagStrengthened": self.flag_strengthened,
            "referenceLevel": self.reference_level,
            "lookbackHigh": self.lookback_high,
            "atrAtDetect": self.atr_at_detect,
            "entryPrice": self.entry_price,
            "stopLevel": self.stop_level,
            "targetLevel": self.target_level,
            "retestFloor": self.retest_floor,
            "detectCandleTime": self.detect_candle_time,
            "detectedAt": _iso(self.detected_at),
            "confirmedAt": _iso(self.confirmed_at) if self.confirmed_at else None,
            "mfePrice": self.mfe_price,
            "maePrice": self.mae_price,
            "durationCandles": self.duration_candles,
            "detectorVersion": self.detector_version,
            "srMethod": self.sr_method,
            "srSessionDate": self.sr_session_date.isoformat() if self.sr_session_date else None,
            "srNearest": self.sr_nearest,
            "srNear": self.sr_near,
            "srDistanceAtr": self.sr_distance_atr,
            "srCross": self.sr_cross,
            "srConfluence": self.sr_confluence,
            "srBreak": self.sr_break,
            "srOpenThrough": self.sr_open_through,
            "srGapDir": self.sr_gap_dir,
            "srLadder": self.sr_ladder_json,
            "terminal": self.terminal,
            "finalOutcome": self.final_outcome.value if self.final_outcome else None,
            "terminalReason": self.terminal_reason,
            "endPrice": self.end_price,
            "active": not self.terminal,
        }


def new_pattern(**kwargs) -> ActivePattern:
    return ActivePattern(
        id=kwargs.get("id") or uuid4(),
        pattern_type=kwargs["pattern_type"],
        symbol_id=kwargs["symbol_id"],
        timeframe=kwargs["timeframe"],
        direction=kwargs["direction"],
        status=kwargs.get("status", PatternStage.DETECTED),
        flag_confirmed=kwargs.get("flag_confirmed", False),
        flag_retested=kwargs.get("flag_retested", False),
        flag_strengthened=kwargs.get("flag_strengthened", False),
        volume_ok_at_detect=kwargs.get("volume_ok_at_detect", False),
        confirmation_mode_used=kwargs.get("confirmation_mode_used", ConfirmationMode.BOTH),
        reference_level=float(kwargs.get("reference_level", 0)),
        lookback_high=float(kwargs.get("lookback_high", 0)),
        atr_at_detect=float(kwargs.get("atr_at_detect", 0)),
        volume_at_detect=int(kwargs.get("volume_at_detect", 0)),
        entry_price=float(kwargs.get("entry_price", 0)),
        stop_level=float(kwargs.get("stop_level", 0)),
        target_level=float(kwargs.get("target_level", 0)),
        retest_floor=kwargs.get("retest_floor"),
        detect_candle_time=int(kwargs.get("detect_candle_time", 0)),
        detected_at=kwargs.get("detected_at") or datetime.now(timezone.utc),
        confirmed_at=kwargs.get("confirmed_at"),
        mfe_price=float(kwargs.get("mfe_price", 0)),
        mae_price=float(kwargs.get("mae_price", 0)),
        duration_candles=int(kwargs.get("duration_candles", 1)),
        sessions_seen=int(kwargs.get("sessions_seen", 0)),
        detector_version=str(kwargs.get("detector_version", "v1")),
        sr_method=kwargs.get("sr_method"),
        sr_session_date=kwargs.get("sr_session_date"),
        sr_nearest=kwargs.get("sr_nearest"),
        sr_near=kwargs.get("sr_near"),
        sr_distance_atr=kwargs.get("sr_distance_atr"),
        sr_cross=kwargs.get("sr_cross"),
        sr_confluence=kwargs.get("sr_confluence"),
        sr_break=kwargs.get("sr_break"),
        sr_open_through=kwargs.get("sr_open_through"),
        sr_gap_dir=kwargs.get("sr_gap_dir"),
        sr_ladder_json=kwargs.get("sr_ladder_json"),
    )


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


@dataclass
class BarEvaluation:
    advanced: list[ActivePattern] = field(default_factory=list)
    newly_detected: list[ActivePattern] = field(default_factory=list)
    events: list[PatternStageEvent] = field(default_factory=list)
    still_open: list[ActivePattern] = field(default_factory=list)

    def add_events(self, events: list[PatternStageEvent]) -> None:
        self.events.extend(events)

    def track(self, p: ActivePattern) -> None:
        if not p.is_terminal():
            self.still_open.append(p)
