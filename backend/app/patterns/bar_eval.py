"""Shared bar evaluation used by live PatternEvaluator and offline replay."""

from __future__ import annotations

import logging
from datetime import datetime

from app.config import Settings
from app.patterns.breakdown import evaluate_breakdown_bar
from app.patterns.breakout import evaluate_breakout_bar
from app.patterns.consolidation import evaluate_consolidation_bar
from app.patterns.double import evaluate_double_bar
from app.patterns.engulfing import evaluate_engulfing_bar
from app.patterns.head_shoulders import evaluate_hs_bar
from app.patterns.inside_bar import evaluate_inside_bar
from app.patterns.models import ActivePattern, PatternType
from app.patterns.pinbar import evaluate_pinbar_bar
from app.patterns.planned_rails import (
    passes_max_risk_r,
    passes_min_risk_r,
    planned_rails_from_pattern,
)
from app.patterns.structure import evaluate_structure_bar
from app.patterns.volume_breakout import evaluate_volume_breakout_bar

logger = logging.getLogger(__name__)

FAMILY_TYPE_IDS: dict[str, frozenset[str]] = {
    "breakout": frozenset({"breakout"}),
    "breakdown": frozenset({"breakdown"}),
    "pinbar": frozenset({"hammer", "shooting_star"}),
    "engulfing": frozenset({"bullish_engulfing", "bearish_engulfing"}),
    "inside_bar": frozenset({"inside_bar"}),
    "structure": frozenset({"higher_high", "lower_low"}),
    "consolidation": frozenset({"consolidation"}),
    "volume_breakout": frozenset({"volume_breakout"}),
    "double": frozenset({"double_bottom", "double_top"}),
    "head_shoulders": frozenset({"head_shoulders", "inverse_head_shoulders"}),
}


def _family_specs():
    return [
        (
            lambda p: p.pattern_type == PatternType.BREAKOUT,
            "breakout",
            evaluate_breakout_bar,
            True,
        ),
        (
            lambda p: p.pattern_type == PatternType.BREAKDOWN,
            "breakdown",
            evaluate_breakdown_bar,
            True,
        ),
        (lambda p: p.pattern_type.is_pin_bar(), "pinbar", evaluate_pinbar_bar, False),
        (
            lambda p: p.pattern_type.is_engulfing(),
            "engulfing",
            evaluate_engulfing_bar,
            False,
        ),
        (
            lambda p: p.pattern_type == PatternType.INSIDE_BAR,
            "inside_bar",
            evaluate_inside_bar,
            False,
        ),
        (
            lambda p: p.pattern_type.is_structure(),
            "structure",
            evaluate_structure_bar,
            False,
        ),
        (
            lambda p: p.pattern_type == PatternType.CONSOLIDATION,
            "consolidation",
            evaluate_consolidation_bar,
            False,
        ),
        (
            lambda p: p.pattern_type == PatternType.VOLUME_BREAKOUT,
            "volume_breakout",
            evaluate_volume_breakout_bar,
            True,
        ),
        (
            lambda p: p.pattern_type.is_double(),
            "double",
            evaluate_double_bar,
            True,
        ),
        (
            lambda p: p.pattern_type.is_head_shoulders(),
            "head_shoulders",
            evaluate_hs_bar,
            True,
        ),
    ]


def gate_min_risk(
    advanced: list[ActivePattern],
    newly: list[ActivePattern],
    events: list,
    still_open: list[ActivePattern],
    min_r: float,
) -> tuple[list[ActivePattern], list[ActivePattern], list, list[ActivePattern]]:
    if min_r <= 0 or not newly:
        return advanced, newly, events, still_open
    kept_newly: list[ActivePattern] = []
    rejected: set = set()
    for p in newly:
        if passes_min_risk_r(p, min_r):
            kept_newly.append(p)
            continue
        rejected.add(p.id)
        rails = planned_rails_from_pattern(p)
        risk_s = f"{rails.risk_r:.4f}" if rails else "n/a"
        logger.info(
            "Suppress detect (risk_r %s < min %.3f): id=%s type=%s %s %s",
            risk_s,
            min_r,
            p.id,
            getattr(p.pattern_type, "value", p.pattern_type),
            p.symbol_id,
            p.timeframe,
        )
    if not rejected:
        return advanced, newly, events, still_open
    advanced = [p for p in advanced if p.id not in rejected]
    events = [e for e in events if getattr(e, "pattern_id", None) not in rejected]
    still_open = [p for p in still_open if p.id not in rejected]
    return advanced, kept_newly, events, still_open


def _drop_new(advanced, newly, events, still_open, drop: set):
    if not drop:
        return advanced, newly, events, still_open
    newly = [p for p in newly if p.id not in drop]
    advanced = [p for p in advanced if p.id not in drop]
    events = [e for e in events if getattr(e, "pattern_id", None) not in drop]
    still_open = [p for p in still_open if p.id not in drop]
    return advanced, newly, events, still_open


def gate_max_risk(
    advanced: list[ActivePattern],
    newly: list[ActivePattern],
    events: list,
    still_open: list[ActivePattern],
    max_r: float | None,
) -> tuple[list[ActivePattern], list[ActivePattern], list, list[ActivePattern]]:
    if max_r is None or max_r <= 0 or not newly:
        return advanced, newly, events, still_open
    drop = {p.id for p in newly if not passes_max_risk_r(p, max_r)}
    return _drop_new(advanced, newly, events, still_open, drop)


def evaluate_families_on_bar(
    *,
    settings: Settings,
    symbol_id: str,
    timeframe: str,
    closed: list,
    open_all: list[ActivePattern],
    now: datetime,
    index: bool,
    enabled_types: frozenset[str] | None = None,
    allow_new_detects: bool = True,
    max_risk_r: float | None = None,
) -> tuple[list[ActivePattern], list[ActivePattern], list, list[ActivePattern]]:
    """Run selected detector families on one closed bar.

    Families are independent (same snapshot of ``open_all``). Returns combined
    advanced / newly / events / still_open.
    """
    atr = settings.atr_period
    min_r = float(getattr(settings, "pattern_min_risk_r", 0.3) or 0.0)
    advanced: list[ActivePattern] = []
    newly: list[ActivePattern] = []
    events: list = []
    still: list[ActivePattern] = []

    for pred, cfg_attr, evaluate_fn, needs_index in _family_specs():
        family_ids = FAMILY_TYPE_IDS.get(cfg_attr, frozenset())
        if enabled_types is not None and family_ids.isdisjoint(enabled_types):
            continue
        cfg = {**getattr(settings, cfg_attr), "atr_period": atr}
        family_on = True
        if cfg_attr == "double":
            family_on = bool(getattr(settings, "pattern_double_enabled", True))
        elif cfg_attr == "head_shoulders":
            family_on = bool(getattr(settings, "pattern_hs_enabled", True))
        tf_map = cfg.get("enabled_timeframes")
        tf_on = True if not isinstance(tf_map, dict) else bool(tf_map.get(timeframe, True))
        cfg = {
            **cfg,
            "_new_detects": bool(
                cfg.get("enabled", True) and family_on and tf_on and allow_new_detects
            ),
        }
        open_items = [p for p in open_all if pred(p)]
        if needs_index:
            ev = evaluate_fn(symbol_id, timeframe, open_items, closed, index, cfg, now)
        else:
            ev = evaluate_fn(symbol_id, timeframe, open_items, closed, cfg, now)
        a, n, e, s = gate_min_risk(
            ev.advanced, ev.newly_detected, ev.events, ev.still_open, min_r
        )
        a, n, e, s = gate_max_risk(a, n, e, s, max_risk_r)
        # Most detectors ignore config["_new_detects"]. Strip brand-new
        # setups here so warmup bars only feed ATR/Donchian, not trades.
        if not allow_new_detects and n:
            a, n, e, s = _drop_new(a, n, e, s, {p.id for p in n})
        if enabled_types is not None and n:
            drop = {p.id for p in n if p.pattern_type.value not in enabled_types}
            a, n, e, s = _drop_new(a, n, e, s, drop)
        advanced.extend(a)
        newly.extend(n)
        events.extend(e)
        still.extend(s)
    return advanced, newly, events, still
