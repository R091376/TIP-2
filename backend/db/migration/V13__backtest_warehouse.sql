-- Candle warehouse (any NSE instrument, not watchlist-FK) + backtest run/trade rows.
-- Replay never writes into pattern_instances / pattern_events / pattern_outcomes.

CREATE TABLE market_candles (
    instrument_key TEXT NOT NULL,
    timeframe      TEXT NOT NULL,
    time           BIGINT NOT NULL,
    open           DOUBLE PRECISION NOT NULL,
    high           DOUBLE PRECISION NOT NULL,
    low            DOUBLE PRECISION NOT NULL,
    close          DOUBLE PRECISION NOT NULL,
    volume         BIGINT NOT NULL DEFAULT 0,
    source         TEXT NOT NULL DEFAULT 'historical',
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (instrument_key, timeframe, time),
    CONSTRAINT chk_market_candles_tf
        CHECK (timeframe IN ('1m', '5m', '15m', '1h', '4h', '1d')),
    CONSTRAINT chk_market_candles_source
        CHECK (source IN ('historical', 'live', 'backfill'))
);

CREATE INDEX idx_market_candles_series
    ON market_candles (instrument_key, timeframe, time);

CREATE TABLE market_candle_coverage (
    instrument_key TEXT NOT NULL,
    timeframe      TEXT NOT NULL,
    from_time      BIGINT NOT NULL,
    to_time        BIGINT NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (instrument_key, timeframe)
);

CREATE TABLE backtest_runs (
    id            UUID PRIMARY KEY,
    created_by    TEXT NOT NULL,
    status        TEXT NOT NULL,
    spec_json     JSONB NOT NULL,
    error_message TEXT,
    summary_json  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    CONSTRAINT chk_backtest_runs_status
        CHECK (status IN ('queued', 'running', 'done', 'failed'))
);

CREATE INDEX idx_backtest_runs_created ON backtest_runs (created_at DESC);

CREATE TABLE backtest_trades (
    id             UUID PRIMARY KEY,
    run_id         UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    symbol_id      TEXT NOT NULL,
    trading_symbol TEXT,
    timeframe      TEXT NOT NULL,
    pattern_type   TEXT NOT NULL,
    direction      TEXT NOT NULL,
    detect_time    BIGINT NOT NULL,
    entry_time     BIGINT,
    exit_time      BIGINT,
    entry          DOUBLE PRECISION,
    stop           DOUBLE PRECISION,
    target         DOUBLE PRECISION,
    fill_entry     DOUBLE PRECISION,
    fill_exit      DOUBLE PRECISION,
    outcome        TEXT,
    r_multiple     DOUBLE PRECISION,
    pnl            DOUBLE PRECISION,
    qty            INTEGER NOT NULL DEFAULT 1,
    flag_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    flag_retested  BOOLEAN NOT NULL DEFAULT FALSE,
    volume_ok      BOOLEAN NOT NULL DEFAULT FALSE,
    mfe_r          DOUBLE PRECISION,
    mae_r          DOUBLE PRECISION,
    instance_id    TEXT
);

CREATE INDEX idx_backtest_trades_run ON backtest_trades (run_id);
