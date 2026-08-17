"""Parse and validate research stats filter specs (composable stack filters)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.patterns.models import PatternType
from app.patterns.outcome_reasons import OUTCOME_REASONS

IST = ZoneInfo("Asia/Kolkata")

GROUP_BY_ALLOWED = frozenset(
    {
        "symbol,patternType,timeframe",
        "patternType,timeframe",
        "patternType",
        "none",
    }
)

PATTERN_TYPES_ALLOWED = frozenset(p.value for p in PatternType)
TIMEFRAMES_ALLOWED = frozenset({"1m", "5m", "15m", "1h", "4h", "1d"})
DIRECTIONS_ALLOWED = frozenset({"long", "short"})
CONFIRM_MODES_ALLOWED = frozenset({"volume", "close", "both", "close_fallback"})
OUTCOMES_ALLOWED = frozenset({"succeeded", "failed", "expired"})
CLOSED_STATUSES = frozenset({"succeeded", "failed", "expired"})

DISCLAIMER = (
    "Research over virtual pattern-journal outcomes; not brokerage advice; "
    "not paper/live fills."
)


class ResearchFilterError(ValueError):
    """Invalid research filter parameters (maps to HTTP 400)."""


@dataclass(frozen=True)
class ResearchFilterSpec:
    symbol_ids: list[str] | None = None  # None = all active watchlist (resolved later)
    pattern_types: list[str] | None = None
    timeframes: list[str] | None = None
    direction: str | None = None
    flag_confirmed: bool | None = None
    flag_retested: bool | None = None
    flag_strengthened: bool | None = None
    volume_ok_at_detect: bool | None = None
    confirmation_modes: list[str] | None = None
    detect_time_ist_start: time | None = None
    detect_time_ist_end: time | None = None
    detected_from: date | None = None
    detected_to: date | None = None
    outcomes: list[str] | None = None
    resolved_only: bool = False
    exclude_reasons: list[str] | None = None
    include_reasons: list[str] | None = None
    min_planned_rr: float | None = None
    # Planned stop/target distances in ATR units (from compute_planned_rails).
    # Any of min/max risk or min planned RR implies require_valid_rails.
    min_risk_r: float | None = None
    max_risk_r: float | None = None
    require_valid_rails: bool = False
    detector_versions: list[str] | None = None
    group_by: str = "symbol,patternType,timeframe"
    min_sample_size: int = 20
    limit_groups: int = 500
    # Effective after defaulting (always set by parse_research_filters)
    date_defaulted: bool = False

    def echo_filters(self) -> dict[str, Any]:
        """JSON-serializable effective filters for response.filters."""
        out: dict[str, Any] = {
            "groupBy": self.group_by,
            "minSampleSize": self.min_sample_size,
            "limitGroups": self.limit_groups,
            "resolvedOnly": self.resolved_only,
            "requireValidRails": self.require_valid_rails,
            "dateDefaulted": self.date_defaulted,
        }
        if self.symbol_ids is not None:
            out["symbolId"] = list(self.symbol_ids)
        if self.pattern_types is not None:
            out["patternType"] = list(self.pattern_types)
        if self.timeframes is not None:
            out["timeframe"] = list(self.timeframes)
        if self.direction is not None:
            out["direction"] = self.direction
        if self.flag_confirmed is not None:
            out["flagConfirmed"] = self.flag_confirmed
        if self.flag_retested is not None:
            out["flagRetested"] = self.flag_retested
        if self.flag_strengthened is not None:
            out["flagStrengthened"] = self.flag_strengthened
        if self.volume_ok_at_detect is not None:
            out["volumeOkAtDetect"] = self.volume_ok_at_detect
        if self.confirmation_modes is not None:
            out["confirmationMode"] = list(self.confirmation_modes)
        if self.detect_time_ist_start is not None and self.detect_time_ist_end is not None:
            out["detectTimeIstStart"] = self.detect_time_ist_start.strftime("%H:%M")
            out["detectTimeIstEnd"] = self.detect_time_ist_end.strftime("%H:%M")
        if self.detected_from is not None:
            out["detectedFrom"] = self.detected_from.isoformat()
        if self.detected_to is not None:
            out["detectedTo"] = self.detected_to.isoformat()
        if self.outcomes is not None:
            out["outcome"] = list(self.outcomes)
        if self.exclude_reasons is not None:
            out["excludeReasons"] = list(self.exclude_reasons)
        if self.include_reasons is not None:
            out["includeReasons"] = list(self.include_reasons)
        if self.min_planned_rr is not None:
            out["minPlannedRr"] = self.min_planned_rr
        if self.min_risk_r is not None:
            out["minRiskR"] = self.min_risk_r
        if self.max_risk_r is not None:
            out["maxRiskR"] = self.max_risk_r
        if self.detector_versions is not None:
            out["detectorVersion"] = list(self.detector_versions)
        return out


def today_ist() -> date:
    return datetime.now(IST).date()


def lookback_start(today: date | None = None, *, max_range_days: int = 180) -> date:
    """Earliest IST detect date allowed: today − (max_range_days − 1)."""
    d = today if today is not None else today_ist()
    return d - timedelta(days=max(1, int(max_range_days)) - 1)


def parse_csv_list(raw: str | None) -> list[str] | None:
    if raw is None or str(raw).strip() == "":
        return None
    parts = [p.strip() for p in str(raw).split(",")]
    parts = [p for p in parts if p]
    if not parts:
        return None
    return parts


def parse_bool(raw: str | bool | None) -> bool | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        return raw
    v = str(raw).strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    raise ResearchFilterError(f"invalid boolean: {raw!r}")


def parse_hhmm(raw: str | None) -> time | None:
    if raw is None or str(raw).strip() == "":
        return None
    s = str(raw).strip()
    try:
        parts = s.split(":")
        if len(parts) != 2:
            raise ValueError
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        return time(h, m)
    except ValueError as exc:
        raise ResearchFilterError(f"invalid time HH:mm: {raw!r}") from exc


def parse_ymd(raw: str | None) -> date | None:
    if raw is None or str(raw).strip() == "":
        return None
    s = str(raw).strip()
    try:
        return date.fromisoformat(s)
    except ValueError as exc:
        raise ResearchFilterError(f"invalid date YYYY-MM-DD: {raw!r}") from exc


def parse_group_by(raw: str | None) -> str:
    if raw is None or str(raw).strip() == "":
        return "symbol,patternType,timeframe"
    key = str(raw).strip()  # after URL-decode; never split on comma
    if key not in GROUP_BY_ALLOWED:
        raise ResearchFilterError(f"invalid groupBy: {raw!r}")
    return key


def clamp_int(value: int | None, lo: int, hi: int, default: int) -> int:
    if value is None:
        return default
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def parse_nonneg_float(raw: Any, param_name: str) -> float | None:
    """Parse optional non-negative finite float query param; empty → None."""
    if raw is None or str(raw).strip() == "":
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ResearchFilterError(f"invalid {param_name}: {raw!r}") from exc
    if not math.isfinite(value) or value < 0:
        raise ResearchFilterError(f"{param_name} must be a finite number >= 0")
    return value


def parse_research_filters(
    params: dict[str, Any],
    *,
    default_min_sample_size: int = 20,
    max_range_days: int = 180,
    default_lookback_days: int = 180,
) -> ResearchFilterSpec:
    """Build a ResearchFilterSpec from query-string-like params (str values)."""

    def g(name: str) -> Any:
        return params.get(name)

    symbol_ids = parse_csv_list(g("symbolId"))
    pattern_types = parse_csv_list(g("patternType"))
    if pattern_types is not None:
        pattern_types = [p.lower() for p in pattern_types]
        bad = [p for p in pattern_types if p not in PATTERN_TYPES_ALLOWED]
        if bad:
            raise ResearchFilterError(f"unknown patternType: {bad}")

    timeframes = parse_csv_list(g("timeframe"))
    if timeframes is not None:
        bad = [t for t in timeframes if t not in TIMEFRAMES_ALLOWED]
        if bad:
            raise ResearchFilterError(f"unknown timeframe: {bad}")

    direction = g("direction")
    if direction is not None and str(direction).strip() != "":
        direction = str(direction).strip().lower()
        if direction not in DIRECTIONS_ALLOWED:
            raise ResearchFilterError(f"invalid direction: {direction!r}")
    else:
        direction = None

    flag_confirmed = parse_bool(g("flagConfirmed"))
    flag_retested = parse_bool(g("flagRetested"))
    flag_strengthened = parse_bool(g("flagStrengthened"))
    volume_ok = parse_bool(g("volumeOkAtDetect"))

    confirmation_modes = parse_csv_list(g("confirmationMode"))
    if confirmation_modes is not None:
        confirmation_modes = [m.lower() for m in confirmation_modes]
        bad = [m for m in confirmation_modes if m not in CONFIRM_MODES_ALLOWED]
        if bad:
            raise ResearchFilterError(f"unknown confirmationMode: {bad}")

    start_t = parse_hhmm(g("detectTimeIstStart"))
    end_t = parse_hhmm(g("detectTimeIstEnd"))
    if (start_t is None) ^ (end_t is None):
        raise ResearchFilterError(
            "detectTimeIstStart and detectTimeIstEnd must both be set or both omitted"
        )
    if start_t is not None and end_t is not None:
        if _time_to_minutes(start_t) > _time_to_minutes(end_t):
            raise ResearchFilterError("detectTimeIstStart must be <= detectTimeIstEnd")

    detected_from = parse_ymd(g("detectedFrom"))
    detected_to = parse_ymd(g("detectedTo"))
    date_defaulted = False
    today = today_ist()

    if detected_from is None and detected_to is None:
        detected_to = today
        detected_from = today - timedelta(days=max(1, int(default_lookback_days)) - 1)
        date_defaulted = True
    elif detected_from is None and detected_to is not None:
        detected_from = detected_to - timedelta(days=max(1, int(default_lookback_days)) - 1)
        date_defaulted = True
    elif detected_to is None and detected_from is not None:
        detected_to = min(today, detected_from + timedelta(days=max(1, int(max_range_days)) - 1))
        date_defaulted = True

    assert detected_from is not None and detected_to is not None
    if detected_from > today or detected_to > today:
        raise ResearchFilterError("detectedFrom/detectedTo cannot be in the future (IST)")
    if detected_from > detected_to:
        raise ResearchFilterError("detectedFrom must be <= detectedTo")
    span = (detected_to - detected_from).days + 1
    if span > int(max_range_days):
        raise ResearchFilterError(
            f"date range exceeds max {max_range_days} days (got {span})"
        )

    # Hard cap: no research window may start before today − (max_range_days − 1).
    # Older `detectedFrom` is clamped; a range entirely before the cap is rejected.
    earliest = lookback_start(today, max_range_days=max_range_days)
    if detected_to < earliest:
        raise ResearchFilterError(
            f"detectedFrom/detectedTo cannot be before {earliest.isoformat()} "
            f"(max {int(max_range_days)} days)"
        )
    if detected_from < earliest:
        detected_from = earliest
        date_defaulted = True

    resolved_only = parse_bool(g("resolvedOnly"))
    if resolved_only is None:
        resolved_only = False

    outcomes = parse_csv_list(g("outcome"))
    if outcomes is not None:
        outcomes = [o.lower() for o in outcomes]
        bad = [o for o in outcomes if o not in OUTCOMES_ALLOWED]
        if bad:
            raise ResearchFilterError(f"unknown outcome: {bad}")
    if resolved_only:
        if outcomes is None:
            outcomes = ["succeeded", "failed"]
        else:
            outcomes = [o for o in outcomes if o in ("succeeded", "failed")]
            if not outcomes:
                raise ResearchFilterError(
                    "resolvedOnly=true conflicts with outcome filter (no S/F left)"
                )

    exclude_reasons = parse_csv_list(g("excludeReasons"))
    if exclude_reasons is not None:
        bad = [r for r in exclude_reasons if r not in OUTCOME_REASONS]
        if bad:
            raise ResearchFilterError(f"unknown excludeReasons: {bad}")

    include_reasons = parse_csv_list(g("includeReasons"))
    if include_reasons is not None:
        bad = [r for r in include_reasons if r not in OUTCOME_REASONS]
        if bad:
            raise ResearchFilterError(f"unknown includeReasons: {bad}")

    min_planned_rr = parse_nonneg_float(g("minPlannedRr"), "minPlannedRr")
    min_risk_r = parse_nonneg_float(g("minRiskR"), "minRiskR")
    max_risk_r = parse_nonneg_float(g("maxRiskR"), "maxRiskR")
    if (
        min_risk_r is not None
        and max_risk_r is not None
        and min_risk_r > max_risk_r
    ):
        raise ResearchFilterError("minRiskR must be <= maxRiskR")

    require_valid_rails = parse_bool(g("requireValidRails"))
    if require_valid_rails is None:
        require_valid_rails = False
    # Any rails-threshold filter implies a valid trade offer (risk/reward defined).
    if (
        min_planned_rr is not None
        or min_risk_r is not None
        or max_risk_r is not None
    ):
        require_valid_rails = True

    detector_versions = parse_csv_list(g("detectorVersion"))

    group_by = parse_group_by(g("groupBy"))

    raw_min_n = g("minSampleSize")
    try:
        min_n_in = int(raw_min_n) if raw_min_n is not None and str(raw_min_n).strip() != "" else None
    except (TypeError, ValueError):
        min_n_in = None
    min_sample_size = clamp_int(min_n_in, 5, 500, int(default_min_sample_size))

    raw_lim = g("limitGroups")
    try:
        lim_in = int(raw_lim) if raw_lim is not None and str(raw_lim).strip() != "" else None
    except (TypeError, ValueError):
        lim_in = None
    limit_groups = clamp_int(lim_in, 1, 2000, 500)

    return ResearchFilterSpec(
        symbol_ids=symbol_ids,
        pattern_types=pattern_types,
        timeframes=timeframes,
        direction=direction,
        flag_confirmed=flag_confirmed,
        flag_retested=flag_retested,
        flag_strengthened=flag_strengthened,
        volume_ok_at_detect=volume_ok,
        confirmation_modes=confirmation_modes,
        detect_time_ist_start=start_t,
        detect_time_ist_end=end_t,
        detected_from=detected_from,
        detected_to=detected_to,
        outcomes=outcomes,
        resolved_only=resolved_only,
        exclude_reasons=exclude_reasons,
        include_reasons=include_reasons,
        min_planned_rr=min_planned_rr,
        min_risk_r=min_risk_r,
        max_risk_r=max_risk_r,
        require_valid_rails=require_valid_rails,
        detector_versions=detector_versions,
        group_by=group_by,
        min_sample_size=min_sample_size,
        limit_groups=limit_groups,
        date_defaulted=date_defaulted,
    )


def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def as_epoch_seconds(value: int | float | None) -> int:
    try:
        v = int(value or 0)
    except (TypeError, ValueError):
        return 0
    if v >= 1_000_000_000_000:
        return v // 1000
    return v


def detect_candle_ist(detect_candle_time: int | float | None) -> datetime | None:
    sec = as_epoch_seconds(detect_candle_time)
    if sec <= 0:
        return None
    return datetime.fromtimestamp(sec, tz=timezone.utc).astimezone(IST)


def row_matches_filters(
    *,
    symbol_id: str,
    pattern_type: str,
    timeframe: str,
    direction: str,
    status: str,
    flag_confirmed: bool,
    flag_retested: bool,
    flag_strengthened: bool,
    volume_ok_at_detect: bool,
    confirmation_mode_used: str | None,
    detector_version: str,
    detect_candle_time: int,
    final_outcome: str,
    reason: str | None,
    planned_rr: float | None,
    rails_valid: bool,
    spec: ResearchFilterSpec,
    allowed_symbol_ids: set[str],
    risk_r: float | None = None,
) -> bool:
    """Return True if a closed instance+outcome row matches the research filter.

    ``risk_r`` / ``planned_rr`` come from ``compute_planned_rails`` (ATR units).
    True stop-R expectancy is research-side: move_r / risk_r; filters here only
    subset the instance set by planned rails geometry.
    """
    if symbol_id not in allowed_symbol_ids:
        return False
    if status not in CLOSED_STATUSES:
        return False
    if spec.symbol_ids is not None and symbol_id not in set(spec.symbol_ids):
        return False
    if spec.pattern_types is not None and pattern_type not in set(spec.pattern_types):
        return False
    if spec.timeframes is not None and timeframe not in set(spec.timeframes):
        return False
    if spec.direction is not None and direction != spec.direction:
        return False
    if spec.flag_confirmed is not None and bool(flag_confirmed) != spec.flag_confirmed:
        return False
    if spec.flag_retested is not None and bool(flag_retested) != spec.flag_retested:
        return False
    if spec.flag_strengthened is not None and bool(flag_strengthened) != spec.flag_strengthened:
        return False
    if (
        spec.volume_ok_at_detect is not None
        and bool(volume_ok_at_detect) != spec.volume_ok_at_detect
    ):
        return False
    if spec.confirmation_modes is not None:
        mode = (confirmation_mode_used or "").lower()
        if mode not in set(spec.confirmation_modes):
            return False
    if spec.detector_versions is not None and detector_version not in set(
        spec.detector_versions
    ):
        return False
    if spec.outcomes is not None and final_outcome not in set(spec.outcomes):
        return False
    if spec.exclude_reasons is not None and reason is not None:
        if reason in set(spec.exclude_reasons):
            return False
    if spec.include_reasons is not None:
        if reason is None or reason not in set(spec.include_reasons):
            return False

    ist_dt = detect_candle_ist(detect_candle_time)
    if ist_dt is None:
        return False
    d = ist_dt.date()
    if spec.detected_from is not None and d < spec.detected_from:
        return False
    if spec.detected_to is not None and d > spec.detected_to:
        return False

    if spec.detect_time_ist_start is not None and spec.detect_time_ist_end is not None:
        if timeframe == "1d":
            return False  # exclude daily when TOD filter set
        mins = ist_dt.hour * 60 + ist_dt.minute
        lo = _time_to_minutes(spec.detect_time_ist_start)
        hi = _time_to_minutes(spec.detect_time_ist_end)
        if not (lo <= mins <= hi):
            return False

    if spec.require_valid_rails and not rails_valid:
        return False
    if spec.min_planned_rr is not None:
        if planned_rr is None or planned_rr < spec.min_planned_rr:
            return False
    if spec.min_risk_r is not None:
        if risk_r is None or risk_r < spec.min_risk_r:
            return False
    if spec.max_risk_r is not None:
        if risk_r is None or risk_r > spec.max_risk_r:
            return False

    return True
