from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time
from typing import Any

from app.patterns.models import PatternType

_ALLOWED_TF = frozenset({"1m", "5m", "15m", "1h", "4h", "1d"})
_ALLOWED_TYPES = frozenset(p.value for p in PatternType)
_KNOB_ATTRS = (
    "breakout",
    "breakdown",
    "pinbar",
    "engulfing",
    "inside_bar",
    "structure",
    "consolidation",
    "volume_breakout",
    "double",
    "head_shoulders",
)
# targetR overlays the detect-time ATR target on every trade family.
_TARGET_ATR_KEYS = (
    ("breakout", "success_atr_mult_without_retest"),
    ("breakdown", "success_atr_mult_without_retest"),
    ("pinbar", "success_atr_mult"),
    ("engulfing", "success_atr_mult"),
    ("inside_bar", "success_atr_mult"),
    ("structure", "success_atr_mult"),
    ("volume_breakout", "success_atr_mult"),
    ("double", "success_atr_mult"),
    ("head_shoulders", "success_atr_mult"),
)


def _parse_hhmm(raw: str | None) -> time | None:
    if not raw or not str(raw).strip():
        return None
    parts = str(raw).strip().split(":")
    if len(parts) < 2:
        raise ValueError(f"Invalid clock '{raw}', expected HH:MM")
    h, m = int(parts[0]), int(parts[1])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError(f"Invalid clock '{raw}'")
    return time(h, m)


def _opt_float(raw) -> float | None:
    if raw is None or raw == "":
        return None
    v = float(raw)
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("risk filter must be a finite number")
    if v < 0:
        raise ValueError("risk filter must be >= 0")
    return v


def _opt_positive_float(raw, name: str) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{name} must be a number") from e
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError(f"{name} must be a finite number")
    if not (v > 0):
        raise ValueError(f"{name} must be > 0")
    return v


def _as_date(raw) -> date:
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(str(raw)[:10])


@dataclass
class PatternSpec:
    symbols: list[str]
    timeframes: list[str]
    pattern_types: list[str]
    from_date: date
    to_date: date
    session_start: str | None = None
    session_end: str | None = None
    target_r: float | None = None
    knobs: dict[str, dict] = field(default_factory=dict)
    require_retest: bool = False
    require_volume: bool = False
    require_confirmed: bool = False
    require_reclaimed: bool = False
    min_risk_r: float | None = None
    max_risk_r: float | None = None
    direction: str | None = None
    trade_enabled: bool = True
    entry: str = "next_open"
    product: str = "MIS"
    stop_wins: bool = True
    qty: int = 1
    one_position: bool = False
    trading_symbols: dict[str, str] = field(default_factory=dict)

    def session_start_time(self) -> time | None:
        return _parse_hhmm(self.session_start)

    def session_end_time(self) -> time | None:
        return _parse_hhmm(self.session_end)

    def enabled_types(self) -> frozenset[str]:
        return frozenset(self.pattern_types)

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbols": list(self.symbols),
            "timeframes": list(self.timeframes),
            "patternTypes": list(self.pattern_types),
            "fromDate": self.from_date.isoformat(),
            "toDate": self.to_date.isoformat(),
            "sessionStart": self.session_start,
            "sessionEnd": self.session_end,
            "targetR": self.target_r,
            "knobs": self.knobs,
            "requireRetest": self.require_retest,
            "requireVolume": self.require_volume,
            "requireConfirmed": self.require_confirmed,
            "requireReclaimed": self.require_reclaimed,
            "minRiskR": self.min_risk_r,
            "maxRiskR": self.max_risk_r,
            "direction": self.direction,
            "trade": {
                "enabled": self.trade_enabled,
                "entry": self.entry,
                "product": self.product,
                "stopWins": self.stop_wins,
                "qty": self.qty,
                "onePosition": self.one_position,
            },
            "tradingSymbols": self.trading_symbols,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> PatternSpec:
        if not isinstance(raw, dict):
            raise ValueError("spec must be an object")
        symbols = [str(s).strip() for s in (raw.get("symbols") or []) if str(s).strip()]
        if not symbols:
            raise ValueError("symbols required")
        tfs = [str(t).strip() for t in (raw.get("timeframes") or []) if str(t).strip()]
        if not tfs:
            raise ValueError("timeframes required")
        bad_tf = [t for t in tfs if t not in _ALLOWED_TF]
        if bad_tf:
            raise ValueError(f"unsupported timeframe(s): {bad_tf}")
        types = [
            str(t).strip().lower()
            for t in (raw.get("patternTypes") or raw.get("pattern_types") or [])
            if str(t).strip()
        ]
        if not types:
            raise ValueError("patternTypes required")
        bad_ty = [t for t in types if t not in _ALLOWED_TYPES]
        if bad_ty:
            raise ValueError(f"unsupported patternTypes: {bad_ty}")
        from_date = _as_date(raw.get("fromDate") or raw.get("from_date"))
        to_date = _as_date(raw.get("toDate") or raw.get("to_date"))
        if from_date > to_date:
            raise ValueError("fromDate must be on or before toDate")
        trade = raw.get("trade") if isinstance(raw.get("trade"), dict) else {}
        knobs = raw.get("knobs") if isinstance(raw.get("knobs"), dict) else {}
        clean_knobs: dict[str, dict] = {}
        for k, v in knobs.items():
            if k in _KNOB_ATTRS and isinstance(v, dict):
                clean_knobs[k] = v
        qty = int(trade.get("qty") or raw.get("qty") or 1)
        if qty < 1:
            raise ValueError("qty must be >= 1")
        product = str(trade.get("product") or raw.get("product") or "MIS").upper()
        if product not in {"MIS", "CNC"}:
            raise ValueError("product must be MIS or CNC")
        labels = raw.get("tradingSymbols") or raw.get("trading_symbols") or {}
        if not isinstance(labels, dict):
            labels = {}
        target_r = _opt_positive_float(
            raw.get("targetR", raw.get("target_r")), "targetR"
        )
        min_r = _opt_float(raw.get("minRiskR", raw.get("min_risk_r")))
        max_r = _opt_float(raw.get("maxRiskR", raw.get("max_risk_r")))
        if min_r is not None and max_r is not None and min_r > max_r:
            raise ValueError("minRiskR must be <= maxRiskR")
        return cls(
            symbols=symbols,
            timeframes=tfs,
            pattern_types=types,
            from_date=from_date,
            to_date=to_date,
            session_start=raw.get("sessionStart") or raw.get("session_start"),
            session_end=raw.get("sessionEnd") or raw.get("session_end"),
            target_r=target_r,
            knobs=clean_knobs,
            require_retest=bool(raw.get("requireRetest") or raw.get("require_retest")),
            require_volume=bool(raw.get("requireVolume") or raw.get("require_volume")),
            require_confirmed=bool(
                raw.get("requireConfirmed") or raw.get("require_confirmed")
            ),
            require_reclaimed=bool(
                raw.get("requireReclaimed") or raw.get("require_reclaimed")
            ),
            min_risk_r=min_r,
            max_risk_r=max_r,
            direction=(str(raw.get("direction")).lower() if raw.get("direction") else None),
            trade_enabled=bool(trade.get("enabled", raw.get("tradeEnabled", True))),
            entry=str(trade.get("entry") or "next_open"),
            product=product,
            stop_wins=bool(trade.get("stopWins", True)),
            qty=qty,
            one_position=bool(trade.get("onePosition") or raw.get("onePosition")),
            trading_symbols={str(k): str(v) for k, v in labels.items()},
        )


def overlay_settings(base, spec: PatternSpec):
    """Clone live Settings and apply spec knobs / target_r. Never mutates ``base``."""
    s = base.model_copy(deep=True)
    for attr, extra in (spec.knobs or {}).items():
        if hasattr(s, attr) and isinstance(extra, dict):
            setattr(s, attr, {**getattr(s, attr), **extra})
    if spec.target_r is not None:
        rr = float(spec.target_r)
        for attr, key in _TARGET_ATR_KEYS:
            cfg = dict(getattr(s, attr) or {})
            cfg[key] = rr
            if attr in ("double", "head_shoulders"):
                # Measured-move floor would ignore a tighter targetR; force ATR rails.
                cfg["target_mode"] = "atr"
            setattr(s, attr, cfg)
    if spec.min_risk_r is not None:
        object.__setattr__(s, "pattern_min_risk_r", float(spec.min_risk_r))
    return s
