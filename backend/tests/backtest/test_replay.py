from __future__ import annotations

from app.backtest.replay import replay_series, summarize
from app.backtest.spec import PatternSpec, overlay_settings
from app.config import Settings
from app.market.models import Candle


def rising_series(n: int = 40, base_high: float = 100.0, t0: int = 1_700_000_000):
    candles: list[Candle] = []
    for i in range(n):
        if i < 24:
            h, l, o, c, vol = base_high, base_high - 10, base_high - 5, base_high - 4, 1000
        elif i == 24:
            h, l, o, c, vol = base_high + 6, base_high - 10, base_high - 1, base_high + 5, 5000
        else:
            # grind toward a generous target after detect
            px = base_high + 5 + (i - 24) * 0.8
            h, l, o, c, vol = px + 0.4, px - 0.4, px - 0.1, px, 2000
        candles.append(Candle(t0 + i * 300, o, h, l, c, vol))
    return candles


def _spec(**kwargs):
    raw = {
        "symbols": ["NSE_EQ|X"],
        "timeframes": ["5m"],
        "patternTypes": ["breakout"],
        "fromDate": "2023-11-01",
        "toDate": "2023-11-30",
        "targetR": 2.0,
        "trade": {"enabled": True, "product": "CNC", "qty": 1},
        "tradingSymbols": {"NSE_EQ|X": "X"},
    }
    raw.update(kwargs)
    return PatternSpec.from_dict(raw)


def test_overlay_changes_atr_targets_on_clone_only():
    base = Settings()
    before_bo = float(base.breakout["success_atr_mult_without_retest"])
    before_pin = float(base.pinbar["success_atr_mult"])
    spec = _spec(targetR=1.5)
    over = overlay_settings(base, spec)
    assert float(over.breakout["success_atr_mult_without_retest"]) == 1.5
    assert float(over.breakdown["success_atr_mult_without_retest"]) == 1.5
    assert float(over.pinbar["success_atr_mult"]) == 1.5
    assert float(over.engulfing["success_atr_mult"]) == 1.5
    assert float(over.inside_bar["success_atr_mult"]) == 1.5
    assert float(over.structure["success_atr_mult"]) == 1.5
    assert float(over.volume_breakout["success_atr_mult"]) == 1.5
    assert float(over.double["success_atr_mult"]) == 1.5
    assert over.double["target_mode"] == "atr"
    assert float(over.head_shoulders["success_atr_mult"]) == 1.5
    assert over.head_shoulders["target_mode"] == "atr"
    assert float(base.breakout["success_atr_mult_without_retest"]) == before_bo
    assert float(base.pinbar["success_atr_mult"]) == before_pin
    assert base.double["target_mode"] == "measured"


def test_omit_target_r_keeps_live_defaults():
    base = Settings()
    spec = _spec()
    spec.target_r = None
    over = overlay_settings(base, spec)
    assert over.breakout["success_atr_mult_without_retest"] == base.breakout[
        "success_atr_mult_without_retest"
    ]
    assert over.pinbar["success_atr_mult"] == base.pinbar["success_atr_mult"]
    assert over.double["target_mode"] == base.double["target_mode"]


def test_replay_detects_breakout_and_records_trade():
    settings = Settings()
    spec = _spec()
    candles = rising_series()
    setups, trades = replay_series(
        settings=settings,
        spec=spec,
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    assert any(p.pattern_type.value == "breakout" for p in setups)
    filled = [t for t in trades if t.outcome and t.outcome != "no_fill"]
    assert filled, "expected at least one simulated fill"
    result = summarize(spec, setups, trades)
    assert result.summary["setups"] >= 1
    assert "pnl" in result.summary
    assert "pnlNet" in result.summary
    assert result.summary["pnlPct"] is None or isinstance(result.summary["pnlPct"], float)
    if filled:
        assert result.trades[0].get("pnl") is not None
        assert "pnlPct" in result.trades[0]
        assert filled[0].pnl_net is not None
        assert isinstance(result.summary["pnlNet"], (int, float))
        assert result.trades[0].get("pnlNet") == filled[0].pnl_net
        assert result.summary["pnl"] != result.summary["pnlNet"]
        assert filled[0].charges_total not in (None, 0)
        assert "avgRNet" in result.summary
        assert "tradeWrNet" in result.summary


def test_warmup_bars_do_not_create_detects_before_from_date():
    """Pre-fromDate bars feed indicators only; they must not become setups/trades."""
    settings = Settings()
    t0 = 1_700_000_000  # 2023-11-14
    candles = rising_series(n=80, t0=t0)
    spec = _spec(fromDate="2023-11-20", toDate="2023-12-31")
    setups, trades = replay_series(
        settings=settings,
        spec=spec,
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    from datetime import date as _date

    from app.market.ingest import session_start_epoch

    want_from = session_start_epoch(_date(2023, 11, 20))
    assert not any(int(p.detect_candle_time) < want_from for p in setups)
    assert not any(int(t.detect_time) < want_from for t in trades)
    # This fixture's breakout is on 14 Nov, before fromDate → nothing to trade.
    assert setups == []
    assert trades == []


def test_require_retest_excludes_never_retested_without_delaying_fill():
    settings = Settings()
    candles = rising_series()
    _, raw = replay_series(
        settings=settings,
        spec=_spec(),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    _, filtered = replay_series(
        settings=settings,
        spec=_spec(requireRetest=True),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    assert [t for t in raw if t.entry_time]
    assert [t for t in filtered if t.entry_time] == []


def _retest_then_reclaim_series():
    t0 = 1_700_000_000
    candles: list[Candle] = []
    base_high = 100.0
    for i in range(25):
        if i < 24:
            h, l, o, c, vol = base_high, base_high - 10, base_high - 5, base_high - 4, 1000
        else:
            h, l, o, c, vol = base_high + 6, base_high - 10, base_high - 1, base_high + 5, 5000
        candles.append(Candle(t0 + i * 300, o, h, l, c, vol))
    detect = candles[-1]
    candles.append(
        Candle(detect.time + 300, detect.close + 0.4, detect.close + 0.6, detect.close + 0.2, detect.close + 0.3, 2000)
    )
    candles.append(Candle(detect.time + 600, 101.0, 101.2, 100.1, 100.8, 1800))
    candles.append(Candle(detect.time + 900, 104.0, 106.0, 103.5, detect.close + 0.5, 1600))
    return candles, detect


def test_require_reclaimed_excludes_never_reclaimed_without_delaying_fill():
    settings = Settings()
    candles = rising_series()
    _, raw = replay_series(
        settings=settings,
        spec=_spec(),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    _, filtered = replay_series(
        settings=settings,
        spec=_spec(requireReclaimed=True),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    assert [t for t in raw if t.entry_time]
    assert [t for t in filtered if t.entry_time] == []
    assert PatternSpec.from_dict(_spec(requireReclaimed=True).to_dict()).require_reclaimed is True


def test_require_reclaimed_keeps_next_open_fill_when_setup_reclaims():
    candles, detect = _retest_then_reclaim_series()
    _, trades = replay_series(
        settings=Settings(),
        spec=_spec(requireReclaimed=True),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    filled = [t for t in trades if t.fill_entry is not None]
    assert filled
    assert filled[0].entry_time == detect.time + 300
    assert filled[0].flag_entry_reached is True
    assert filled[0].flag_retested is True


def test_require_retest_keeps_next_open_fill_when_setup_retests():
    candles, detect = _retest_then_reclaim_series()
    _, trades = replay_series(
        settings=Settings(),
        spec=_spec(requireRetest=True, requireConfirmed=True),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    filled = [t for t in trades if t.fill_entry is not None]
    assert filled
    assert filled[0].entry_time == detect.time + 300
    assert filled[0].flag_retested is True
    assert filled[0].flag_confirmed is True


def test_retest_flag_updates_after_entry():
    """Entry is still next open; a later dip sets retest, then reclaim on close > entry."""
    t0 = 1_700_000_000
    candles: list[Candle] = []
    base_high = 100.0
    for i in range(25):
        if i < 24:
            h, l, o, c, vol = base_high, base_high - 10, base_high - 5, base_high - 4, 1000
        else:
            h, l, o, c, vol = base_high + 6, base_high - 10, base_high - 1, base_high + 5, 5000
        candles.append(Candle(t0 + i * 300, o, h, l, c, vol))
    detect = candles[-1]
    # Next bar: fill at open above stop/ref; stay above so the trade is not stopped.
    candles.append(
        Candle(detect.time + 300, detect.close + 0.4, detect.close + 0.6, detect.close + 0.2, detect.close + 0.3, 2000)
    )
    # Later bar: dip into the retest band, close still above reference.
    candles.append(
        Candle(detect.time + 600, 101.0, 101.2, 100.1, 100.8, 1800)
    )
    # After retest, close back through the detect entry (reclaim). Fill is still next open.
    candles.append(
        Candle(detect.time + 900, 104.0, 106.0, 103.5, detect.close + 0.5, 1600)
    )
    settings = Settings()
    setups, trades = replay_series(
        settings=settings,
        spec=_spec(trade={"enabled": True, "product": "CNC", "qty": 1}),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    filled = [t for t in trades if t.fill_entry is not None]
    assert filled
    trade = filled[0]
    assert trade.entry_time == detect.time + 300
    assert abs(trade.fill_entry - (detect.close + 0.4)) < 1e-9
    assert any(p.flag_retested for p in setups)
    assert trade.flag_retested is True
    assert trade.flag_entry_reached is True


def test_lower_target_can_change_outcomes():
    settings = Settings()
    candles = rising_series()
    a_setups, a_trades = replay_series(
        settings=settings,
        spec=_spec(targetR=2.0),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    b_setups, b_trades = replay_series(
        settings=settings,
        spec=_spec(targetR=1.0),
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        candles=candles,
        close_minutes=930,
        mis_hhmm="15:20",
    )
    a_targets = {round(p.target_level, 4) for p in a_setups if p.target_level}
    b_targets = {round(p.target_level, 4) for p in b_setups if p.target_level}
    assert a_setups and b_setups
    assert a_targets != b_targets
    a_fill = [t for t in a_trades if t.outcome and t.outcome != "no_fill"]
    b_fill = [t for t in b_trades if t.outcome and t.outcome != "no_fill"]
    assert a_fill and b_fill
    assert {round(t.target, 4) for t in a_fill} != {round(t.target, 4) for t in b_fill}
    assert [t.outcome for t in a_fill] != [t.outcome for t in b_fill]
    by_id = {str(p.id): p for p in a_setups}
    for t in a_fill:
        p = by_id.get(t.instance_id)
        assert p is not None
        assert round(p.target_level, 4) == round(t.target, 4)
