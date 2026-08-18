"""Pure metric aggregation for research (composable stack) stats."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

from app.patterns.expected_r import expected_r
from app.patterns.outcome_reasons import SKIP_EXCURSION_REASONS
from app.patterns.planned_rails import compute_planned_rails, median_planned_rr
from app.patterns.research_filters import DISCLAIMER, ResearchFilterSpec


@dataclass
class ResearchRow:
    """One closed instance + outcome for research aggregation."""

    symbol_id: str
    pattern_type: str
    timeframe: str
    direction: str
    status: str
    flag_confirmed: bool
    flag_retested: bool
    flag_strengthened: bool
    volume_ok_at_detect: bool
    confirmation_mode_used: str | None
    detector_version: str
    detect_candle_time: int
    entry_price: float
    stop_level: float
    target_level: float | None
    atr_at_detect: float
    final_outcome: str
    reason: str | None
    duration_candles: int
    max_favorable_r: float | None
    max_adverse_r: float | None
    move_r: float | None
    sr_method: str | None = None
    sr_nearest: str | None = None
    sr_near: bool | None = None
    sr_cross: str | None = None
    sr_confluence: bool | None = None
    sr_break: bool | None = None
    sr_open_through: tuple[str, ...] | None = None
    sr_gap_dir: str | None = None
    sr_ladder: dict | None = None
    # Filled on first rails() call (or at snapshot load) so filter + aggregate
    # do not recompute planned rails per query.
    _rails: Any = field(default=None, repr=False, compare=False)
    _rails_ready: bool = field(default=False, repr=False, compare=False)

    def skip_excursions(self) -> bool:
        return (self.reason or "") in SKIP_EXCURSION_REASONS

    def rails(self):
        if not self._rails_ready:
            self._rails = compute_planned_rails(
                pattern_type=self.pattern_type,
                direction=self.direction,
                entry=self.entry_price,
                stop=self.stop_level,
                target=self.target_level,
                atr=self.atr_at_detect,
            )
            self._rails_ready = True
        return self._rails


@dataclass
class _Bucket:
    symbol_id: str
    pattern_type: str
    timeframe: str
    sr_nearest: str = ""
    success: int = 0
    fail: int = 0
    expired: int = 0
    duration_sum: float = 0.0
    duration_n: int = 0
    move_sum: float = 0.0
    move_n: int = 0
    mfe_sum: float = 0.0
    mfe_n: int = 0
    mae_sum: float = 0.0
    mae_n: int = 0
    risk_sum: float = 0.0
    reward_sum: float = 0.0
    rails_n: int = 0
    planned_rrs: list[float] = field(default_factory=list)
    win_move_sum: float = 0.0
    win_move_n: int = 0
    loss_move_sum: float = 0.0
    loss_move_n: int = 0

    @property
    def sample_size(self) -> int:
        return self.success + self.fail + self.expired

    def add(self, row: ResearchRow) -> None:
        fo = (row.final_outcome or "").lower()
        if fo == "succeeded":
            self.success += 1
        elif fo == "failed":
            self.fail += 1
        else:
            self.expired += 1
        self.duration_sum += float(row.duration_candles or 0)
        self.duration_n += 1

        skip = row.skip_excursions()
        if not skip:
            if row.move_r is not None:
                self.move_sum += float(row.move_r)
                self.move_n += 1
                if fo == "succeeded":
                    self.win_move_sum += float(row.move_r)
                    self.win_move_n += 1
                elif fo == "failed":
                    self.loss_move_sum += float(row.move_r)
                    self.loss_move_n += 1
            if row.max_favorable_r is not None:
                self.mfe_sum += float(row.max_favorable_r)
                self.mfe_n += 1
            if row.max_adverse_r is not None:
                self.mae_sum += float(row.max_adverse_r)
                self.mae_n += 1
            rails = row.rails()
            if rails is not None:
                self.risk_sum += rails.risk_r
                self.reward_sum += rails.reward_r
                self.rails_n += 1
                self.planned_rrs.append(rails.planned_rr)

    def absorb(self, other: "_Bucket") -> None:
        self.success += other.success
        self.fail += other.fail
        self.expired += other.expired
        self.duration_sum += other.duration_sum
        self.duration_n += other.duration_n
        self.move_sum += other.move_sum
        self.move_n += other.move_n
        self.mfe_sum += other.mfe_sum
        self.mfe_n += other.mfe_n
        self.mae_sum += other.mae_sum
        self.mae_n += other.mae_n
        self.risk_sum += other.risk_sum
        self.reward_sum += other.reward_sum
        self.rails_n += other.rails_n
        self.planned_rrs.extend(other.planned_rrs)
        self.win_move_sum += other.win_move_sum
        self.win_move_n += other.win_move_n
        self.loss_move_sum += other.loss_move_sum
        self.loss_move_n += other.loss_move_n


def group_key(row: ResearchRow, group_by: str) -> tuple[str, str, str, str]:
    nearest = row.sr_nearest if row.sr_nearest else "unset"
    if group_by == "none":
        return ("*", "*", "*", "")
    if group_by == "patternType":
        return ("*", row.pattern_type, "*", "")
    if group_by == "patternType,timeframe":
        return ("*", row.pattern_type, row.timeframe, "")
    if group_by == "srNearest":
        return ("*", "*", "*", nearest)
    if group_by == "patternType,srNearest":
        return ("*", row.pattern_type, "*", nearest)
    return (row.symbol_id, row.pattern_type, row.timeframe, "")


def _avg(sum_v: float, n: int) -> float | None:
    if n <= 0:
        return None
    return sum_v / n


def _ratio_of_averages(reward_avg: float | None, risk_avg: float | None) -> float | None:
    if reward_avg is None or risk_avg is None or not (risk_avg > 0):
        return None
    return reward_avg / risk_avg


def bucket_to_item(
    b: _Bucket,
    *,
    min_n: int,
    trading_symbol: str | None = None,
    display_name: str | None = None,
) -> dict[str, Any]:
    n = b.sample_size
    ready = n >= min_n
    resolved = b.success + b.fail
    success_rate = (b.success / n) if n else 0.0
    resolved_rate = (b.success / resolved) if resolved else None

    avg_risk = _avg(b.risk_sum, b.rails_n)
    avg_reward = _avg(b.reward_sum, b.rails_n)
    avg_planned = _ratio_of_averages(avg_reward, avg_risk)
    med = median_planned_rr(b.planned_rrs)

    avg_move = _avg(b.move_sum, b.move_n)
    item: dict[str, Any] = {
        "status": "ok" if ready else "insufficient_history",
        "symbolId": b.symbol_id,
        "tradingSymbol": trading_symbol,
        "displayName": display_name,
        "patternType": b.pattern_type,
        "timeframe": b.timeframe,
        "sampleSize": n,
        "successCount": b.success,
        "failCount": b.fail,
        "expiredCount": b.expired,
        "minSampleSize": min_n,
        "resolvedSampleSize": resolved,
        "moveSampleSize": b.move_n,
        "mfeSampleSize": b.mfe_n,
        "maeSampleSize": b.mae_n,
        "plannedRrSampleSize": b.rails_n,
        "successRate": success_rate if ready else None,
        "resolvedSuccessRate": resolved_rate if ready else None,
        "avgMoveR": avg_move if ready else None,
        "avgDurationCandles": _avg(b.duration_sum, b.duration_n) if ready else None,
        "avgMfeR": _avg(b.mfe_sum, b.mfe_n) if ready else None,
        "avgMaeR": _avg(b.mae_sum, b.mae_n) if ready else None,
        "avgPlannedRr": avg_planned if ready and b.rails_n > 0 else None,
        "avgRiskR": avg_risk if ready and b.rails_n > 0 else None,
        "avgRewardR": avg_reward if ready and b.rails_n > 0 else None,
        "minPlannedRr": (min(b.planned_rrs) if b.planned_rrs and ready else None),
        "maxPlannedRr": (max(b.planned_rrs) if b.planned_rrs and ready else None),
        "medianPlannedRr": med if ready and b.rails_n > 0 else None,
        "expectedR": (
            expected_r(resolved_rate, avg_planned)
            if ready
            else None
        ),
        "avgWinMoveR": (
            _avg(b.win_move_sum, b.win_move_n) if ready and b.win_move_n > 0 else None
        ),
        "avgLossMoveR": (
            _avg(b.loss_move_sum, b.loss_move_n) if ready and b.loss_move_n > 0 else None
        ),
        "srNearest": b.sr_nearest or None,
    }
    return item


def research_sort_key(item: dict[str, Any]) -> tuple:
    """Ready first → Expected R desc → resolvedSuccessRate desc → sampleSize → keys."""
    ready = 0 if item.get("status") == "ok" else 1
    edge = item.get("expectedR")
    edge_key = -(edge if edge is not None else -1.0e9)
    rate = item.get("resolvedSuccessRate")
    rate_key = -(rate if rate is not None else -1.0)
    n = -int(item.get("sampleSize") or 0)
    return (
        ready,
        edge_key,
        rate_key,
        n,
        str(item.get("symbolId") or ""),
        str(item.get("patternType") or ""),
        str(item.get("timeframe") or ""),
    )


def _passes_min_expected_r(item: dict[str, Any], floor: float) -> bool:
    edge = item.get("expectedR")
    if edge is None:
        return False
    try:
        return float(edge) >= floor
    except (TypeError, ValueError):
        return False


def aggregate_research(
    rows: Iterable[ResearchRow],
    spec: ResearchFilterSpec,
    *,
    symbol_labels: dict[str, tuple[str | None, str | None]] | None = None,
) -> dict[str, Any]:
    """
    Aggregate filtered rows into research response body (without filters echo).

    symbol_labels: symbol_id → (tradingSymbol, displayName)
    """
    labels = symbol_labels or {}
    buckets: dict[tuple[str, str, str, str], _Bucket] = {}

    for row in rows:
        key = group_key(row, spec.group_by)
        b = buckets.get(key)
        if b is None:
            b = _Bucket(key[0], key[1], key[2], key[3])
            buckets[key] = b
        b.add(row)

    min_n = spec.min_sample_size
    kept: list[tuple[tuple[str, str, str], dict[str, Any]]] = []
    for key, b in buckets.items():
        ts, dn = (None, None)
        if b.symbol_id != "*":
            ts, dn = labels.get(b.symbol_id, (None, None))
        item = bucket_to_item(b, min_n=min_n, trading_symbol=ts, display_name=dn)
        if spec.min_expected_r is None or _passes_min_expected_r(
            item, spec.min_expected_r
        ):
            kept.append((key, item))

    items_all = [it for _, it in kept]
    ready_group_count = sum(1 for it in items_all if it["status"] == "ok")

    items_all.sort(key=research_sort_key)
    total_groups = len(items_all)
    limit = spec.limit_groups
    items = items_all[:limit]
    truncated = total_groups > len(items)

    # Summary matches surviving groups when minExpectedR dropped any.
    summary_bucket = _Bucket("*", "*", "*", "")
    for key, _ in kept:
        summary_bucket.absorb(buckets[key])
    total = summary_bucket.sample_size
    summary_item = bucket_to_item(summary_bucket, min_n=min_n)
    summary = {
        "sampleSize": summary_item["sampleSize"],
        "successCount": summary_item["successCount"],
        "failCount": summary_item["failCount"],
        "expiredCount": summary_item["expiredCount"],
        "resolvedSampleSize": summary_item["resolvedSampleSize"],
        "ready": summary_item["status"] == "ok",
        "readyGroupCount": ready_group_count,
        "successRate": summary_item["successRate"],
        "resolvedSuccessRate": summary_item["resolvedSuccessRate"],
        "expectedR": summary_item["expectedR"],
        "avgMoveR": summary_item["avgMoveR"],
        "avgPlannedRr": summary_item["avgPlannedRr"],
        "scannedFrom": (
            spec.detected_from.isoformat() if spec.detected_from else None
        ),
        "scannedTo": spec.detected_to.isoformat() if spec.detected_to else None,
    }

    return {
        "minSampleSize": min_n,
        "groupBy": spec.group_by,
        "totalMatched": total,
        "totalGroups": total_groups,
        "count": len(items),
        "truncated": truncated,
        "filters": spec.echo_filters(),
        "summary": summary,
        "disclaimer": DISCLAIMER,
        "items": items,
    }


def empty_research_response(spec: ResearchFilterSpec) -> dict[str, Any]:
    return {
        "minSampleSize": spec.min_sample_size,
        "groupBy": spec.group_by,
        "totalMatched": 0,
        "totalGroups": 0,
        "count": 0,
        "truncated": False,
        "filters": spec.echo_filters(),
        "summary": {
            "sampleSize": 0,
            "successCount": 0,
            "failCount": 0,
            "expiredCount": 0,
            "resolvedSampleSize": 0,
            "ready": False,
            "readyGroupCount": 0,
            "successRate": None,
            "resolvedSuccessRate": None,
            "expectedR": None,
            "avgMoveR": None,
            "avgPlannedRr": None,
            "scannedFrom": (
                spec.detected_from.isoformat() if spec.detected_from else None
            ),
            "scannedTo": spec.detected_to.isoformat() if spec.detected_to else None,
        },
        "disclaimer": DISCLAIMER,
        "items": [],
    }
