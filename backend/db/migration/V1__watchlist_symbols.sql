-- KD27: durable watchlist with soft-delete for pattern/journal joins after remove.
CREATE TABLE watchlist_symbols (
    symbol_id         TEXT PRIMARY KEY,          -- Upstox instrument_key
    trading_symbol    TEXT NOT NULL,
    exchange          TEXT NOT NULL,
    segment           TEXT NOT NULL,
    instrument_type   TEXT NOT NULL,
    display_name      TEXT,
    added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at        TIMESTAMPTZ,               -- set on soft-delete; NULL while active
    is_active         BOOLEAN NOT NULL DEFAULT true,
    bootstrap_status  TEXT NOT NULL DEFAULT 'PENDING',
    bootstrap_error   TEXT
);

-- Only one active row per trading symbol; soft-deleted rows may share the same symbol
CREATE UNIQUE INDEX uq_watchlist_active_trading_symbol
    ON watchlist_symbols (lower(trading_symbol))
    WHERE is_active = true;

CREATE INDEX idx_watchlist_active
    ON watchlist_symbols (is_active)
    WHERE is_active = true;

CREATE INDEX idx_watchlist_active_added_at
    ON watchlist_symbols (added_at ASC)
    WHERE is_active = true;
