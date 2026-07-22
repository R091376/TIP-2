from app.market.candle_engine import CandleEngine
from app.market.models import Tick


def test_close_stale():
    engine = CandleEngine()
    # open a candle in the past relative to a far-future "now"
    t_ms = 1_000_000_000_000
    engine.process_tick(Tick("K", 100.0, 100, t_ms), "5m")
    assert engine.get_current_candle("K", "5m") is not None
    # far later
    n = engine.close_stale_open_candles(t_ms + 3600_000)
    assert n >= 1
    assert engine.get_current_candle("K", "5m") is None
    assert len(engine.get_closed_candles("K", "5m")) >= 1
