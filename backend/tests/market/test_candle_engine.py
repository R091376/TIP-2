from app.market.candle_engine import CandleEngine
from app.market.models import Candle, Tick


def test_process_tick_builds_ohlc():
    engine = CandleEngine()
    # 09:15 IST on 2026-07-10 ≈ fixed boundary
    # Use consecutive ticks in same 5m bucket
    t0 = 1752115500000  # arbitrary ms; engine floors by zone
    engine.process_tick(Tick("NSE_EQ|X", 100.0, 1000, t0), "5m")
    engine.process_tick(Tick("NSE_EQ|X", 105.0, 1100, t0 + 10_000), "5m")
    engine.process_tick(Tick("NSE_EQ|X", 99.0, 1200, t0 + 20_000), "5m")
    engine.process_tick(Tick("NSE_EQ|X", 102.0, 1300, t0 + 30_000), "5m")
    cur = engine.get_current_candle("NSE_EQ|X", "5m")
    assert cur is not None
    assert cur.open == 100.0
    assert cur.high == 105.0
    assert cur.low == 99.0
    assert cur.close == 102.0
    # first vtt initializes to 0 delta; subsequent deltas 100 each
    assert cur.volume == 300


def test_seed_and_get_all():
    engine = CandleEngine()
    candles = [
        Candle(1, 1, 1, 1, 1, 1),
        Candle(2, 2, 2, 2, 2, 2),
    ]
    engine.seed("K", "5m", candles)
    all_c = engine.get_all_candles("K", "5m")
    assert len(all_c) >= 1
